import { test } from "node:test";
import assert from "node:assert/strict";
import { buildProjection, type EngineAccount, type EngineTransaction } from "./projection-engine";

// Income first: each projected day's entries are processed credits, debits, transfers (one-time or
// recurring alike), then by the source transaction's createdAt and _id, whatever the input order.

const bank: EngineAccount = { _id: "bank", type: "bank", balance: 0 };
const savings: EngineAccount = { _id: "savings", type: "bank", balance: 0 };
const loan: EngineAccount = { _id: "loan", type: "debt", balance: 5_000 };

const tx = (id: string, over: Partial<EngineTransaction>): EngineTransaction => ({
  _id: id,
  amount: 1_000,
  date: "2099-01-10T00:00:00.000Z",
  description: id,
  accountId: "bank",
  type: "debit",
  isRecurring: false,
  categoryTags: [],
  balanceApplied: false,
  createdAt: "2098-06-01T00:00:00.000Z",
  ...over,
});

const run = (transactions: EngineTransaction[], accounts: EngineAccount[] = [bank, savings, loan]) =>
  buildProjection({ accounts, transactions, startDate: new Date("2099-01-01"), endDate: new Date("2099-01-31"), today: "2098-12-31" });
const day = (r: ReturnType<typeof run>, date: string) =>
  r.timeline.find((d) => d.date === date)!.transactions.map((t) => [t.description, t.amount]);

test("one day: a credit from a newer recurring rule, then an old rule's debit, then a one-time transfer", () => {
  // Rent started years ago and was created first; the salary rule is newer; the transfer is one-time
  const rent = tx("rent", {
    amount: 3_000, isRecurring: true, createdAt: "2090-01-01T00:00:00.000Z", date: "2090-01-10T00:00:00.000Z",
    recurrenceRule: { frequency: "monthly", startDate: "2090-01-10T00:00:00.000Z", dayOfMonth: 10 },
  });
  const salary = tx("salary", {
    amount: 10_000, type: "credit", isRecurring: true, createdAt: "2098-01-01T00:00:00.000Z", date: "2098-01-10T00:00:00.000Z",
    recurrenceRule: { frequency: "monthly", startDate: "2098-01-10T00:00:00.000Z", dayOfMonth: 10 },
  });
  const move = tx("move", { amount: 4_000, type: "transfer", toAccountId: "savings", createdAt: "2089-01-01T00:00:00.000Z" });
  const r = run([move, rent, salary]);
  // From an empty bank, any other order would cap the debit or the transfer
  assert.deepEqual(day(r, "2099-01-10"), [["salary", 10_000], ["rent", 3_000], ["move", 4_000]]);
  assert.deepEqual([r.summary.endBalances.bank, r.summary.endBalances.savings], [3_000, 4_000]);
  assert.deepEqual(r.alerts, []);
});

test("the order decides which payment the debt payoff cap cuts: the credit goes first, then the older transfer", () => {
  // The loan owes 50.00; three payments of 40.00 on one day
  const funded = { ...bank, balance: 100_000 };
  const newer = tx("transfer newer", { amount: 4_000, type: "transfer", toAccountId: "loan", createdAt: "2098-03-01T00:00:00.000Z" });
  const older = tx("transfer older", { amount: 4_000, type: "transfer", toAccountId: "loan", createdAt: "2098-02-01T00:00:00.000Z" });
  const credit = tx("credit on loan", { amount: 4_000, type: "credit", accountId: "loan", createdAt: "2098-04-01T00:00:00.000Z" });
  const r = run([newer, older, credit], [funded, loan]);
  // The credit pays 40.00, the older transfer is capped at the 10.00 left, the newer one is dropped
  assert.deepEqual(day(r, "2099-01-10"), [["credit on loan", 4_000], ["transfer older", 1_000]]);
  assert.deepEqual(r.alerts.map((a) => [a.reason, a.description, a.adjustedAmount]), [["debt_paid_off", "transfer older", 1_000]]);
  // Swap the transfers' createdAt: the other one is capped
  const swapped = run([{ ...newer, createdAt: older.createdAt }, { ...older, createdAt: newer.createdAt }, credit], [funded, loan]);
  assert.deepEqual(day(swapped, "2099-01-10"), [["credit on loan", 4_000], ["transfer newer", 1_000]]);
  // Equal createdAt: _id decides
  const tied = run([{ ...newer, createdAt: older.createdAt }, older, credit], [funded, loan]);
  assert.deepEqual(day(tied, "2099-01-10"), [["credit on loan", 4_000], ["transfer newer", 1_000]]);
});

test("shuffled input gives identical output (timeline, ledger, alerts, summary)", () => {
  const list = [
    tx("pay", { amount: 2_500, type: "credit", isRecurring: true, date: "2098-12-05T00:00:00.000Z", createdAt: "2098-12-05T00:00:00.000Z", recurrenceRule: { frequency: "weekly", startDate: "2098-12-05T00:00:00.000Z", dayOfWeek: 1 } }),
    tx("groceries", { amount: 900, isRecurring: true, date: "2097-01-01T00:00:00.000Z", createdAt: "2097-01-01T00:00:00.000Z", recurrenceRule: { frequency: "daily", startDate: "2097-01-01T00:00:00.000Z", interval: 3 } }),
    tx("save", { amount: 700, type: "transfer", toAccountId: "savings", isRecurring: true, date: "2098-01-02T00:00:00.000Z", recurrenceRule: { frequency: "weekly", startDate: "2098-01-02T00:00:00.000Z", dayOfWeek: 5 } }),
    tx("loan pay", { amount: 2_000, type: "transfer", toAccountId: "loan", isRecurring: true, date: "2098-01-03T00:00:00.000Z", recurrenceRule: { frequency: "weekly", startDate: "2098-01-03T00:00:00.000Z", dayOfWeek: 1 } }),
    tx("one-off a", { amount: 1_200, date: "2099-01-05T00:00:00.000Z", createdAt: "2098-11-01T00:00:00.000Z" }),
    tx("one-off b", { amount: 1_300, date: "2099-01-05T00:00:00.000Z", createdAt: "2098-11-01T00:00:00.000Z" }),
    tx("bonus", { amount: 800, type: "credit", date: "2099-01-05T00:00:00.000Z" }),
  ];
  const expected = JSON.stringify(run(list));
  // Every rotation and the reverse of each
  for (let i = 0; i < list.length; i++) {
    const rotated = [...list.slice(i), ...list.slice(0, i)];
    assert.equal(JSON.stringify(run(rotated)), expected, `rotation ${i}`);
    assert.equal(JSON.stringify(run([...rotated].reverse())), expected, `reversed rotation ${i}`);
  }
  // …and the weekly buckets concatenate days in that order too
  const weekly = (l: EngineTransaction[]) => JSON.stringify(buildProjection({ accounts: [bank, savings, loan], transactions: l, startDate: new Date("2099-01-01"), endDate: new Date("2099-01-31"), granularity: "weekly", today: "2098-12-31" }));
  assert.equal(weekly([...list].reverse()), weekly(list));
});
