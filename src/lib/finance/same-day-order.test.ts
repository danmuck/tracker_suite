import test from "node:test";
import assert from "node:assert/strict";
import { dayRank, sameDayOrder } from "./same-day-order";

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

test("sameDayOrder: within a day income (bank credits), then bank transfers, then debits", () => {
  const list = [tx("t", { type: "transfer", createdAt: "2026-01-01T00:00:00.000Z" }), tx("d", { type: "debit", createdAt: "2026-01-02T00:00:00.000Z" }), tx("c", { type: "credit", createdAt: "2026-01-03T00:00:00.000Z" })];
  assert.deepEqual(ids(list), ["c", "t", "d"]);
});

test("sameDayOrder: a credit on a debt account is a payment, ranked with transfers by createdAt", () => {
  const charge = tx("charge", { type: "debit", onDebtAccount: true, createdAt: "2026-01-03T00:00:00.000Z" });
  const payment = tx("payment", { type: "credit", onDebtAccount: true, createdAt: "2026-01-01T00:00:00.000Z" });
  const transfer = tx("transfer", { type: "transfer", toDebtAccount: true, createdAt: "2026-01-02T00:00:00.000Z" });
  const income = tx("income", { type: "credit", createdAt: "2026-01-04T00:00:00.000Z" });
  assert.deepEqual(ids([payment, transfer, charge, income]), ["income", "charge", "payment", "transfer"]);
  assert.deepEqual(ids([{ ...payment, createdAt: "2026-01-05T00:00:00.000Z" }, transfer, charge, income]), ["income", "charge", "transfer", "payment"]);
  // A debit ranks the same whatever its account
  assert.deepEqual(ids([tx("d1", { onDebtAccount: false, createdAt: "2026-01-02T00:00:00.000Z" }), tx("d2", { onDebtAccount: true, createdAt: "2026-01-01T00:00:00.000Z" })]), ["d2", "d1"]);
  assert.deepEqual(
    [dayRank({ type: "credit" }), dayRank({ type: "transfer" }), dayRank({ type: "debit", onDebtAccount: true }), dayRank({ type: "transfer", toDebtAccount: true }), dayRank({ type: "credit", onDebtAccount: true })],
    [0, 1, 2, 3, 3]
  );
});

test("sameDayOrder: same day and rank, older createdAt first; a missing or unparseable createdAt sorts last", () => {
  const list = [tx("new", { createdAt: "2026-11-02T00:00:00.000Z" }), tx("old", { createdAt: "2026-11-01T00:00:00.000Z" }), tx("whatif", { createdAt: undefined })];
  assert.deepEqual(ids(list), ["old", "new", "whatif"]);
  const bad = tx("bad", { createdAt: "not a date" });
  assert.doesNotThrow(() => sameDayOrder(bad, list[0]));
  assert.deepEqual(ids([bad, ...list]), ["old", "new", "bad", "whatif"]); // ties with a missing one: _id decides
  assert.deepEqual(ids([tx("zz", { createdAt: undefined }), tx("aa", { createdAt: "garbage" })]), ["aa", "zz"]);
});

test("sameDayOrder: a createdAt tie falls to _id ascending; identical keys compare equal", () => {
  const list = [tx("bbbbbbbbbbbbbbbbbbbbbbbb"), tx("aaaaaaaaaaaaaaaaaaaaaaab"), tx("aaaaaaaaaaaaaaaaaaaaaaaa")];
  assert.deepEqual(ids(list), ["aaaaaaaaaaaaaaaaaaaaaaaa", "aaaaaaaaaaaaaaaaaaaaaaab", "bbbbbbbbbbbbbbbbbbbbbbbb"]);
  assert.equal(sameDayOrder(tx("x"), tx("x")), 0);
});
