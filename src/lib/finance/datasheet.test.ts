import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildRentSchedule,
  buildSalarySchedule,
  hourlyToAnnual,
  salaryRow,
  stepOn,
  tenYearRows,
} from "./datasheet";
import type { FinanceProfileData } from "@/types/finance/datasheet";

function profile(overrides: Partial<FinanceProfileData> = {}): FinanceProfileData {
  return {
    filingStatus: "single",
    hoursPerWeek: 40,
    nycResident: false,
    raiseRate: 0.03,
    salaryTransactionId: null,
    rentTransactionId: null,
    salarySteps: [{ effectiveDate: "2026-10-02", annualGross: 6_240_000 }],
    retirementSteps: [],
    healthSteps: [],
    rentSteps: [],
    whatIfSalaries: [],
    ...overrides,
  };
}

function near(actual: number, expected: number, tol = 1) {
  assert.ok(Math.abs(actual - expected) <= tol, `expected ${expected} ±${tol}, got ${actual}`);
}

test("hourlyToAnnual: $30/hr × 40h × 52", () => {
  assert.equal(hourlyToAnnual(3000, 40), 6_240_000);
});

test("stepOn picks latest step on or before date", () => {
  const steps = [
    { effectiveDate: "2027-01-01", v: 2 },
    { effectiveDate: "2026-01-01", v: 1 },
  ];
  assert.equal(stepOn(steps, "2025-12-31"), undefined);
  assert.equal(stepOn(steps, "2026-06-01")?.v, 1);
  assert.equal(stepOn(steps, "2027-01-01")?.v, 2);
});

test("salaryRow gross columns match spreadsheet ($30/hr)", () => {
  const row = salaryRow(6_240_000, profile(), "2026-11-14", 26);
  assert.equal(row.hourly, 3000);
  assert.equal(row.weeklyGross, 120_000);
  assert.equal(row.monthlyGross, 520_000);
  assert.equal(row.annualGross, 6_240_000);
  assert.ok(row.annualNet < row.annualGross && row.annualNet > 0);
  near(row.monthlyNet, Math.round(row.annualNet / 12));
});

test("tenYearRows compounds the raise rate", () => {
  const rows = tenYearRows(6_240_000, profile(), "2026-11-14", 26);
  assert.equal(rows.length, 11);
  assert.equal(rows[0].annualGross, 6_240_000);
  assert.equal(rows[1].annualGross, 6_427_200);
  near(rows[10].weeklyGross, 161_270);
  near(rows[10].annualGross, 8_386_038); // 62,400 × 1.03^10 = 83,860.38
});

test("schedule starts at earliest salary step", () => {
  const p = profile({ salarySteps: [{ effectiveDate: "2027-01-01", annualGross: 6_240_000 }], healthSteps: [{ effectiveDate: "2026-01-01", perPaycheck: 8500 }] });
  const s = buildSalarySchedule(p, 26);
  assert.equal(s.length, 1);
  assert.equal(s[0].effectiveDate, "2027-01-01");
});

test("401k step lowers net in a second entry", () => {
  const p = profile({
    retirementSteps: [
      { effectiveDate: "2026-10-02", percent: 0.06 },
      { effectiveDate: "2027-06-04", percent: 0.08 },
    ],
  });
  const s = buildSalarySchedule(p, 26);
  assert.deepEqual(s.map((e) => e.effectiveDate), ["2026-10-02", "2027-06-04"]);
  assert.ok(s[1].amount < s[0].amount);
});

test("raise step raises net", () => {
  const p = profile({ salarySteps: [{ effectiveDate: "2026-10-02", annualGross: 6_240_000 }, { effectiveDate: "2027-03-05", annualGross: 6_600_000 }] });
  const s = buildSalarySchedule(p, 26);
  assert.equal(s.length, 2);
  assert.ok(s[1].amount > s[0].amount);
});

test("identical consecutive nets are collapsed", () => {
  const p = profile({ healthSteps: [{ effectiveDate: "2026-10-02", perPaycheck: 0 }, { effectiveDate: "2027-01-01", perPaycheck: 0 }] });
  assert.equal(buildSalarySchedule(p, 26).length, 1);
});

test("no salary steps → empty schedule", () => {
  assert.deepEqual(buildSalarySchedule(profile({ salarySteps: [] }), 26), []);
});

test("buildRentSchedule maps monthly and sorts", () => {
  const p = profile({ rentSteps: [{ effectiveDate: "2027-05-01", monthly: 210_000 }, { effectiveDate: "2026-03-01", monthly: 180_000 }] });
  assert.deepEqual(buildRentSchedule(p), [
    { effectiveDate: "2026-03-01", amount: 180_000 },
    { effectiveDate: "2027-05-01", amount: 210_000 },
  ]);
});
