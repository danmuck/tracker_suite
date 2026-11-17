import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { postDuePayments } from "@/lib/finance/post-payments";
import Account from "@/models/finance/Account";
import Transaction from "@/models/finance/Transaction";
import { buildProjection } from "@/lib/finance/projection-engine";
import { format } from "date-fns";
import {
  fromDateStr,
  localTodayStr,
  monthBounds,
  toDateStr,
  weekBounds,
  yearBounds,
  type DateRangeStr,
} from "@/lib/finance/dates";
import type { SummaryView, SummaryResult, DaySummary, MonthSummary } from "@/types/finance/summary";

export async function GET(request: NextRequest) {
  try {
    await connectDB();
    await postDuePayments();
    const { searchParams } = new URL(request.url);

    const view = (searchParams.get("view") || "monthly") as SummaryView;
    const dateParam = searchParams.get("date");
    const accountId = searchParams.get("accountId") || undefined;
    // Treat the param as a calendar date: "yyyy-MM-dd" is taken as-is, a full ISO string by its UTC day
    const dateStr = !dateParam
      ? localTodayStr()
      : /^\d{4}-\d{2}-\d{2}$/.test(dateParam)
      ? dateParam
      : toDateStr(dateParam);

    let range: DateRangeStr;
    let periodLabel: string;

    switch (view) {
      case "weekly":
        range = weekBounds(dateStr);
        periodLabel = `Week of ${format(fromDateStr(range.startStr), "MMM d, yyyy")}`;
        break;
      case "monthly":
        range = monthBounds(dateStr);
        periodLabel = format(fromDateStr(dateStr), "MMMM yyyy");
        break;
      case "annual":
      default:
        range = yearBounds(dateStr);
        periodLabel = dateStr.slice(0, 4);
        break;
    }

    // Stored dates are UTC midnight, so query with UTC-midnight bounds (inclusive)
    const startDate = new Date(range.startStr);
    const endDate = new Date(range.endStr);

    const accounts = await Account.find();

    const query: Record<string, unknown> = {};
    if (accountId) query.accountId = accountId;

    const transactions = await Transaction.find({
      ...query,
      $or: [
        {
          isRecurring: { $ne: true },
          date: { $gte: startDate, $lte: endDate },
        },
        {
          isRecurring: true,
          "recurrenceRule.startDate": { $lte: endDate },
          $or: [
            { "recurrenceRule.endDate": null },
            { "recurrenceRule.endDate": { $exists: false } },
            { "recurrenceRule.endDate": { $gte: startDate } },
          ],
        },
      ],
    });

    const granularity = view === "annual" ? "monthly" : "daily";
    const projection = buildProjection({
      accounts: accounts as any,
      transactions: transactions as any,
      startDate: fromDateStr(range.startStr),
      endDate: fromDateStr(range.endStr),
      granularity,
      filterAccountId: accountId,
    });

    // Build category breakdown from all transactions in the projection
    const categoryAmounts: Record<string, number> = {};
    for (const day of projection.timeline) {
      for (const tx of day.transactions) {
        if (tx.type === "debit") {
          for (const tag of tx.categoryTags) {
            categoryAmounts[tag] = (categoryAmounts[tag] || 0) + tx.amount;
          }
          if (tx.categoryTags.length === 0) {
            categoryAmounts["other"] = (categoryAmounts["other"] || 0) + tx.amount;
          }
        }
      }
    }

    const totalExpenseAmount = Object.values(categoryAmounts).reduce((a, b) => a + b, 0);
    const categoryBreakdown = Object.entries(categoryAmounts)
      .map(([category, amount]) => ({
        category,
        amount,
        percentage: totalExpenseAmount > 0 ? amount / totalExpenseAmount : 0,
      }))
      .sort((a, b) => b.amount - a.amount);

    // Build days or months
    let days: DaySummary[] | undefined;
    let months: MonthSummary[] | undefined;

    if (view === "annual") {
      months = projection.timeline.map((entry) => {
        const d = fromDateStr(entry.date);
        const totalCredits = entry.transactions
          .filter((t) => t.type === "credit")
          .reduce((sum, t) => sum + t.amount, 0);
        const totalDebits = entry.transactions
          .filter((t) => t.type === "debit")
          .reduce((sum, t) => sum + t.amount, 0);

        return {
          month: Number(entry.date.slice(5, 7)) - 1,
          year: Number(entry.date.slice(0, 4)),
          label: format(d, "MMM yyyy"),
          totalCredits,
          totalDebits,
          transactionCount: entry.transactions.length,
          balances: entry.balances,
        };
      });
    } else {
      days = projection.timeline.map((entry) => ({
        date: entry.date,
        transactions: entry.transactions,
        balances: entry.balances,
        totalCredits: entry.transactions
          .filter((t) => t.type === "credit")
          .reduce((sum, t) => sum + t.amount, 0),
        totalDebits: entry.transactions
          .filter((t) => t.type === "debit")
          .reduce((sum, t) => sum + t.amount, 0),
      }));
    }

    const result: SummaryResult = {
      view,
      period: {
        start: range.startStr,
        end: range.endStr,
        label: periodLabel,
      },
      days,
      months,
      totals: {
        income: projection.summary.totalIncome,
        expenses: projection.summary.totalExpenses,
        net: projection.summary.netChange,
        loanPayments: projection.summary.loanPayments,
        totalOut: projection.summary.totalOut,
      },
      categoryBreakdown,
    };

    return NextResponse.json({ data: result });
  } catch (error) {
    if (error instanceof RangeError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Summary error:", error);
    return NextResponse.json({ error: "Failed to generate summary" }, { status: 500 });
  }
}
