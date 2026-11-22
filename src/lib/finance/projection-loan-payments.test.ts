import { test } from "node:test";
import assert from "node:assert/strict";
import { buildProjection } from "./projection-engine";

const id = (s: string) => ({ toString: () => s });

const bank = { _id: id("bank"), type: "bank", balance: 500_000, isArchived: false };
const loan = { _id: id("loan"), type: "debt", balance: 100_000, isArchived: false };
const card = { _id: id("card"), type: "credit_card", balance: 50_000, creditLimit: 200_000, isArchived: false };

const tx = (type: string, amount: number, from: string, to?: string) => ({
  _id: id(`${type}-${from}-${to ?? ""}`),
  amount,
  date: new Date("2099-01-10"),
  description: type,
  accountId: id(from),
  toAccountId: to ? id(to) : undefined,
  type,
  isRecurring: false,
  balanceApplied: false,
  categoryTags: [],
});

test("loan payments are reported apart from expenses; card payments are not counted", () => {
  const r = buildProjection({
    accounts: [bank, loan, card] as never,
    transactions: [
      tx("debit", 20_000, "bank"),
      tx("transfer", 30_000, "bank", "loan"),
      tx("transfer", 10_000, "bank", "card"),
    ] as never,
    startDate: new Date("2099-01-01"),
    endDate: new Date("2099-01-31"),
    today: "2098-12-31",
  });
  assert.equal(r.summary.totalExpenses, 20_000);
  assert.equal(r.summary.loanPayments, 30_000);
  assert.equal(r.summary.totalOut, 50_000);
  assert.equal(r.summary.netChange, -20_000, "net change still ignores transfers");
});
