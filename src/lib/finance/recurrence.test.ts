import { test } from "node:test";
import assert from "node:assert/strict";
import { expandRecurrence } from "./recurrence";
import { fromDateStr, toDateStr } from "./dates";

const W = (a: string, b: string) => [fromDateStr(a), fromDateStr(b)] as const;

// Run with TZ=America/New_York (DST ends Nov 1 2026) — see package.json "test" script
test("occurrence on the window's last day is included across a DST change", () => {
  const rule = { frequency: "monthly" as const, interval: 1, startDate: "2026-10-12", endDate: null, dayOfMonth: 12 };
  assert.deepEqual(expandRecurrence(rule, ...W("2026-11-13", "2026-12-12")).map(toDateStr), ["2026-12-12"]);
  assert.deepEqual(expandRecurrence(rule, ...W("2026-10-01", "2026-12-12")).map(toDateStr), ["2026-10-12", "2026-11-12", "2026-12-12"]);
});

test("weekly and biweekly occurrences on the window's last day survive DST", () => {
  const weekly = { frequency: "weekly" as const, interval: 1, startDate: "2026-10-02", endDate: null, dayOfWeek: 5 };
  assert.equal(expandRecurrence(weekly, ...W("2026-11-01", "2026-11-13")).map(toDateStr).at(-1), "2026-11-13");
  const biweekly = { frequency: "biweekly" as const, startDate: "2026-10-02", endDate: null, dayOfWeek: 5 };
  assert.equal(expandRecurrence(biweekly, ...W("2026-11-01", "2026-11-13")).map(toDateStr).at(-1), "2026-11-13");
});

test("occurrences are returned at noon UTC", () => {
  const rule = { frequency: "monthly" as const, interval: 1, startDate: "2026-10-12", endDate: null, dayOfMonth: 12 };
  for (const d of expandRecurrence(rule, ...W("2026-10-01", "2027-04-30"))) assert.equal(d.getUTCHours(), 12);
});
