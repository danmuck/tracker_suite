// The order projections and the summary hand transactions to the engine, which keeps input order
// within a day (that order drives caps and running totals). Fixing it here makes the result the
// same whatever order a store returns. Pure: browser-reachable.

import { toDateStr } from "./dates";

export interface OrderedTransaction {
  _id: { toString(): string };
  date: Date | string;
  type: "credit" | "debit" | "transfer";
  createdAt?: Date | string;
}

const KIND_RANK = { credit: 0, debit: 1, transfer: 2 } as const;

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const created = (t: OrderedTransaction) => (t.createdAt === undefined ? "" : new Date(t.createdAt).toISOString());

/**
 * By UTC calendar day of `date`; within a day credits, then debits, then transfers; then
 * `createdAt` ascending (a missing one first); then `_id` ascending.
 */
export function sameDayOrder(a: OrderedTransaction, b: OrderedTransaction): number {
  return (
    compare(toDateStr(a.date), toDateStr(b.date)) ||
    KIND_RANK[a.type] - KIND_RANK[b.type] ||
    compare(created(a), created(b)) ||
    compare(a._id.toString(), b._id.toString())
  );
}
