import {
  eachDayOfInterval,
  eachWeekOfInterval,
  eachMonthOfInterval,
  addDays,
} from "date-fns";
import { expandRecurrence } from "./recurrence";
import type { ProjectedTransaction, ProjectionDay, ProjectionResult, ProjectionAlert, Granularity } from "@/types/projection";
import type { IAccount } from "@/models/Account";
import type { ITransaction } from "@/models/Transaction";

/** Extract UTC date string (yyyy-MM-dd) from any date, avoiding timezone shifts */
function toUTCDateStr(d: Date | string): string {
  return new Date(d).toISOString().slice(0, 10);
}

/** Create a Date at noon UTC for a given yyyy-MM-dd string, safe for date-fns in any timezone */
function fromDateStr(s: string): Date {
  return new Date(s + "T12:00:00.000Z");
}

interface ProjectionInput {
  accounts: IAccount[];
  transactions: ITransaction[];
  startDate: Date;
  endDate: Date;
  granularity?: Granularity;
  filterAccountId?: string;
}

export function buildProjection(input: ProjectionInput): ProjectionResult {
  const { accounts, transactions, startDate, endDate, granularity = "daily", filterAccountId } = input;
  const todayStr = toUTCDateStr(new Date());
  const startStr = toUTCDateStr(startDate);
  const endStr = toUTCDateStr(endDate);
  // Noon-UTC dates for date-fns interval generation (avoids timezone boundary issues)
  const start = fromDateStr(startStr);
  const end = fromDateStr(endStr);

  const targetAccounts = filterAccountId
    ? accounts.filter((a) => a._id.toString() === filterAccountId)
    : accounts;

  // Separate recurring vs one-time
  const oneTimeTransactions = transactions.filter((t) => !t.isRecurring);
  const recurringTransactions = transactions.filter((t) => t.isRecurring && t.recurrenceRule);

  // Expand recurrences into projected transactions
  const allProjected: ProjectedTransaction[] = [];

  // Add one-time transactions
  for (const t of oneTimeTransactions) {
    const dateStr = toUTCDateStr(t.date);
    if (dateStr >= startStr && dateStr <= endStr) {
      allProjected.push({
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
      });
    }
  }

  // Expand recurring transactions
  for (const t of recurringTransactions) {
    const rule = t.recurrenceRule!;
    const dates = expandRecurrence(
      {
        frequency: rule.frequency,
        interval: rule.interval,
        startDate: rule.startDate.toISOString(),
        endDate: rule.endDate?.toISOString() || null,
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
      allProjected.push({
        date: dateStr,
        amount: t.amount,
        description: t.description,
        accountId: t.accountId.toString(),
        toAccountId: t.toAccountId?.toString(),
        type: t.type,
        categoryTags: t.categoryTags,
        isProjected: !isPast,
        sourceTransactionId: t._id.toString(),
      });
    }
  }

  // Filter by account if needed — include transfers where account is source OR destination
  const filteredProjected = filterAccountId
    ? allProjected.filter((t) => t.accountId === filterAccountId || t.toAccountId === filterAccountId)
    : allProjected;

  // Build day-by-day timeline
  const days = eachDayOfInterval({ start, end });

  // Track balances for ALL accounts (transfers need both source and dest)
  const currentBalances: Record<string, number> = {};
  for (const a of accounts) {
    currentBalances[a._id.toString()] = a.balance;
  }

  // Track which accounts are debt/credit-card so we can cap payoff payments
  const debtAccountIds = new Set(
    accounts
      .filter((a) => a.type === "credit_card" || a.type === "debt")
      .map((a) => a._id.toString())
  );

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

  for (const day of days) {
    const dateStr = toUTCDateStr(day);
    const dayTx = filteredProjected.filter((t) => t.date === dateStr);

    for (const t of dayTx) {
      const origAmount = t.amount;

      if (t.type === "transfer" && t.toAccountId) {
        let amount = t.amount;
        const isDebtSource = debtAccountIds.has(t.accountId);
        const isDebtDest = debtAccountIds.has(t.toAccountId);
        const isBankSource = bankAccountIds.has(t.accountId);

        // Credit limit enforcement on source (positive balance = owed, available = limit - owed)
        if (creditLimits[t.accountId] !== undefined && runningBalances[t.accountId] !== undefined) {
          const availableCredit = creditLimits[t.accountId] - runningBalances[t.accountId];
          if (availableCredit <= 0) {
            amount = 0;
          } else {
            amount = Math.min(amount, availableCredit);
          }
        }

        // Bank account zero-balance enforcement on source
        if (isBankSource && runningBalances[t.accountId] !== undefined) {
          const available = runningBalances[t.accountId];
          if (available <= 0) {
            amount = 0;
          } else {
            amount = Math.min(amount, available);
          }
        }

        // Debt payoff cap on destination (positive balance = owed)
        if (isDebtDest && runningBalances[t.toAccountId] !== undefined) {
          const owed = runningBalances[t.toAccountId];
          if (owed <= 0) {
            amount = 0;
          } else {
            amount = Math.min(amount, owed);
          }
        }

        t.amount = amount;

        // Track alert if amount was reduced
        if (amount < origAmount) {
          t.originalAmount = origAmount;
          const reason =
            creditLimits[t.accountId] !== undefined
              ? "credit_limit" as const
              : isDebtDest
              ? "debt_paid_off" as const
              : "insufficient_balance" as const;
          alerts.push({
            date: dateStr,
            description: t.description,
            accountId: t.accountId,
            toAccountId: t.toAccountId,
            originalAmount: origAmount,
            adjustedAmount: amount,
            reason,
            sourceTransactionId: t.sourceTransactionId,
          });
        }

        // Update balances: debt/CC accounts use reversed sign
        if (runningBalances[t.accountId] !== undefined) {
          runningBalances[t.accountId] += isDebtSource ? amount : -amount;
        }
        if (runningBalances[t.toAccountId] !== undefined) {
          runningBalances[t.toAccountId] += isDebtDest ? -amount : amount;
        }
      } else {
        const accountId = t.accountId;
        if (runningBalances[accountId] === undefined) continue;
        const isDebtAccount = debtAccountIds.has(accountId);
        const isBankAccount = bankAccountIds.has(accountId);

        if (t.type === "credit" && isDebtAccount) {
          // Credit (payment) on debt/CC: decreases what's owed (cap at owed amount)
          const owed = runningBalances[accountId];
          if (owed <= 0) {
            t.amount = 0;
          } else {
            if (t.amount > owed) t.amount = owed;
            runningBalances[accountId] -= t.amount;
          }
          if (t.amount < origAmount) {
            t.originalAmount = origAmount;
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
          if (creditLimits[accountId] !== undefined) {
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
          if (available <= 0) {
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
    const intervals =
      granularity === "weekly"
        ? eachWeekOfInterval({ start, end }).map((weekStart) => ({
            start: weekStart,
            end: addDays(weekStart, 6),
          }))
        : eachMonthOfInterval({ start, end }).map((monthStart) => {
            const nextMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);
            return { start: monthStart, end: nextMonth };
          });

    aggregatedTimeline = intervals.map((interval) => {
      const intervalStartStr = toUTCDateStr(interval.start);
      const intervalEndStr = toUTCDateStr(interval.end);
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
  for (const t of filteredProjected) {
    if (t.type === "transfer") continue;
    if (t.type === "credit") totalIncome += t.amount;
    else totalExpenses += t.amount;
  }

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
    },
  };
}
