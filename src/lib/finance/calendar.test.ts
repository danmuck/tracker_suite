import { test } from "node:test";
import assert from "node:assert/strict";
import { bankBalance, monthWeeks, parseMonth, shiftMonth, signedAmount } from "./calendar";

test("parseMonth keeps a valid month and falls back to today's month", () => {
  assert.equal(parseMonth("2026-12", "2026-11-27"), "2026-12");
  for (const bad of [null, undefined, "", "2026-13", "2026-00", "2026-1", "26-12", "2026-12-01", "abcd-ef"]) {
    assert.equal(parseMonth(bad, "2026-11-27"), "2026-11");
  }
});

test("shiftMonth crosses year ends in both directions", () => {
  assert.equal(shiftMonth("2026-11", 1), "2026-12");
  assert.equal(shiftMonth("2026-12", 1), "2027-01");
  assert.equal(shiftMonth("2027-01", -1), "2026-12");
  assert.equal(shiftMonth("2026-03", -15), "2024-12");
  assert.equal(shiftMonth("2026-03", 0), "2026-03");
});

test("monthWeeks lays the month out Sunday to Saturday", () => {
  // November 2026 starts on a Sunday and has 30 days
  const nov = monthWeeks("2026-11");
  assert.equal(nov.length, 5);
  assert.deepEqual(nov[0], ["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07"]);
  assert.deepEqual(nov[4], ["2026-11-29", "2026-11-30", null, null, null, null, null]);

  // December 2026 starts on a Tuesday
  const dec = monthWeeks("2026-12");
  assert.deepEqual(dec[0], [null, null, "2026-12-01", "2026-12-02", "2026-12-03", "2026-12-04", "2026-12-05"]);
  assert.equal(dec.flat().filter(Boolean).length, 31);
});

test("monthWeeks handles February in leap and common years, and six-week months", () => {
  assert.equal(monthWeeks("2028-02").flat().filter(Boolean).length, 29);
  assert.equal(monthWeeks("2027-02").flat().filter(Boolean).length, 28);
  // February 2026 starts on a Sunday: exactly four weeks, no blanks
  assert.equal(monthWeeks("2026-02").length, 4);
  assert.ok(monthWeeks("2026-02").flat().every(Boolean));
  // August 2026 starts on a Saturday and needs six weeks
  assert.equal(monthWeeks("2026-08").length, 6);
  assert.ok(monthWeeks("2026-08").every((w) => w.length === 7));
});

test("signedAmount follows the direction money moves", () => {
  assert.equal(signedAmount({ type: "credit", amount: 2_500 }), 2_500);
  assert.equal(signedAmount({ type: "debit", amount: 2_500 }), -2_500);
  assert.equal(signedAmount({ type: "transfer", amount: 2_500 }), 0);
});

test("bankBalance adds bank accounts only", () => {
  const accounts = [
    { _id: "a", type: "bank" },
    { _id: "b", type: "bank" },
    { _id: "c", type: "credit_card" },
    { _id: "d", type: "debt" },
  ];
  assert.equal(bankBalance({ a: 10_000, b: -2_000, c: 50_000, d: 90_000 }, accounts), 8_000);
  assert.equal(bankBalance({}, accounts), 0);
});
