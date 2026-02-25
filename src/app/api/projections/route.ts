import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import Account from "@/models/Account";
import Transaction from "@/models/Transaction";
import { buildProjection } from "@/lib/projection-engine";
import type { Granularity } from "@/types/projection";

export async function GET(request: NextRequest) {
  try {
    await connectDB();
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

    // Fetch all transactions that could affect the range
    // Include recurring transactions that might have occurrences in range
    const query: Record<string, unknown> = {};
    if (accountId) {
      query.accountId = accountId;
    }

    const transactions = await Transaction.find({
      ...query,
      $or: [
        // One-time transactions in range
        {
          isRecurring: { $ne: true },
          date: { $gte: new Date(startDate), $lte: new Date(endDate) },
        },
        // Recurring transactions that overlap with range
        {
          isRecurring: true,
          "recurrenceRule.startDate": { $lte: new Date(endDate) },
          $or: [
            { "recurrenceRule.endDate": null },
            { "recurrenceRule.endDate": { $exists: false } },
            { "recurrenceRule.endDate": { $gte: new Date(startDate) } },
          ],
        },
      ],
    });

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
    console.error("Projection error:", error);
    return NextResponse.json({ error: "Failed to generate projections" }, { status: 500 });
  }
}
