import { test } from "node:test";
import assert from "node:assert/strict";
import { applySandbox, applySandboxProfile, sandboxSchema } from "./projection-sandbox";
import { buildProjection } from "./projection-engine";

const id = (s: string) => ({ toString: () => s });
const bank = { _id: id("bank"), type: "bank", balance: 100_000, isArchived: false };
const real = {
  _id: id("rent"),
  amount: 50_000,
  date: new Date("2099-01-05"),
  description: "Rent",
  accountId: id("bank"),
  type: "debit",
  isRecurring: false,
  balanceApplied: false,
  categoryTags: [],
};
const form = (over: object = {}) => ({
  amount: 200,
  date: "2099-01-10",
  description: "What if",
  accountId: "bank",
  type: "debit",
  isRecurring: false,
  categoryTags: [],
  ...over,
});

function endBalance(sandbox: object) {
  const transactions = applySandbox([real], sandboxSchema.parse(sandbox));
  return buildProjection({
    accounts: [bank] as never,
    transactions: transactions as never,
    startDate: new Date("2099-01-01"),
    endDate: new Date("2099-01-31"),
    today: "2098-12-31",
  }).summary.endBalances.bank;
}

test("an empty sandbox leaves the projection as real data", () => {
  assert.equal(endBalance({}), 50_000);
});

test("added transactions count toward the projection", () => {
  assert.equal(endBalance({ added: [{ id: "sbx-1", data: form() }] }), 30_000);
});

test("edited transactions replace the real one", () => {
  assert.equal(endBalance({ edited: { rent: form({ amount: 100, description: "Rent" }) } }), 90_000);
});

test("removed transactions are left out", () => {
  assert.equal(endBalance({ removed: ["rent"] }), 100_000);
});

test("an added recurring transaction expands across the range", () => {
  const weekly = form({
    amount: 10,
    date: "2099-01-01",
    isRecurring: true,
    recurrenceRule: { frequency: "weekly", startDate: "2099-01-01" },
  });
  // Jan 1, 8, 15, 22, 29 → 5 × $10
  assert.equal(endBalance({ added: [{ id: "sbx-2", data: weekly }] }), 45_000);
});

test("an edit keeps a managed amount schedule unless the amount changes", () => {
  const managed = { ...real, amountSchedule: [{ effectiveDate: new Date("2000-01-01"), amount: 50_000 }] };
  const same = applySandbox([managed], sandboxSchema.parse({ edited: { rent: form({ amount: 500 }) } }));
  const changed = applySandbox([managed], sandboxSchema.parse({ edited: { rent: form({ amount: 400 }) } }));
  assert.equal((same[0] as { amountSchedule?: unknown[] }).amountSchedule?.length, 1);
  assert.equal((changed[0] as { amountSchedule?: unknown[] }).amountSchedule, undefined);
});

test("a what-if Datasheet re-prices the linked Rent without touching other transactions", () => {
  const rent = {
    ...real,
    isRecurring: true,
    recurrenceRule: { frequency: "monthly", interval: 1, startDate: new Date("2099-01-05"), endDate: null, dayOfMonth: 5 },
    amountSchedule: [{ effectiveDate: new Date("2099-01-01"), amount: 50_000 }],
  };
  const other = { ...real, _id: id("other"), amount: 1_000, date: new Date("2099-01-20") };
  const profile = {
    filingStatus: "single" as const,
    hoursPerWeek: 40,
    nycResident: false,
    raiseRate: 0.03,
    salaryTransactionId: null,
    rentTransactionId: "rent",
    salarySteps: [],
    retirementSteps: [],
    healthSteps: [],
    rentSteps: [{ effectiveDate: "2099-01-01", monthly: 80_000 }],
    whatIfSalaries: [],
  };
  const transactions = applySandboxProfile([rent, other], profile, "2098-12-31");
  const r = buildProjection({
    accounts: [bank] as never,
    transactions: transactions as never,
    startDate: new Date("2099-01-01"),
    endDate: new Date("2099-01-31"),
    today: "2098-12-31",
  });
  // 100,000 − 80,000 rent − 1,000 other
  assert.equal(r.summary.endBalances.bank, 19_000);
});
