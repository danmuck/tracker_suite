import { test } from "node:test";
import assert from "node:assert/strict";
import { blendedApr, monthlyInterest, rapMonthEnd } from "./interest";

test("monthlyInterest: $55,000 at 6.5%", () => {
  assert.equal(monthlyInterest(5_500_000, 0.065), 29_792);
});

test("monthlyInterest is 0 when nothing owed or no APR", () => {
  assert.equal(monthlyInterest(0, 0.2), 0);
  assert.equal(monthlyInterest(-100, 0.2), 0);
  assert.equal(monthlyInterest(100_000, 0), 0);
});

test("blendedApr weights by balance", () => {
  const apr = blendedApr(
    [
      { name: "A", balance: 1_000_000, apr: 0.05 },
      { name: "B", balance: 3_000_000, apr: 0.07 },
    ],
    0
  );
  assert.ok(Math.abs(apr - 0.065) < 1e-12);
});

test("blendedApr falls back when weights are zero or no sub-loans", () => {
  assert.equal(blendedApr([{ name: "A", balance: 0, apr: 0.05 }], 0.04), 0.04);
  assert.equal(blendedApr(undefined, 0.03), 0.03);
  assert.equal(blendedApr([], undefined), 0);
});

test("rapMonthEnd: $10 payment against $250 interest", () => {
  assert.deepEqual(rapMonthEnd(25_000, 1_000), { charged: 1_000, waived: 24_000, match: 1_000 });
});

test("rapMonthEnd: no match when principal paid ≥ $50", () => {
  assert.deepEqual(rapMonthEnd(10_000, 30_000), { charged: 10_000, waived: 0, match: 0 });
});

test("rapMonthEnd: partial match", () => {
  // principal paid 1,000; match = min(5,000, 3,000) − 1,000 = 2,000
  assert.deepEqual(rapMonthEnd(2_000, 3_000), { charged: 2_000, waived: 0, match: 2_000 });
});

test("rap month-end with no payment waives everything", () => {
  assert.deepEqual(rapMonthEnd(25_000, 0), { charged: 0, waived: 25_000, match: 0 });
});

test("rapMonthEnd: match never exceeds the interest charged", () => {
  for (const [interest, paid] of [[2_000, 1_000], [100, 3_000], [40_000, 6_000]]) {
    const r = rapMonthEnd(interest, paid);
    assert.ok(r.match <= r.charged, `${interest}/${paid}`);
  }
});
