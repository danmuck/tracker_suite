import { test } from "node:test";
import assert from "node:assert/strict";
import { calculatePaycheck, type PaycheckInput, type PaycheckLines } from "./tax-calculator";

const base: PaycheckInput = {
  annualGross: 6_240_000, // $62,400
  retirementPercent: 0.06,
  healthPerPaycheck: 8_500, // $85.00
  periodsPerYear: 26,
  filingStatus: "single",
  nycResident: false,
};

function near(actual: number, expected: number, tol = 1) {
  assert.ok(Math.abs(actual - expected) <= tol, `expected ${expected} ±${tol}, got ${actual}`);
}

function deductions(l: PaycheckLines) {
  return l.retirement + l.health + l.federal + l.socialSecurity + l.medicare + l.nyState + l.nyc + l.sdi + l.pfl;
}

test("zero gross → all lines 0", () => {
  const r = calculatePaycheck({ ...base, annualGross: 0, healthPerPaycheck: 0 });
  for (const v of Object.values(r.annual)) assert.equal(v, 0);
  for (const v of Object.values(r.perPeriod)) assert.equal(v, 0);
});

test("$62,400 single NY, 6% 401k, $85/check health: annual lines", () => {
  const { annual } = calculatePaycheck(base);
  assert.equal(annual.gross, 6_240_000);
  assert.equal(annual.retirement, 374_400);
  assert.equal(annual.health, 221_000);
  near(annual.federal, 459_352); // brackets on 40,346
  near(annual.socialSecurity, 373_178); // 6.2% × 60,190
  near(annual.medicare, 87_276); // 1.45% × 60,190
  near(annual.nyState, 245_108); // NY brackets on 48,446
  assert.equal(annual.nyc, 0);
  assert.equal(annual.sdi, 3_120); // capped
  near(annual.pfl, 26_002); // 0.432% × 60,190
  assert.equal(annual.net, annual.gross - deductions(annual));
});

test("per-period lines sum to per-period net", () => {
  const { perPeriod } = calculatePaycheck(base);
  assert.equal(perPeriod.gross, 240_000);
  assert.equal(perPeriod.net, perPeriod.gross - deductions(perPeriod));
});

test("NYC on adds city tax", () => {
  const { annual } = calculatePaycheck({ ...base, nycResident: true });
  near(annual.nyc, 175_382);
});

test("SS capped at wage base and additional Medicare above $200k", () => {
  const { annual } = calculatePaycheck({ ...base, annualGross: 30_000_000, retirementPercent: 0, healthPerPaycheck: 0 });
  assert.equal(annual.socialSecurity, 1_143_900);
  near(annual.medicare, 525_000);
});

test("PFL capped at annual max", () => {
  const { annual } = calculatePaycheck({ ...base, annualGross: 30_000_000 });
  assert.equal(annual.pfl, 41_191);
});

test("married jointly uses its own brackets and deduction", () => {
  const { annual } = calculatePaycheck({ ...base, filingStatus: "married_jointly" });
  // 56,446 − 32,200 = 24,246 → 10% bracket only
  near(annual.federal, 242_460);
});
