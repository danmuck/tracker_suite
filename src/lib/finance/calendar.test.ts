import { test } from "node:test";
import assert from "node:assert/strict";
import { bankBalance, cardBalance, creditPosition, creditUtilization, monthWeeks, parseMonth, shiftMonth, signedAmount, weekEndDate } from "./calendar";

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

test("cardBalance adds credit cards only", () => {
  const accounts = [
    { _id: "a", type: "bank" },
    { _id: "c", type: "credit_card" },
    { _id: "e", type: "credit_card" },
    { _id: "d", type: "debt" },
  ];
  assert.equal(cardBalance({ a: 10_000, c: 50_000, e: 1_500, d: 90_000 }, accounts), 51_500);
  assert.equal(cardBalance({}, accounts), 0);
});

test("weekEndDate is each row's Saturday, in the next month for a short last row", () => {
  // November 2026: Sunday the 1st to Monday the 30th
  assert.deepEqual(monthWeeks("2026-11").map(weekEndDate), [
    "2026-11-07", "2026-11-14", "2026-11-21", "2026-11-28", "2026-12-05",
  ]);
  // December 2026 starts on a Tuesday and ends on a Thursday, into the next year
  const dec = monthWeeks("2026-12").map(weekEndDate);
  assert.equal(dec[0], "2026-12-05");
  assert.equal(dec.at(-1), "2027-01-02");
  // A month that ends on a Saturday stays inside itself
  assert.equal(monthWeeks("2026-10").map(weekEndDate).at(-1), "2026-10-31");
});

test("creditPosition is the balance owed as a negative, or the available credit when nothing is owed", () => {
  const accounts = [
    { _id: "a", type: "bank" },
    { _id: "c", type: "credit_card", creditLimit: 500_000 },
    { _id: "e", type: "credit_card", creditLimit: 200_000 },
    { _id: "x", type: "credit_card", creditLimit: 900_000, isArchived: true },
    { _id: "n", type: "credit_card" },
    { _id: "d", type: "debt" },
  ];
  assert.equal(creditPosition({ a: 10_000, c: 40_000, e: 9_999, d: 90_000 }, accounts), -49_999);
  assert.equal(creditPosition({ a: 10_000, c: 0, e: 0, d: 90_000 }, accounts), 700_000);
  assert.equal(creditPosition({}, accounts), 700_000);
  // An overpaid card adds its credit to what is available
  assert.equal(creditPosition({ c: -2_500, e: 0 }, accounts), 702_500);
  // Owed on one card is shown even when another is overpaid by less
  assert.equal(creditPosition({ c: 5_000, e: -1_000 }, accounts), -4_000);
});

test("creditUtilization is the owed share of the active cards' limits", () => {
  const accounts = [
    { _id: "c", type: "credit_card", creditLimit: 300_000 },
    { _id: "e", type: "credit_card", creditLimit: 100_000 },
    { _id: "x", type: "credit_card", creditLimit: 900_000, isArchived: true },
    { _id: "d", type: "debt" },
  ];
  assert.equal(creditUtilization({ c: 60_000, e: 40_000, d: 90_000 }, accounts), 0.25);
  assert.equal(creditUtilization({ c: 99_999 }, accounts), 99_999 / 400_000);
  assert.equal(creditUtilization({ c: 0, e: 0 }, accounts), 0);
  assert.equal(creditUtilization({ c: -5_000 }, accounts), 0);
  assert.equal(creditUtilization({ c: 500_000 }, accounts), 1.25);
  // Owed with no limit on any card: unknown
  assert.equal(creditUtilization({ n: 5_000 }, [{ _id: "n", type: "credit_card" }]), null);
});
