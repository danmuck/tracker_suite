import test from "node:test";
import assert from "node:assert/strict";
import { sameDayOrder } from "./same-day-order";

type Tx = Parameters<typeof sameDayOrder>[0];
const tx = (id: string, over: Partial<Tx> = {}): Tx => ({
  _id: id,
  date: "2026-11-10T00:00:00.000Z",
  type: "debit",
  createdAt: "2026-11-01T00:00:00.000Z",
  ...over,
});
const ids = (list: Tx[]) => [...list].sort(sameDayOrder).map((t) => String(t._id));

test("sameDayOrder: the calendar day comes first, by its UTC date (an instant later that day ties)", () => {
  const later = tx("a", { date: "2026-11-11T00:00:00.000Z", type: "credit" });
  const earlier = tx("b", { date: "2026-11-10T00:00:00.000Z", type: "transfer" });
  assert.deepEqual(ids([later, earlier]), ["b", "a"]);
  // A stored instant during the day is the same day as UTC midnight: the kind decides
  const instant = tx("c", { date: "2026-11-10T18:30:00.000Z", type: "credit" });
  assert.deepEqual(ids([earlier, instant]), ["c", "b"]);
  // Date objects (sandbox edits) compare the same way
  assert.deepEqual(ids([tx("d", { date: new Date("2026-11-10T00:00:00.000Z"), type: "transfer" }), tx("e", { type: "credit" })]), ["e", "d"]);
});

test("sameDayOrder: within a day credits, then debits, then transfers", () => {
  const list = [tx("t", { type: "transfer", createdAt: "2026-01-01T00:00:00.000Z" }), tx("d", { type: "debit", createdAt: "2026-01-02T00:00:00.000Z" }), tx("c", { type: "credit", createdAt: "2026-01-03T00:00:00.000Z" })];
  assert.deepEqual(ids(list), ["c", "d", "t"]);
});

test("sameDayOrder: same day and kind, older createdAt first; a missing createdAt sorts first", () => {
  const list = [tx("new", { createdAt: "2026-11-02T00:00:00.000Z" }), tx("old", { createdAt: "2026-11-01T00:00:00.000Z" }), tx("legacy", { createdAt: undefined })];
  assert.deepEqual(ids(list), ["legacy", "old", "new"]);
});

test("sameDayOrder: a createdAt tie falls to _id ascending; identical keys compare equal", () => {
  const list = [tx("bbbbbbbbbbbbbbbbbbbbbbbb"), tx("aaaaaaaaaaaaaaaaaaaaaaab"), tx("aaaaaaaaaaaaaaaaaaaaaaaa")];
  assert.deepEqual(ids(list), ["aaaaaaaaaaaaaaaaaaaaaaaa", "aaaaaaaaaaaaaaaaaaaaaaab", "bbbbbbbbbbbbbbbbbbbbbbbb"]);
  assert.equal(sameDayOrder(tx("x"), tx("x")), 0);
});
