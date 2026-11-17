import { addDays } from "date-fns";
import { expandRecurrence } from "./recurrence";
import { amountOn, type AmountStep } from "./amount-schedule";
import { blendedApr, monthlyInterest, rapMonthEnd } from "./interest";
import { sameDayOrder, type OrderedTransaction } from "./same-day-order";
import {
  asDate,
  toDateStr as toUTCDateStr,
  fromDateStr,
  localTodayStr,
  monthBounds,
  weekBounds,
  type DateRangeStr,
} from "./dates";
import type { ProjectedTransaction, ProjectionDay, ProjectionResult, ProjectionAlert, Granularity } from "@/types/finance/projection";

/** ~100 years; guards against runaway day loops from extreme date params */
const MAX_PROJECTION_DAYS = 36_600;

type Id = { toString(): string };

/** The account properties the engine reads (satisfied by plain documents and Mongoose documents). */
export interface EngineAccount {
  _id: Id;
  type: "bank" | "credit_card" | "debt";
  balance: number;
  creditLimit?: number;
  isArchived?: boolean;
  apr?: number;
  subLoans?: { name: string; balance: number; apr: number }[];
  rap?: { enabled: boolean };
}

/** The transaction properties the engine reads; dates may be `Date` or ISO strings. */
export interface EngineTransaction {
  _id: Id;
  amount: number;
  date: Date | string;
  description: string;
  accountId: Id;
  toAccountId?: Id;
  type: "credit" | "debit" | "transfer";
  isRecurring: boolean;
  recurrenceRule?: {
    frequency: "daily" | "weekly" | "biweekly" | "monthly" | "semi_monthly" | "annually" | "custom";
    interval?: number;
    startDate: Date | string;
    endDate?: Date | string | null;
    dayOfWeek?: number;
    dayOfMonth?: number;
    daysOfMonth?: number[];
  };
  amountSchedule?: AmountStep[];
  categoryTags: string[];
  balanceApplied: boolean;
  /** Breaks same-day ties between entries of one kind (oldest first); absent sorts last */
  createdAt?: Date | string;
}

interface ProjectionInput {
  accounts: EngineAccount[];
  transactions: EngineTransaction[];
  startDate: Date;
  endDate: Date;
  granularity?: Granularity;
  filterAccountId?: string;
  /** Calendar date treated as today (YYYY-MM-DD); defaults to the local date */
  today?: string;
}

/** State handed from the lead-in run (today → window start) to the window run */
interface Carry {
  balances: Record<string, number>;
  paidThisMonth: Record<string, number>;
  month: string;
}

export function buildProjection(input: ProjectionInput): ProjectionResult {
  const today = input.today ?? localTodayStr();
  const startStr = toUTCDateStr(input.startDate);
  // A window that starts in the future begins from the balances projected for
  // that date, so everything between today and the start is simulated first
  let carry: Carry | undefined;
  if (startStr > today) {
    carry = runProjection({
      ...input,
      today,
      startDate: fromDateStr(today),
      endDate: addDays(fromDateStr(startStr), -1),
      granularity: "daily",
      filterAccountId: undefined,
    }).carry;
  }
  const { timeline, alerts, summary } = runProjection({ ...input, today }, carry);
  return { timeline, alerts, summary };
}

function runProjection(input: ProjectionInput, carry?: Carry): ProjectionResult & { carry: Carry } {
  const { accounts, transactions, startDate, endDate, granularity = "daily", filterAccountId } = input;
  const todayStr = input.today ?? localTodayStr();
  const startStr = toUTCDateStr(startDate);
  const endStr = toUTCDateStr(endDate);
  // Noon-UTC dates for date-fns interval generation (avoids timezone boundary issues)
  const start = fromDateStr(startStr);
  const end = fromDateStr(endStr);
  if (end.getTime() - start.getTime() > MAX_PROJECTION_DAYS * 86_400_000) {
    throw new RangeError(`Projection window exceeds ${MAX_PROJECTION_DAYS} days`);
  }

  // Archived accounts are excluded from totals unless explicitly requested.
  // They still take part in balance tracking below so transfers stay consistent.
  const targetAccounts = filterAccountId
    ? accounts.filter((a) => a._id.toString() === filterAccountId)
    : accounts.filter((a) => !a.isArchived);

  // Credit card and debt accounts: balances count what is owed (isDebtType); a credit there is a
  // payment, so it caps at what is owed and is ordered with transfers within a day
  const debtAccountIds = new Set(
    accounts
      .filter((a) => a.type === "credit_card" || a.type === "debt")
      .map((a) => a._id.toString())
  );

  // Separate recurring vs one-time
  const oneTimeTransactions = transactions.filter((t) => !t.isRecurring);
  const recurringTransactions = transactions.filter((t) => t.isRecurring && t.recurrenceRule);

  // Expand recurrences into projected transactions
  const allProjected: ProjectedTransaction[] = [];
  // Each entry's same-day order key: its source transaction's kind and account, createdAt and _id.
  // `date` is the day the entry falls on (an occurrence's day, not its rule's stored start)
  const orderKey = new WeakMap<ProjectedTransaction, OrderedTransaction>();
  const keyOf = (t: EngineTransaction, day: string): OrderedTransaction => ({
    _id: t._id,
    date: day,
    type: t.type,
    createdAt: t.createdAt,
    onDebtAccount: debtAccountIds.has(t.accountId.toString()),
  });

  // Add one-time transactions
  for (const t of oneTimeTransactions) {
    const dateStr = toUTCDateStr(t.date);
    if (dateStr >= startStr && dateStr <= endStr) {
      const entry: ProjectedTransaction = {
        date: dateStr,
        amount: t.amount,
        description: t.description,
        accountId: t.accountId.toString(),
        toAccountId: t.toAccountId?.toString(),
        type: t.type,
        categoryTags: t.categoryTags,
        isProjected: false,
        balanceApplied: t.balanceApplied,
        sourceTransactionId: t._id.toString(),
      };
      orderKey.set(entry, keyOf(t, dateStr));
      allProjected.push(entry);
    }
  }

  // Expand recurring transactions
  for (const t of recurringTransactions) {
    const rule = t.recurrenceRule!;
    const dates = expandRecurrence(
      {
        frequency: rule.frequency,
        interval: rule.interval,
        startDate: asDate(rule.startDate).toISOString(),
        endDate: rule.endDate ? asDate(rule.endDate).toISOString() : null,
        dayOfWeek: rule.dayOfWeek,
        dayOfMonth: rule.dayOfMonth,
        daysOfMonth: rule.daysOfMonth,
      },
      start,
      end
    );

    for (const d of dates) {
      const dateStr = toUTCDateStr(d);
      const isPast = dateStr <= todayStr;
      const entry: ProjectedTransaction = {
        date: dateStr,
        amount: amountOn(t.amount, t.amountSchedule, dateStr),
        description: t.description,
        accountId: t.accountId.toString(),
        toAccountId: t.toAccountId?.toString(),
        type: t.type,
        categoryTags: t.categoryTags,
        isProjected: !isPast,
        isRecurring: true,
        // Past occurrences are already in stored balances: payment plans post them,
        // and other recurring items are kept current by the user
        balanceApplied: isPast,
        sourceTransactionId: t._id.toString(),
      };
      orderKey.set(entry, keyOf(t, dateStr));
      allProjected.push(entry);
    }
  }

  // Filter by account if needed — include transfers where account is source OR destination. Only a
  // transfer has a destination: a debit or credit still holding an old toAccountId is not counted there
  const filteredProjected = filterAccountId
    ? allProjected.filter((t) => t.accountId === filterAccountId || (t.type === "transfer" && t.toAccountId === filterAccountId))
    : allProjected;

  // Build day-by-day timeline
  // Step noon-UTC days (eachDayOfInterval snaps to local midnight, which is a
  // different UTC calendar day in timezones east of UTC)
  const days: Date[] = [];
  for (let d = start; toUTCDateStr(d) <= endStr; d = addDays(d, 1)) days.push(d);

  // Track balances for ALL accounts (transfers need both source and dest)
  const currentBalances: Record<string, number> = {};
  for (const a of accounts) {
    const id = a._id.toString();
    currentBalances[id] = carry?.balances[id] ?? a.balance;
  }

  // Build credit limits map for credit card accounts
  const creditLimits: Record<string, number> = {};
  for (const a of accounts) {
    if (a.type === "credit_card" && a.creditLimit) {
      creditLimits[a._id.toString()] = a.creditLimit;
    }
  }

  // Calculate starting balances by rewinding from current DB balances.
  // Only rewind transactions that actually affected DB balances (balanceApplied === true).
  // Future non-recurring transactions have balanceApplied = false and don't need rewinding.
  // Recurring transactions don't update DB balances, so we only rewind their past occurrences.
  const startBalances: Record<string, number> = { ...currentBalances };

  const txToRewind = filteredProjected.filter((t) => {
    if (t.date < startStr) return false;
    // One-time transactions: only rewind if balance was actually applied to DB
    if (!t.isProjected) return t.balanceApplied === true;
    // Projected (recurring future): only rewind past/today occurrences
    return t.date <= todayStr;
  });

  for (const t of txToRewind) {
    if (t.type === "transfer" && t.toAccountId) {
      const isDebtSource = debtAccountIds.has(t.accountId);
      const isDebtDest = debtAccountIds.has(t.toAccountId);
      if (startBalances[t.accountId] !== undefined) {
        startBalances[t.accountId] += isDebtSource ? -t.amount : t.amount;
      }
      if (startBalances[t.toAccountId] !== undefined) {
        startBalances[t.toAccountId] += isDebtDest ? t.amount : -t.amount;
      }
    } else {
      const accountId = t.accountId;
      if (startBalances[accountId] !== undefined) {
        const isDebtAccount = debtAccountIds.has(accountId);
        if (t.type === "credit" && isDebtAccount) {
          // Reverse: credit on debt reduced balance, so add back
          startBalances[accountId] += t.amount;
        } else if (t.type === "debit" && isDebtAccount) {
          // Reverse: debit on debt increased balance, so subtract
          startBalances[accountId] -= t.amount;
        } else if (t.type === "credit") {
          startBalances[accountId] -= t.amount;
        } else {
          startBalances[accountId] += t.amount;
        }
      }
    }
  }

  // Walk forward building timeline
  const runningBalances: Record<string, number> = { ...startBalances };
  const timeline: ProjectionDay[] = [];
  const alerts: ProjectionAlert[] = [];

  // Bank account IDs for zero-balance enforcement
  const bankAccountIds = new Set(
    accounts
      .filter((a) => a.type === "bank")
      .map((a) => a._id.toString())
  );

  // Interest-bearing liabilities: blended sub-loan rate, else the account APR
  const interestAccounts = accounts
    .filter((a) => a.type === "credit_card" || a.type === "debt")
    .map((a) => ({
      id: a._id.toString(),
      apr: blendedApr(a.subLoans, a.apr),
      rap: !!a.rap?.enabled,
    }))
    .filter((a) => a.apr > 0);
  // Payments into each liability during the current calendar month (for RAP)
  let paidThisMonth: Record<string, number> = { ...carry?.paidThisMonth };
  let currentMonth = carry?.month ?? "";
  // Synthetic interest / RAP match lines (for summary totals)
  const syntheticTx: ProjectedTransaction[] = [];

  // Insight trackers (target accounts only)
  const targetIds = new Set(targetAccounts.map((a) => a._id.toString()));
  const targetBankIds = targetAccounts.filter((a) => a.type === "bank").map((a) => a._id.toString());
  const targetCardIds = targetAccounts.filter((a) => a.type === "credit_card").map((a) => a._id.toString());
  // Running totals stamped on each transaction once it has been applied
  const sumOf = (ids: string[]) => ids.reduce((sum, id) => sum + (runningBalances[id] ?? 0), 0);
  const ledgerNow = () => ({ bank: sumOf(targetBankIds), credit: sumOf(targetCardIds) });
  let lowestCash: { amount: number; date: string } | null = null;
  // Liabilities owing at the start: date they first reach zero, null if not within the window
  const payoffDates: Record<string, string | null> = {};
  for (const id of targetIds) {
    if (debtAccountIds.has(id) && (startBalances[id] ?? 0) > 0) payoffDates[id] = null;
  }
  let debtPayments = 0;

  for (const day of days) {
    const dateStr = toUTCDateStr(day);
    // Income first: credits on bank accounts, then debits (card charges included), then payments
    // (transfers and credits on card or debt accounts, together), whether one-time or recurring,
    // then by the source's createdAt and _id (same-day-order.ts). This order drives caps, payoffs,
    // alerts and the ledger below, and does not depend on the order the transactions arrived in.
    const dayTx = filteredProjected
      .filter((t) => t.date === dateStr)
      .sort((a, b) => sameDayOrder(orderKey.get(a)!, orderKey.get(b)!));
    if (dateStr.slice(0, 7) !== currentMonth) {
      currentMonth = dateStr.slice(0, 7);
      paidThisMonth = {};
    }

    // Payments toward a debt that is already cleared: left out of the timeline
    const dropped = new Set<ProjectedTransaction>();
    for (const t of dayTx) {
      const origAmount = t.amount;
      // Already reflected in stored balances (it happened): replay it in full.
      // Limits only decide what can happen from here on.
      const settled = t.balanceApplied === true;

      if (t.type === "transfer" && t.toAccountId) {
        let amount = t.amount;
        const isDebtSource = debtAccountIds.has(t.accountId);
        const isDebtDest = debtAccountIds.has(t.toAccountId);
        const isBankSource = bankAccountIds.has(t.accountId);
        let limitedBy: "credit_limit" | "insufficient_balance" | null = null;

        // Credit limit enforcement on source (positive balance = owed, available = limit - owed)
        if (!settled && creditLimits[t.accountId] !== undefined && runningBalances[t.accountId] !== undefined) {
          const availableCredit = creditLimits[t.accountId] - runningBalances[t.accountId];
          if (availableCredit <= 0) {
            amount = 0;
          } else {
            amount = Math.min(amount, availableCredit);
          }
          if (amount < origAmount) limitedBy = "credit_limit";
        }

        // Bank account zero-balance enforcement on source
        if (!settled && isBankSource && runningBalances[t.accountId] !== undefined) {
          const available = runningBalances[t.accountId];
          const before = amount;
          if (available <= 0) {
            amount = 0;
          } else {
            amount = Math.min(amount, available);
          }
          if (amount < before) limitedBy = "insufficient_balance";
        }

        // Debt payoff cap on destination (positive balance = owed)
        let paysOff = false;
        if (!settled && isDebtDest && runningBalances[t.toAccountId] !== undefined) {
          const owed = runningBalances[t.toAccountId];
          if (owed <= 0) {
            // Nothing left to pay: this payment simply does not happen
            t.amount = 0;
            dropped.add(t);
            continue;
          }
          amount = Math.min(amount, owed);
          paysOff = amount >= owed;
        }

        t.amount = amount;
        if (amount < origAmount) t.originalAmount = origAmount;
        const alertBase = {
          date: dateStr,
          description: t.description,
          accountId: t.accountId,
          toAccountId: t.toAccountId,
          originalAmount: origAmount,
          adjustedAmount: amount,
          sourceTransactionId: t.sourceTransactionId,
        };
        // A limit on the paying account cut the payment short
        if (limitedBy) alerts.push({ ...alertBase, reason: limitedBy });
        // The payment that clears the debt, dated when it actually happens
        if (paysOff) alerts.push({ ...alertBase, reason: "debt_paid_off" });

        // Update balances: debt/CC accounts use reversed sign
        if (runningBalances[t.accountId] !== undefined) {
          runningBalances[t.accountId] += isDebtSource ? amount : -amount;
        }
        if (runningBalances[t.toAccountId] !== undefined) {
          runningBalances[t.toAccountId] += isDebtDest ? -amount : amount;
        }
        if (isDebtDest) {
          paidThisMonth[t.toAccountId] = (paidThisMonth[t.toAccountId] ?? 0) + amount;
          if (targetIds.has(t.toAccountId)) debtPayments += amount;
        }
      } else {
        const accountId = t.accountId;
        if (runningBalances[accountId] === undefined) {
          t.ledger = ledgerNow();
          continue;
        }
        const isDebtAccount = debtAccountIds.has(accountId);
        const isBankAccount = bankAccountIds.has(accountId);

        if (t.type === "credit" && isDebtAccount) {
          // Credit (payment) on debt/CC: decreases what's owed (cap at owed amount)
          const owed = runningBalances[accountId];
          if (!settled && owed <= 0) {
            // Nothing left to pay: this payment simply does not happen
            t.amount = 0;
            dropped.add(t);
            continue;
          }
          if (!settled && t.amount > owed) t.amount = owed;
          runningBalances[accountId] -= t.amount;
          paidThisMonth[accountId] = (paidThisMonth[accountId] ?? 0) + t.amount;
          if (targetIds.has(accountId)) debtPayments += t.amount;
          if (t.amount < origAmount) t.originalAmount = origAmount;
          if (!settled && runningBalances[accountId] <= 0) {
            alerts.push({
              date: dateStr,
              description: t.description,
              accountId,
              originalAmount: origAmount,
              adjustedAmount: t.amount,
              reason: "debt_paid_off",
              sourceTransactionId: t.sourceTransactionId,
            });
          }
        } else if (t.type === "debit" && isDebtAccount) {
          // Debit (charge) on debt/CC: increases what's owed
          // Credit limit enforcement: cap charge at available credit
          if (!settled && creditLimits[accountId] !== undefined) {
            const availableCredit = creditLimits[accountId] - runningBalances[accountId];
            if (availableCredit <= 0) {
              t.amount = 0;
            } else {
              t.amount = Math.min(t.amount, availableCredit);
            }
            if (t.amount < origAmount) {
              t.originalAmount = origAmount;
              alerts.push({
                date: dateStr,
                description: t.description,
                accountId,
                originalAmount: origAmount,
                adjustedAmount: t.amount,
                reason: "credit_limit",
                sourceTransactionId: t.sourceTransactionId,
              });
            }
          }
          runningBalances[accountId] += t.amount;
        } else if (t.type === "credit") {
          runningBalances[accountId] += t.amount;
        } else if (t.type === "debit" && isBankAccount) {
          // Debit on bank: cap at available balance (don't go below 0)
          const available = runningBalances[accountId];
          if (settled) {
            // keep the full amount
          } else if (available <= 0) {
            t.amount = 0;
          } else {
            t.amount = Math.min(t.amount, available);
          }
          runningBalances[accountId] -= t.amount;
          if (t.amount < origAmount) {
            t.originalAmount = origAmount;
            alerts.push({
              date: dateStr,
              description: t.description,
              accountId,
              originalAmount: origAmount,
              adjustedAmount: t.amount,
              reason: "insufficient_balance",
              sourceTransactionId: t.sourceTransactionId,
            });
          }
        } else {
          runningBalances[accountId] -= t.amount;
        }
      }
      t.ledger = ledgerNow();
    }
    for (let i = dayTx.length - 1; i >= 0; i--) {
      if (dropped.has(dayTx[i])) dayTx.splice(i, 1);
    }

    // Month-end interest (future months only; past interest is already in DB balances)
    const isMonthEnd = toUTCDateStr(addDays(day, 1)).slice(5, 7) !== dateStr.slice(5, 7);
    if (isMonthEnd && dateStr > todayStr) {
      for (const a of interestAccounts) {
        const owed = runningBalances[a.id];
        if (owed === undefined || owed <= 0) continue;
        const interest = monthlyInterest(owed, a.apr);
        const paid = paidThisMonth[a.id] ?? 0;
        const { charged, match } = a.rap ? rapMonthEnd(interest, paid) : { charged: interest, match: 0 };
        runningBalances[a.id] += charged - match;

        const visible = !filterAccountId || filterAccountId === a.id;
        const base = { date: dateStr, accountId: a.id, isProjected: true, ledger: ledgerNow() };
        if (charged > 0) {
          const line: ProjectedTransaction = { ...base, amount: charged, description: "Interest", type: "debit", categoryTags: ["interest"] };
          syntheticTx.push(line);
          if (visible) dayTx.push(line);
        }
        if (match > 0) {
          const line: ProjectedTransaction = { ...base, amount: match, description: "RAP principal match", type: "credit", categoryTags: ["rap_match"] };
          syntheticTx.push(line);
          if (visible) dayTx.push(line);
        }
      }
    }

    // End-of-day insights: lowest combined cash/bank balance, and payoff dates
    if (targetBankIds.length > 0) {
      const cash = targetBankIds.reduce((sum, id) => sum + (runningBalances[id] ?? 0), 0);
      if (!lowestCash || cash < lowestCash.amount) lowestCash = { amount: cash, date: dateStr };
    }
    for (const id of Object.keys(payoffDates)) {
      if (payoffDates[id] === null && runningBalances[id] <= 0) payoffDates[id] = dateStr;
    }

    // Only include target account balances in output
    const outputBalances: Record<string, number> = {};
    for (const a of targetAccounts) {
      const id = a._id.toString();
      if (runningBalances[id] !== undefined) {
        outputBalances[id] = runningBalances[id];
      }
    }

    timeline.push({
      date: dateStr,
      balances: outputBalances,
      transactions: dayTx,
    });
  }

  // Aggregate by granularity if not daily
  let aggregatedTimeline = timeline;
  if (granularity === "weekly" || granularity === "monthly") {
    // Bucket boundaries derived from calendar-date strings (timezone-independent)
    const bucketOf = granularity === "weekly" ? weekBounds : monthBounds;
    const intervals: DateRangeStr[] = [];
    for (const d of timeline) {
      const last = intervals[intervals.length - 1];
      if (!last || d.date > last.endStr) intervals.push(bucketOf(d.date));
    }

    aggregatedTimeline = intervals.map((interval) => {
      const intervalStartStr = interval.startStr;
      const intervalEndStr = interval.endStr;
      const periodDays = timeline.filter((d) => {
        return d.date >= intervalStartStr && d.date <= intervalEndStr;
      });

      const allTx = periodDays.flatMap((d) => d.transactions);
      const lastDay = periodDays[periodDays.length - 1];

      return {
        date: intervalStartStr,
        balances: lastDay?.balances || {},
        transactions: allTx,
      };
    });
  }

  // Summary — skip transfers (internal movements don't count as income/expense)
  let totalIncome = 0;
  let totalExpenses = 0;
  const visibleSynthetic = syntheticTx.filter((t) => !filterAccountId || t.accountId === filterAccountId);
  for (const t of [...filteredProjected, ...visibleSynthetic]) {
    if (t.type === "transfer") continue;
    if (t.categoryTags.includes("rap_match")) continue; // principal forgiveness, not income
    if (t.type === "credit") totalIncome += t.amount;
    else totalExpenses += t.amount;
  }

  // Loan payments are transfers, so the totals above skip them. Count money sent to loan / debt
  // accounts on its own. Card payments stay out: card purchases are already expenses.
  const loanIds = new Set(accounts.filter((a) => a.type === "debt").map((a) => a._id.toString()));
  let loanPayments = 0;
  // Read from the timeline, which already leaves out payments dropped after a payoff
  for (const day of timeline) {
    for (const t of day.transactions) {
      if (t.type === "transfer" && t.toAccountId && loanIds.has(t.toAccountId)) loanPayments += t.amount;
    }
  }
  const loanInterest = visibleSynthetic
    .filter((t) => t.categoryTags.includes("interest") && loanIds.has(t.accountId))
    .reduce((sum, t) => sum + t.amount, 0);

  const lastDay = timeline[timeline.length - 1];

  return {
    timeline: aggregatedTimeline,
    alerts,
    summary: {
      totalIncome,
      totalExpenses,
      netChange: totalIncome - totalExpenses,
      startBalances: Object.fromEntries(
        targetAccounts.map((a) => [a._id.toString(), startBalances[a._id.toString()] ?? 0])
      ),
      endBalances: lastDay?.balances || {},
      lowestCash,
      payoffDates,
      interestCharged: visibleSynthetic
        .filter((t) => t.categoryTags.includes("interest"))
        .reduce((sum, t) => sum + t.amount, 0),
      debtPayments,
      loanPayments,
      // Interest is already an expense and the payment covers it, so it is only counted once
      totalOut: totalExpenses + Math.max(0, loanPayments - loanInterest),
    },
    carry: { balances: { ...runningBalances }, paidThisMonth, month: currentMonth },
  };
}
