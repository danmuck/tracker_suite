import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { postDuePayments } from "@/lib/finance/post-payments";
import Account from "@/models/finance/Account";
import Transaction from "@/models/finance/Transaction";
import { buildProjection } from "@/lib/finance/projection-engine";
import { localTodayStr } from "@/lib/finance/dates";
import type { Granularity } from "@/types/finance/projection";

export async function GET(request: NextRequest) {
  try {
    await connectDB();
    await postDuePayments();
    const { searchParams } = new URL(request.url);

    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const accountId = searchParams.get("accountId") || undefined;
    const granularity = (searchParams.get("granularity") || "daily") as Granularity;

    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: "startDate and endDate are required" },
        { status: 400 }
      );
    }

    const accounts = await Account.find();

    // A window starting in the future is projected forward from today, so the
    // engine also needs the transactions between today and the window start
    const todayStr = localTodayStr();
    const queryStart = startDate > todayStr ? todayStr : startDate;

    // Build date/recurrence filter
    const dateFilter = {
      $or: [
        // One-time transactions in range
        {
          isRecurring: { $ne: true },
          date: { $gte: new Date(queryStart), $lte: new Date(endDate) },
        },
        // Recurring transactions that overlap with range
        {
          isRecurring: true,
          "recurrenceRule.startDate": { $lte: new Date(endDate) },
          $or: [
            { "recurrenceRule.endDate": null },
            { "recurrenceRule.endDate": { $exists: false } },
            { "recurrenceRule.endDate": { $gte: new Date(queryStart) } },
          ],
        },
      ],
    };

    // Include transfers where account is source OR destination
    const query = accountId
      ? { $and: [{ $or: [{ accountId }, { toAccountId: accountId }] }, dateFilter] }
      : dateFilter;

    const transactions = await Transaction.find(query);

    const result = buildProjection({
      accounts: accounts as any,
      transactions: transactions as any,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      granularity,
      filterAccountId: accountId,
    });

    return NextResponse.json({ data: result });
  } catch (error) {
    if (error instanceof RangeError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Projection error:", error);
    return NextResponse.json({ error: "Failed to generate projections" }, { status: 500 });
  }
}
