// Projections and summary routes (R18–R20) as store-backed handlers, shared by the server and
// browser data modes. Same order as src/app/api/projections/route.ts and src/app/api/summary/route.ts.
// Pure: no framework, browser or server imports (browser-reachable).

import { format } from "date-fns";
import { z } from "zod";
import { fail, ok, type ApiResult, type Handler } from "@/lib/data/api";
import type { Store } from "@/lib/data/store";
import {
  asDate,
  filterDate,
  fromDateStr,
  localDateStr,
  monthBounds,
  toDateStr,
  weekBounds,
  yearBounds,
  type DateRangeStr,
} from "@/lib/finance/dates";
import { profileFromDollars } from "@/lib/finance/finance-profile";
import { buildProjection, type EngineTransaction } from "@/lib/finance/projection-engine";
import { applySandbox, applySandboxProfile, sandboxSchema, type SandboxInput } from "@/lib/finance/projection-sandbox";
import { sameDayOrder } from "@/lib/finance/same-day-order";
import type { Granularity } from "@/types/finance/projection";
import type { DaySummary, MonthSummary, SummaryResult, SummaryView } from "@/types/finance/summary";
import {
  accounts,
  assertId,
  loadProfile,
  profiles,
  shapeAccount,
  shapeTransaction,
  transactions,
  type AccountDoc,
} from "./docs";
import { postDuePayments } from "./post-payments";

interface ProjectionParams {
  startDate: string;
  endDate: string;
  granularity: Granularity;
  accountId?: string;
}

/** Milliseconds of a stored `updatedAt`, `0` when absent (today: `x.updatedAt?.getTime() ?? 0`). */
const ms = (value: string | undefined): number => (value ? asDate(value).getTime() : 0);

/**
 * Fingerprint of the real data a projection is built from. The client compares
 * it between responses to notice that accounts or transactions changed.
 */
async function dataVersion(store: Store, accts: AccountDoc[]): Promise<string> {
  const [count, latest, profile] = await Promise.all([
    transactions(store).count(), // PR4
    transactions(store).findOne({}, { sort: { updatedAt: -1 }, select: ["updatedAt"] }), // PR5
    profiles(store).findOne({}, { select: ["updatedAt"] }), // PR6
  ]);
  const acct = accts
    .map((a) => `${a._id}:${a.balance}:${ms(a.updatedAt)}`)
    .sort()
    .join(",");
  return `${count}|${ms(latest?.updatedAt)}|${ms(profile?.updatedAt)}|${acct}`;
}

async function project(store: Store, now: Date, params: ProjectionParams, sandbox?: SandboxInput) {
  const { startDate, endDate, granularity, accountId } = params;
  const accts = (await accounts(store).find()).map(shapeAccount); // PR1

  let txs: EngineTransaction[];
  if (sandbox) {
    // Sandbox edits can move a transaction into the range, so start from
    // everything and let the engine pick what falls inside the window
    // Sorted as fetched; sandbox edits keep their place and additions go last
    let all: EngineTransaction[] = (await transactions(store).find()).map(shapeTransaction).sort(sameDayOrder); // PR2
    if (sandbox.profile) {
      // The what-if Datasheet re-prices Salary and Rent; which transactions
      // those are always comes from the real Datasheet
      const realProfile = await loadProfile(store);
      const whatIf = {
        ...profileFromDollars(sandbox.profile),
        salaryTransactionId: realProfile.salaryTransactionId,
        rentTransactionId: realProfile.rentTransactionId,
      };
      all = applySandboxProfile(all, whatIf, localDateStr(now));
    }
    txs = applySandbox(all, sandbox);
  } else {
    // A window starting in the future is projected forward from today, so the
    // engine also needs the transactions between today and the window start
    const todayStr = localDateStr(now);
    const queryStart = startDate > todayStr ? todayStr : startDate;

    const dateFilter = {
      $or: [
        // One-time transactions in range
        {
          isRecurring: { $ne: true },
          date: { $gte: filterDate(queryStart), $lte: filterDate(endDate) },
        },
        // Recurring transactions that overlap with range
        {
          isRecurring: true,
          "recurrenceRule.startDate": { $lte: filterDate(endDate) },
          $or: [
            { "recurrenceRule.endDate": null },
            { "recurrenceRule.endDate": { $exists: false } },
            { "recurrenceRule.endDate": { $gte: filterDate(queryStart) } },
          ],
        },
      ],
    };

    // Include transfers where account is source OR destination
    const query = accountId
      ? { $and: [{ $or: [{ accountId }, { toAccountId: accountId }] }, dateFilter] }
      : dateFilter;

    if (accountId) assertId(accountId);
    txs = (await transactions(store).find(query)).map(shapeTransaction).sort(sameDayOrder); // PR3
  }

  const result = buildProjection({
    accounts: accts,
    transactions: txs,
    startDate: new Date(startDate),
    endDate: new Date(endDate),
    granularity,
    filterAccountId: accountId,
    today: localDateStr(now),
  });

  return { data: result, dataVersion: await dataVersion(store, accts) };
}

/** RangeError → 400 with its message; a ZodError (POST only) → 400; anything else is the route's 500. */
async function guarded(run: () => Promise<ApiResult>, zod: boolean): Promise<ApiResult> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof RangeError) return fail(400, error.message);
    if (zod && error instanceof Error && error.name === "ZodError") {
      return fail(400, "Invalid projection request", JSON.parse(JSON.stringify((error as z.ZodError).issues)));
    }
    throw error;
  }
}

/** GET — projection over a date range; due payments are posted before the parameter check. */
export const getProjection: Handler = ({ store, query, now }) =>
  guarded(async () => {
    await postDuePayments(store, now);

    const startDate = query.get("startDate");
    const endDate = query.get("endDate");
    const accountId = query.get("accountId") || undefined;
    const granularity = (query.get("granularity") || "daily") as Granularity;

    if (!startDate || !endDate) return fail(400, "startDate and endDate are required");

    return ok(await project(store, now, { startDate, endDate, granularity, accountId }));
  }, false);

const sandboxRequestSchema = z.object({
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  granularity: z.enum(["daily", "weekly", "monthly"]).default("daily"),
  accountId: z.string().optional(),
  sandbox: sandboxSchema,
});

/** POST — the same projection with what-if changes applied; the sandbox is never saved. */
export const postProjection: Handler = ({ store, body, now }) =>
  guarded(async () => {
    await postDuePayments(store, now);
    const { sandbox, ...params } = sandboxRequestSchema.parse(body);
    return ok(await project(store, now, params, sandbox));
  }, true);

const SUMMARY_VIEWS: readonly string[] = ["weekly", "monthly", "annual"] satisfies SummaryView[];

/** GET — totals, category breakdown and days (or months) for a week, month or year. */
export const getSummary: Handler = ({ store, query: params, now }) =>
  guarded(async () => {
    const view = (params.get("view") || "monthly") as SummaryView;
    // Checked before due payments are posted: a 400 writes nothing
    if (!SUMMARY_VIEWS.includes(view)) return fail(400, "Invalid view");

    await postDuePayments(store, now);

    const dateParam = params.get("date");
    const accountId = params.get("accountId") || undefined;
    // Treat the param as a calendar date: "yyyy-MM-dd" is taken as-is, a full ISO string by its UTC day
    const dateStr = !dateParam
      ? localDateStr(now)
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
        range = yearBounds(dateStr);
        periodLabel = dateStr.slice(0, 4);
        break;
    }

    const accts = (await accounts(store).find()).map(shapeAccount); // SU1

    // Stored dates are UTC midnight, so query with UTC-midnight bounds (inclusive)
    const startDate = filterDate(range.startStr);
    const endDate = filterDate(range.endStr);

    const dateFilter = {
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
    };
    // Include transfers where the account is source OR destination (as projections do)
    const query = accountId
      ? { $and: [{ $or: [{ accountId }, { toAccountId: accountId }] }, dateFilter] }
      : dateFilter;

    if (accountId) assertId(accountId);
    const txs = (await transactions(store).find(query)).map(shapeTransaction).sort(sameDayOrder); // SU2

    const granularity = view === "annual" ? "monthly" : "daily";
    const projection = buildProjection({
      accounts: accts,
      transactions: txs,
      startDate: fromDateStr(range.startStr),
      endDate: fromDateStr(range.endStr),
      granularity,
      filterAccountId: accountId,
      today: localDateStr(now),
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

    return ok({ data: result });
  }, false);
