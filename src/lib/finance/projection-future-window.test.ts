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

test("payments that already happened are replayed in full, never capped", () => {
  // Today is Jan 20. Stored balances already include the Jan 15 payment and Jan 18 income.
  const TODAY_MID = "2099-01-20";
  const low = { _id: id("bank"), type: "bank", balance: 10_000, isArchived: false };
  const debt = { _id: id("debt"), type: "debt", balance: 50_000, isArchived: false };
  const monthly = (day: number) => ({
    frequency: "monthly", interval: 1, startDate: new Date(`2098-12-${day}`), endDate: null, dayOfMonth: day,
  });
  const payment = {
    _id: id("pay"), amount: 50_000, date: new Date("2098-12-15"), description: "Payment",
    accountId: id("bank"), toAccountId: id("debt"), type: "transfer", isRecurring: true, categoryTags: [],
    recurrenceRule: monthly(15),
  };
  const income = {
    _id: id("inc"), amount: 50_000, date: new Date("2098-12-18"), description: "Income",
    accountId: id("bank"), type: "credit", isRecurring: true, categoryTags: [],
    recurrenceRule: monthly(18),
  };
  const r = buildProjection({
    accounts: [low, debt] as never,
    transactions: [payment, income] as never,
    startDate: new Date("2099-01-01"),
    endDate: new Date("2099-03-31"),
    today: TODAY_MID,
  });
  // On the 15th the rewound bank balance (10,000) is below the payment, but it really was paid
  const today = r.timeline.find((d) => d.date === TODAY_MID)!;
  assert.deepEqual(today.balances, { bank: 10_000, debt: 50_000 });
  const payments = r.timeline.flatMap((d) => d.transactions).filter((t) => t.description === "Payment");
  assert.deepEqual(payments.map((t) => `${t.date}:${t.amount}`), [
    "2099-01-15:50000", // already paid: full amount despite the low rewound balance
    "2099-02-15:10000", // future: limited to the 10,000 in the bank before the Feb 18 income
    "2099-03-15:40000", // future: the rest of the debt
  ]);
  assert.equal(r.alerts.filter((a) => a.date <= TODAY_MID).length, 0);
});

test("payments stop appearing once a debt is paid off, and the alert is dated the real payoff", () => {
  const rich = { _id: id("bank"), type: "bank", balance: 1_000_000, isArchived: false };
  const debt = { _id: id("debt"), type: "debt", balance: 100_000, isArchived: false };
  const payment = {
    _id: id("pay"), amount: 50_000, date: new Date("2099-01-10"), description: "Payment",
    accountId: id("bank"), toAccountId: id("debt"), type: "transfer", isRecurring: true, categoryTags: [],
    recurrenceRule: { frequency: "monthly", interval: 1, startDate: new Date("2099-01-10"), endDate: null, dayOfMonth: 10 },
  };
  const r = run([rich, debt], [payment], "2099-01-01", "2099-04-30");
  const rows = r.timeline.flatMap((d) => d.transactions).filter((t) => t.description === "Payment");
  assert.deepEqual(rows.map((t) => `${t.date}:${t.amount}`), ["2099-01-10:50000", "2099-02-10:50000"]);
  assert.deepEqual(
    r.alerts.map((a) => `${a.date}:${a.reason}:${a.adjustedAmount}`),
    ["2099-02-10:debt_paid_off:50000"]
  );
  assert.equal(r.summary.payoffDates.debt, "2099-02-10");
});

test("a bank shortfall on a debt payment is reported as insufficient balance, not as paid off", () => {
  const poor = { _id: id("bank"), type: "bank", balance: 20_000, isArchived: false };
  const debt = { _id: id("debt"), type: "debt", balance: 100_000, isArchived: false };
  const payment = {
    _id: id("pay"), amount: 50_000, date: new Date("2099-01-10"), description: "Payment",
    accountId: id("bank"), toAccountId: id("debt"), type: "transfer", isRecurring: false, balanceApplied: false, categoryTags: [],
  };
  const r = run([poor, debt], [payment], "2099-01-01", "2099-01-31");
  assert.deepEqual(r.alerts.map((a) => `${a.reason}:${a.adjustedAmount}`), ["insufficient_balance:20000"]);
});
