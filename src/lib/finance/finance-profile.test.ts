import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PROFILE, profileFromDollars, profileToDollars } from "./finance-profile";

const dollarsInput = {
  filingStatus: "single" as const,
  hoursPerWeek: 40,
  nycResident: false,
  raiseRate: 0.03,
  salaryTransactionId: "abc",
  rentTransactionId: null,
  salarySteps: [{ effectiveDate: "2026-10-02", annualGross: 62400 }],
  retirementSteps: [{ effectiveDate: "2026-10-02", percent: 0.06 }],
  healthSteps: [{ effectiveDate: "2026-10-02", perPaycheck: 85.5 }],
  rentSteps: [{ effectiveDate: "2026-03-01", monthly: 1800 }],
  whatIfSalaries: [{ label: "Offer", annualGross: 52000.01 }],
};

test("profileFromDollars converts money to cents and keeps percents", () => {
  const p = profileFromDollars(dollarsInput);
  assert.equal(p.salarySteps[0].annualGross, 6_240_000);
  assert.equal(p.healthSteps[0].perPaycheck, 8_550);
  assert.equal(p.rentSteps[0].monthly, 180_000);
  assert.equal(p.whatIfSalaries[0].annualGross, 5_200_001);
  assert.equal(p.retirementSteps[0].percent, 0.06);
});

test("profileToDollars round-trips", () => {
  assert.deepEqual(profileToDollars(profileFromDollars(dollarsInput)), dollarsInput);
});

test("DEFAULT_PROFILE has no steps and a 3% raise", () => {
  assert.equal(DEFAULT_PROFILE.raiseRate, 0.03);
  assert.equal(DEFAULT_PROFILE.salarySteps.length, 0);
});
