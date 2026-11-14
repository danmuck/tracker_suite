import { test } from "node:test";
import assert from "node:assert/strict";
import { buildProjection } from "./projection-engine";

const id = (s: string) => ({ toString: () => s });
const bank = { _id: id("bank"), type: "bank", balance: 100_000_000, isArchived: false };

function run(accounts: object[], transactions: object[] = [], start = "2099-01-01", end = "2099-03-31") {
  return buildProjection({
    accounts: accounts as never,
    transactions: transactions as never,
    startDate: new Date(start),
    endDate: new Date(end),
  });
}

function lines(result: ReturnType<typeof run>, description: string) {
  return result.timeline.flatMap((d) => d.transactions).filter((t) => t.description === description);
}

test("adds month-end interest on debt", () => {
  const debt = { _id: id("d"), type: "debt", balance: 120_000, apr: 0.12, isArchived: false };
  const r = run([debt]);
  assert.deepEqual(
    lines(r, "Interest").map((t) => `${t.date}:${t.amount}`),
    ["2099-01-31:1200", "2099-02-28:1212", "2099-03-31:1224"]
  );
  assert.ok(Math.abs(r.summary.endBalances.d - 123_636) <= 1, `end ${r.summary.endBalances.d}`);
  assert.equal(r.summary.totalExpenses, 1200 + 1212 + 1224);
});

test("no interest when nothing owed", () => {
  const debt = { _id: id("d"), type: "debt", balance: 0, apr: 0.2, isArchived: false };
  assert.equal(lines(run([debt]), "Interest").length, 0);
});

test("no interest on bank accounts", () => {
  assert.equal(lines(run([{ ...bank, apr: 0.2 }]), "Interest").length, 0);
});

test("credit card interest uses its APR", () => {
  const card = { _id: id("c"), type: "credit_card", balance: 100_000, creditLimit: 200_000, apr: 0.24, isArchived: false };
  assert.equal(lines(run([card]), "Interest")[0].amount, 2_000);
});

test("rap waives unpaid interest and matches principal", () => {
  const loan = {
    _id: id("loan"),
    type: "debt",
    balance: 5_500_000,
    apr: 0.065,
    rap: { enabled: true, autoSchedule: false, recertDate: "07-01", dependents: 0 },
    isArchived: false,
  };
  const payment = {
    _id: id("p"),
    amount: 1_000,
    date: new Date("2099-01-15"),
    description: "Loan payment",
    accountId: id("bank"),
    toAccountId: id("loan"),
    type: "transfer",
    isRecurring: true,
    categoryTags: [],
    recurrenceRule: { frequency: "monthly", interval: 1, startDate: new Date("2099-01-15"), endDate: null, dayOfMonth: 15 },
  };
  const r = run([bank, loan], [payment], "2099-01-01", "2099-01-31");
  assert.deepEqual(lines(r, "Interest").map((t) => t.amount), [1_000]);
  assert.deepEqual(lines(r, "RAP principal match").map((t) => t.amount), [1_000]);
  assert.equal(r.summary.endBalances.loan, 5_499_000);
  assert.equal(r.summary.totalIncome, 0, "match is not income");
});

test("rap month with no payment waives everything", () => {
  const loan = { _id: id("loan"), type: "debt", balance: 5_500_000, apr: 0.065, rap: { enabled: true, autoSchedule: false, recertDate: "07-01", dependents: 0 }, isArchived: false };
  const r = run([loan], [], "2099-01-01", "2099-01-31");
  assert.equal(lines(r, "Interest").length, 0);
  assert.equal(r.summary.endBalances.loan, 5_500_000);
});

test("blended apr from sub-loans", () => {
  const loan = {
    _id: id("loan"),
    type: "debt",
    balance: 200_000,
    subLoans: [
      { name: "A", balance: 100_000, apr: 0.06 },
      { name: "B", balance: 100_000, apr: 0.12 },
    ],
    isArchived: false,
  };
  assert.equal(lines(run([loan], [], "2099-01-01", "2099-01-31"), "Interest")[0].amount, 1_500);
});

test("interest only after today", () => {
  const debt = { _id: id("d"), type: "debt", balance: 120_000, apr: 0.12, isArchived: false };
  assert.equal(lines(run([debt], [], "2020-01-01", "2020-03-31"), "Interest").length, 0);
});
