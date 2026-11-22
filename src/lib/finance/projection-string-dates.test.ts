import test from "node:test";
import assert from "node:assert/strict";
import { buildProjection } from "./projection-engine";

const id = (s: string) => ({ toString: () => s });
const accounts = [{ _id: id("bank"), type: "bank", balance: 500_000, isArchived: false }, { _id: id("card"), type: "credit_card", balance: 20_000, isArchived: false }];
const txs = (date: (s: string) => Date | string) => [
  { _id: id("once"), amount: 1_000, date: date("2026-11-10"), description: "once", accountId: id("bank"), type: "debit", isRecurring: false, categoryTags: ["spending"], balanceApplied: true },
  { _id: id("rent"), amount: 150_000, date: date("2026-09-01"), description: "rent", accountId: id("bank"), type: "debit", isRecurring: true, categoryTags: ["bills"], balanceApplied: false,
    recurrenceRule: { frequency: "monthly", interval: 1, startDate: date("2026-09-01"), endDate: date("2027-06-01"), dayOfMonth: 1, daysOfMonth: [] },
    amountSchedule: [{ effectiveDate: date("2026-09-01"), amount: 150_000 }, { effectiveDate: date("2027-01-01"), amount: 160_000 }] },
  { _id: id("pay"), amount: 5_000, date: date("2026-10-15"), description: "pay", accountId: id("bank"), toAccountId: id("card"), type: "transfer", isRecurring: true, categoryTags: ["credit", "transfer"], balanceApplied: false,
    recurrenceRule: { frequency: "monthly", interval: 1, startDate: date("2026-10-15"), endDate: null, dayOfMonth: 15, daysOfMonth: [] } },
];
const run = (date: (s: string) => Date | string, granularity: "daily" | "weekly" | "monthly" = "monthly") =>
  buildProjection({ accounts: accounts as never, transactions: txs(date) as never, startDate: new Date("2026-11-01"), endDate: new Date("2027-03-31"), granularity, today: "2026-11-17" });

for (const granularity of ["daily", "weekly", "monthly"] as const) {
  test(`buildProjection gives the same result for ISO-string dates as for Date objects (${granularity})`, () => {
    const withDates = run((s) => new Date(s), granularity);
    assert.ok(withDates.timeline.length > 0 && withDates.timeline.some((d) => d.transactions.length > 0));
    assert.deepEqual(run((s) => new Date(s).toISOString(), granularity), withDates);
  });
}
