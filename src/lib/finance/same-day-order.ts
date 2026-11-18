// The order the projection engine processes one day's entries in. The engine keeps no other order
// within a day, and that order drives caps, payoffs, alerts and running totals, so fixing it here
// makes the result the same whatever order a store returns. Pure: browser-reachable.

import { toDateStr } from "./dates";

export interface OrderedTransaction {
  _id: { toString(): string };
  date: Date | string;
  type: "credit" | "debit" | "transfer";
  createdAt?: Date | string;
  /** The entry's own account is a credit card or debt account: a credit there is a payment */
  onDebtAccount?: boolean;
  /** A transfer's destination is a credit card or debt account: the transfer is a payment */
  toDebtAccount?: boolean;
}

/**
 * 0 income (a credit on a bank account), 1 transfers into a bank account (money moved between the
 * owner's accounts lands before the day's spending, and after income so its source is funded),
 * 2 debits (card charges included), 3 payments: transfers into, and credits on, a credit card or
 * debt account, ranked together.
 */
export function dayRank(t: Pick<OrderedTransaction, "type" | "onDebtAccount" | "toDebtAccount">): number {
  if (t.type === "credit") return t.onDebtAccount ? 3 : 0;
  if (t.type === "debit") return 2;
  return t.toDebtAccount ? 3 : 1;
}

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

// A missing or unparseable createdAt counts as the newest (what-if additions are never stored)
const NEWEST = "￿";
const created = (t: OrderedTransaction) => {
  if (t.createdAt == null) return NEWEST;
  const ms = new Date(t.createdAt).getTime();
  return Number.isNaN(ms) ? NEWEST : new Date(ms).toISOString();
};

/**
 * By UTC calendar day of `date`; within a day by `dayRank` (income, transfers between bank accounts, debits, payments); then
 * `createdAt` ascending (a missing or unparseable one last); then `_id` ascending.
 */
export function sameDayOrder(a: OrderedTransaction, b: OrderedTransaction): number {
  return (
    compare(toDateStr(a.date), toDateStr(b.date)) ||
    dayRank(a) - dayRank(b) ||
    compare(created(a), created(b)) ||
    compare(a._id.toString(), b._id.toString())
  );
}
