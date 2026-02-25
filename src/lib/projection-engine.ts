import {
  startOfDay,
  endOfDay,
  eachDayOfInterval,
  eachWeekOfInterval,
  eachMonthOfInterval,
  format,
  isBefore,
  isAfter,
  isSameDay,
  addDays,
} from "date-fns";
import { expandRecurrence } from "./recurrence";
import type { ProjectedTransaction, ProjectionDay, ProjectionResult, Granularity } from "@/types/projection";
import type { IAccount } from "@/models/Account";
import type { ITransaction } from "@/models/Transaction";

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
  const today = startOfDay(new Date());
  const start = startOfDay(startDate);
  const end = startOfDay(endDate);

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
    const tDate = startOfDay(new Date(t.date));
    if (!isBefore(tDate, start) && !isAfter(tDate, end)) {
      allProjected.push({
        date: format(tDate, "yyyy-MM-dd"),
        amount: t.amount,
        description: t.description,
        accountId: t.accountId.toString(),
        type: t.type,
        categoryTags: t.categoryTags,
        isProjected: false,
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
      const dateStr = format(startOfDay(d), "yyyy-MM-dd");
      const isPast = isBefore(d, today) || isSameDay(d, today);
      allProjected.push({
        date: dateStr,
        amount: t.amount,
        description: t.description,
        accountId: t.accountId.toString(),
        type: t.type,
        categoryTags: t.categoryTags,
        isProjected: !isPast,
        sourceTransactionId: t._id.toString(),
      });
    }
  }

  // Filter by account if needed
  const filteredProjected = filterAccountId
    ? allProjected.filter((t) => t.accountId === filterAccountId)
    : allProjected;

  // Build day-by-day timeline
  const days = eachDayOfInterval({ start, end });
  const currentBalances: Record<string, number> = {};
  for (const a of targetAccounts) {
    currentBalances[a._id.toString()] = a.balance;
  }

  // Track which accounts are debt/credit-card so we can cap payoff payments
  const debtAccountIds = new Set(
    targetAccounts
      .filter((a) => a.type === "credit_card" || a.type === "debt")
      .map((a) => a._id.toString())
  );

  // Calculate starting balances by rewinding from today
  // For past dates: reverse transactions between start and today
  // For future dates: forward from today
  const startBalances: Record<string, number> = { ...currentBalances };

  // Get transactions between start and today to compute rewound balance
  if (isBefore(start, today)) {
    const txBetweenStartAndToday = filteredProjected.filter((t) => {
      const d = new Date(t.date);
      return !isBefore(d, start) && (isBefore(d, today) || isSameDay(d, today));
    });

    // Rewind from current balance by reversing these transactions
    for (const t of txBetweenStartAndToday) {
      const accountId = t.accountId;
      if (startBalances[accountId] !== undefined) {
        if (t.type === "credit") {
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

  for (const day of days) {
    const dateStr = format(day, "yyyy-MM-dd");
    const dayTx = filteredProjected.filter((t) => t.date === dateStr);

    for (const t of dayTx) {
      const accountId = t.accountId;
      if (runningBalances[accountId] === undefined) continue;

      if (t.type === "credit" && debtAccountIds.has(accountId)) {
        const currentBalance = runningBalances[accountId];
        if (currentBalance >= 0) {
          // Debt already paid off — skip this payment
          t.amount = 0;
        } else {
          // Cap final payment at the remaining owed amount
          const owed = -currentBalance;
          if (t.amount > owed) t.amount = owed;
          runningBalances[accountId] += t.amount;
        }
      } else if (t.type === "credit") {
        runningBalances[accountId] += t.amount;
      } else {
        runningBalances[accountId] -= t.amount;
      }
    }

    timeline.push({
      date: dateStr,
      balances: { ...runningBalances },
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
      const periodDays = timeline.filter((d) => {
        const date = new Date(d.date);
        return !isBefore(date, interval.start) && !isAfter(date, interval.end);
      });

      const allTx = periodDays.flatMap((d) => d.transactions);
      const lastDay = periodDays[periodDays.length - 1];

      return {
        date: format(interval.start, "yyyy-MM-dd"),
        balances: lastDay?.balances || {},
        transactions: allTx,
      };
    });
  }

  // Summary
  let totalIncome = 0;
  let totalExpenses = 0;
  for (const t of filteredProjected) {
    if (t.type === "credit") totalIncome += t.amount;
    else totalExpenses += t.amount;
  }

  const lastDay = timeline[timeline.length - 1];

  return {
    timeline: aggregatedTimeline,
    summary: {
      totalIncome,
      totalExpenses,
      netChange: totalIncome - totalExpenses,
      startBalances,
      endBalances: lastDay?.balances || {},
    },
  };
}
