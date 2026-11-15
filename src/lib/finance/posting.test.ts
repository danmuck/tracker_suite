import { test } from "node:test";
import assert from "node:assert/strict";
import { dueOccurrences } from "./posting";
import { buildProjection } from "./projection-engine";

const rule = { frequency: "monthly" as const, interval: 1, startDate: "2026-10-12", endDate: null, dayOfMonth: 12 };
const schedule = [{ effectiveDate: "2026-10-12", amount: 50_000 }];

test("backdated plan posts every occurrence up to today", () => {
  assert.deepEqual(dueOccurrences(rule, schedule, 1, null, "2026-11-14"), [
    { date: "2026-10-12", amount: 50_000 },
    { date: "2026-11-12", amount: 50_000 },
  ]);
});

test("only occurrences after postedThrough are due", () => {
  assert.deepEqual(dueOccurrences(rule, schedule, 1, "2026-11-12", "2026-12-12"), [{ date: "2026-12-12", amount: 50_000 }]);
  assert.deepEqual(dueOccurrences(rule, schedule, 1, "2026-11-12", "2026-11-30"), []);
});

test("amounts follow the schedule on each date", () => {
  const s = [...schedule, { effectiveDate: "2026-11-01", amount: 30_000 }];
  assert.deepEqual(
    dueOccurrences(rule, s, 1, null, "2026-11-14").map((o) => o.amount),
    [50_000, 30_000]
  );
});

test("future-dated plan has nothing due", () => {
  assert.deepEqual(dueOccurrences({ ...rule, startDate: "2027-01-12" }, schedule, 1, null, "2026-11-14"), []);
});

const id = (s: string) => ({ toString: () => s });

test("a day's balance is the same whatever the projection window starts on", () => {
  // Stored balances are 'today'; past recurring occurrences are already in them
  const accounts = [
    { _id: id("bank"), type: "bank", balance: 150_000, isArchived: false },
    { _id: id("dan"), type: "debt", balance: 50_000, isArchived: false },
  ];
  const tx = [
    {
      _id: id("p"),
      amount: 50_000,
      date: new Date("2020-01-12"),
      description: "Dan payment",
      accountId: id("bank"),
      toAccountId: id("dan"),
      type: "transfer",
      isRecurring: true,
      categoryTags: [],
      recurrenceRule: { frequency: "monthly", interval: 1, startDate: new Date("2020-01-12"), endDate: null, dayOfMonth: 12 },
    },
  ];
  const today = new Date().toISOString().slice(0, 10);
  const run = (start: string) =>
    buildProjection({ accounts: accounts as never, transactions: tx as never, startDate: new Date(start), endDate: new Date(today) });
  const fromToday = run(today).summary.endBalances;
  const fromEarlier = run("2020-01-01").summary.endBalances;
  assert.equal(fromEarlier.dan, fromToday.dan);
  assert.equal(fromEarlier.bank, fromToday.bank);
  assert.equal(fromToday.dan, 50_000);
});
