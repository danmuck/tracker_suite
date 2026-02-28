import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import Account from "@/models/finance/Account";
import Transaction from "@/models/finance/Transaction";
import { buildProjection } from "@/lib/finance/projection-engine";
import {
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
  format,
} from "date-fns";
import type { SummaryView, SummaryResult, DaySummary, MonthSummary } from "@/types/finance/summary";

export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const { searchParams } = new URL(request.url);

    const view = (searchParams.get("view") || "monthly") as SummaryView;
    const dateStr = searchParams.get("date") || new Date().toISOString();
    const accountId = searchParams.get("accountId") || undefined;
    const date = new Date(dateStr);

    let startDate: Date;
    let endDate: Date;
    let periodLabel: string;

    switch (view) {
      case "weekly":
        startDate = startOfWeek(date, { weekStartsOn: 0 });
        endDate = endOfWeek(date, { weekStartsOn: 0 });
        periodLabel = `Week of ${format(startDate, "MMM d, yyyy")}`;
        break;
      case "monthly":
        startDate = startOfMonth(date);
        endDate = endOfMonth(date);
        periodLabel = format(date, "MMMM yyyy");
        break;
      case "annual":
        startDate = startOfYear(date);
        endDate = endOfYear(date);
        periodLabel = format(date, "yyyy");
        break;
    }

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
      startDate,
      endDate,
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
        const d = new Date(entry.date);
        const totalCredits = entry.transactions
          .filter((t) => t.type === "credit")
          .reduce((sum, t) => sum + t.amount, 0);
        const totalDebits = entry.transactions
          .filter((t) => t.type === "debit")
          .reduce((sum, t) => sum + t.amount, 0);

        return {
          month: d.getMonth(),
          year: d.getFullYear(),
          label: format(d, "MMMM"),
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
        start: format(startDate, "yyyy-MM-dd"),
        end: format(endDate, "yyyy-MM-dd"),
        label: periodLabel,
      },
      days,
      months,
      totals: {
        income: projection.summary.totalIncome,
        expenses: projection.summary.totalExpenses,
        net: projection.summary.netChange,
      },
      categoryBreakdown,
    };

    return NextResponse.json({ data: result });
  } catch (error) {
    console.error("Summary error:", error);
    return NextResponse.json({ error: "Failed to generate summary" }, { status: 500 });
  }
}
