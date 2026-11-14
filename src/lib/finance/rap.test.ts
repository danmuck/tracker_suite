import { test } from "node:test";
import assert from "node:assert/strict";
import { priorYearAgi, rapMonthlyPayment, rapScheduleEntries } from "./rap";
import { DEFAULT_PROFILE } from "./finance-profile";

test("rapMonthlyPayment tiers, dependents and floor", () => {
  assert.equal(rapMonthlyPayment(1_000_000, 0), 1_000); // ≤ $10k → $10
  assert.equal(rapMonthlyPayment(1_000_100, 0), 1_000); // 1% of $10,001 = $8.33 → floor
  assert.equal(rapMonthlyPayment(2_000_000, 0), 1_667); // 1%
  assert.equal(rapMonthlyPayment(10_000_000, 0), 75_000); // 9%
  assert.equal(rapMonthlyPayment(10_000_100, 0), 83_334); // 10%
  assert.equal(rapMonthlyPayment(5_000_000, 2), 6_667); // 4% − $100
  assert.equal(rapMonthlyPayment(2_000_000, 3), 1_000); // floor
});

const profile = {
  ...DEFAULT_PROFILE,
  salarySteps: [{ effectiveDate: "2026-01-02", annualGross: 6_240_000 }],
  retirementSteps: [{ effectiveDate: "2026-01-02", percent: 0.06 }],
  healthSteps: [{ effectiveDate: "2026-01-02", perPaycheck: 8_500 }],
};

test("priorYearAgi sums each payday's gross − 401k − health (27 paydays in 2027)", () => {
  // Fridays from Jan 1 2027 every 14 days: the 27th is Dec 31 2027
  const paydays = Array.from({ length: 28 }, (_, i) => new Date(Date.UTC(2027, 0, 1 + i * 14)).toISOString().slice(0, 10));
  assert.equal(paydays[26], "2027-12-31");
  assert.equal(priorYearAgi(profile, paydays, 2027, 26), 5_861_700);
});

test("priorYearAgi is null before the first salary step", () => {
  assert.equal(priorYearAgi(profile, ["2025-06-06", "2025-06-20"], 2025, 26), null);
});

test("rapScheduleEntries uses prior-year income at each recert date", () => {
  const agi: Record<number, number | null> = { 2025: null, 2026: 5_000_000, 2027: 6_000_000, 2028: null };
  const entries = rapScheduleEntries({
    recertDate: "07-01",
    dependents: 0,
    today: "2026-11-14",
    years: 3,
    agiForYear: (y) => agi[y] ?? null,
  });
  assert.deepEqual(entries, [
    { effectiveDate: "2027-07-01", amount: rapMonthlyPayment(5_000_000, 0), source: "rap" },
    { effectiveDate: "2028-07-01", amount: rapMonthlyPayment(6_000_000, 0), source: "rap" },
  ]);
});
