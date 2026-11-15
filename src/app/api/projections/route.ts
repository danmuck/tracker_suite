import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/db";
import { postDuePayments } from "@/lib/finance/post-payments";
import Account from "@/models/finance/Account";
import Transaction from "@/models/finance/Transaction";
import { buildProjection } from "@/lib/finance/projection-engine";
import { localTodayStr } from "@/lib/finance/dates";
import { applySandbox, sandboxSchema, type SandboxInput } from "@/lib/finance/projection-sandbox";
import type { Granularity } from "@/types/finance/projection";

interface ProjectionParams {
  startDate: string;
  endDate: string;
  granularity: Granularity;
  accountId?: string;
}

/**
 * Fingerprint of the real data a projection is built from. The client compares
 * it between responses to notice that accounts or transactions changed.
 */
async function dataVersion(accounts: { _id: unknown; balance: number; updatedAt?: Date }[]) {
  const [count, latest] = await Promise.all([
    Transaction.countDocuments(),
    Transaction.findOne().sort({ updatedAt: -1 }).select("updatedAt").lean<{ updatedAt?: Date }>(),
  ]);
  const acct = accounts
    .map((a) => `${a._id}:${a.balance}:${a.updatedAt?.getTime() ?? 0}`)
    .sort()
    .join(",");
  return `${count}|${latest?.updatedAt?.getTime() ?? 0}|${acct}`;
}

async function project(params: ProjectionParams, sandbox?: SandboxInput) {
  const { startDate, endDate, granularity, accountId } = params;
  const accounts = await Account.find();

  let transactions: unknown[];
  if (sandbox) {
    // Sandbox edits can move a transaction into the range, so start from
    // everything and let the engine pick what falls inside the window
    transactions = applySandbox(await Transaction.find(), sandbox);
  } else {
    // A window starting in the future is projected forward from today, so the
    // engine also needs the transactions between today and the window start
    const todayStr = localTodayStr();
    const queryStart = startDate > todayStr ? todayStr : startDate;

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

    transactions = await Transaction.find(query);
  }

  const result = buildProjection({
    accounts: accounts as never,
    transactions: transactions as never,
    startDate: new Date(startDate),
    endDate: new Date(endDate),
    granularity,
    filterAccountId: accountId,
  });

  return { data: result, dataVersion: await dataVersion(accounts) };
}

function fail(error: unknown) {
  if (error instanceof RangeError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (error instanceof z.ZodError) {
    return NextResponse.json({ error: "Invalid projection request", details: error.issues }, { status: 400 });
  }
  console.error("Projection error:", error);
  return NextResponse.json({ error: "Failed to generate projections" }, { status: 500 });
}

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

    return NextResponse.json(await project({ startDate, endDate, granularity, accountId }));
  } catch (error) {
    return fail(error);
  }
}

const sandboxRequestSchema = z.object({
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  granularity: z.enum(["daily", "weekly", "monthly"]).default("daily"),
  accountId: z.string().optional(),
  sandbox: sandboxSchema,
});

// POST /api/projections — the same projection with what-if changes applied.
// Read-only: the sandbox is used for this calculation and never saved.
export async function POST(request: NextRequest) {
  try {
    await connectDB();
    await postDuePayments();
    const { sandbox, ...params } = sandboxRequestSchema.parse(await request.json());
    return NextResponse.json(await project(params, sandbox));
  } catch (error) {
    return fail(error);
  }
}
