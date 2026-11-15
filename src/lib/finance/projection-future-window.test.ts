import { test } from "node:test";
import assert from "node:assert/strict";
import { buildProjection } from "./projection-engine";

const id = (s: string) => ({ toString: () => s });
const TODAY = "2098-12-31";

function run(accounts: object[], transactions: object[], start: string, end: string) {
  return buildProjection({
    accounts: accounts as never,
    transactions: transactions as never,
    startDate: new Date(start),
    endDate: new Date(end),
    today: TODAY,
  });
}

const bank = { _id: id("bank"), type: "bank", balance: 100_000, isArchived: false };
const oneTime = (amount: number, date: string) => ({
  _id: id(`t-${date}`),
  amount,
  date: new Date(date),
  description: "Bill",
  accountId: id("bank"),
  type: "debit",
  isRecurring: false,
  balanceApplied: false,
  categoryTags: [],
});

test("a window starting in the future includes activity between today and its start", () => {
  const r = run([bank], [oneTime(30_000, "2099-01-10")], "2099-02-01", "2099-02-28");
  assert.equal(r.summary.startBalances.bank, 70_000);
  assert.equal(r.summary.endBalances.bank, 70_000);
  assert.equal(r.summary.totalExpenses, 0, "lead-in spending is outside the window totals");
  assert.equal(r.timeline[0].date, "2099-02-01");
});

test("removing an earlier transaction changes a future window", () => {
  const r = run([bank], [], "2099-02-01", "2099-02-28");
  assert.equal(r.summary.startBalances.bank, 100_000);
});

test("recurring items and interest accrue during the lead-in", () => {
  const card = { _id: id("card"), type: "credit_card", balance: 100_000, creditLimit: 500_000, apr: 0.24, isArchived: false };
  const weekly = {
    _id: id("w"),
    amount: 10_000,
    date: new Date("2099-01-02"),
    description: "Spending",
    accountId: id("card"),
    type: "debit",
    isRecurring: true,
    categoryTags: [],
    recurrenceRule: { frequency: "monthly", interval: 1, startDate: new Date("2099-01-02"), endDate: null, dayOfMonth: 2 },
  };
  const r = run([card], [weekly], "2099-02-01", "2099-02-28");
  // Jan 2 charge (10,000) then Jan 31 interest on 110,000 at 2%/mo (2,200)
  assert.equal(r.summary.startBalances.card, 112_200);
});

test("a window starting today or earlier is unchanged", () => {
  const r = run([bank], [oneTime(30_000, "2099-01-10")], "2098-12-31", "2099-01-31");
  assert.equal(r.summary.startBalances.bank, 100_000);
  assert.equal(r.summary.endBalances.bank, 70_000);
});

test("each transaction carries running bank and credit card totals", () => {
  const card = { _id: id("card"), type: "credit_card", balance: 20_000, creditLimit: 500_000, isArchived: false };
  const charge = {
    _id: id("c1"), amount: 5_000, date: new Date("2099-01-05"), description: "Charge",
    accountId: id("card"), type: "debit", isRecurring: false, balanceApplied: false, categoryTags: [],
  };
  const payment = {
    _id: id("p1"), amount: 3_000, date: new Date("2099-01-10"), description: "Payment",
    accountId: id("bank"), toAccountId: id("card"), type: "transfer", isRecurring: false, balanceApplied: false, categoryTags: [],
  };
  const r = run([bank, card], [charge, payment], "2099-01-01", "2099-01-31");
  const tx = r.timeline.flatMap((d) => d.transactions);
  assert.deepEqual(tx.map((t) => t.ledger), [
    { bank: 100_000, credit: 25_000 },
    { bank: 97_000, credit: 22_000 },
  ]);
});
