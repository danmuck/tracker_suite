import { test } from "node:test";
import assert from "node:assert/strict";
import { estimatePayoff } from "./payoff";

const flat = (amount: number) => [{ effectiveDate: "2026-12-01", amount }];

test("zero APR pays off in balance / payment months", () => {
  const r = estimatePayoff({ balance: 100_000, apr: 0, schedule: flat(10_000), paymentDay: 1, startDate: "2026-12-01" });
  assert.equal(r.months, 10);
  assert.equal(r.totalInterest, 0);
  assert.equal(r.payoffDate, "2027-09-01");
});

test("with APR the payoff takes longer and accrues interest", () => {
  const r = estimatePayoff({ balance: 100_000, apr: 0.12, schedule: flat(10_000), paymentDay: 1, startDate: "2026-12-01" });
  assert.equal(r.months, 11);
  assert.ok(r.totalInterest > 4_000 && r.totalInterest < 7_000, `interest ${r.totalInterest}`);
});

test("never paid off when payment is below interest", () => {
  const r = estimatePayoff({ balance: 5_500_000, apr: 0.065, schedule: flat(1_000), paymentDay: 15, startDate: "2026-11-20" });
  assert.equal(r.payoffDate, null);
});

test("step change in payments", () => {
  const r = estimatePayoff({
    balance: 100_000,
    apr: 0,
    schedule: [
      { effectiveDate: "2026-12-01", amount: 5_000 },
      { effectiveDate: "2027-02-01", amount: 10_000 },
    ],
    paymentDay: 1,
    startDate: "2026-12-01",
  });
  assert.equal(r.months, 11);
});

test("rap shrinks the balance by the payment each month", () => {
  const r = estimatePayoff({ balance: 100_000, apr: 0.2, schedule: flat(1_000), paymentDay: 1, startDate: "2026-12-01", rap: true });
  assert.equal(r.months, 100);
  assert.notEqual(r.payoffDate, null);
});

test("uses exact payment dates when the plan is not monthly", () => {
  // $1,000 owed, $500 every 4 weeks: Dec 11 then Jan 8
  const r = estimatePayoff({
    balance: 100_000,
    apr: 0,
    schedule: [{ effectiveDate: "2026-10-16", amount: 50_000 }],
    paymentDay: 16,
    startDate: "2026-11-15",
    paymentDates: ["2026-12-11", "2027-01-08", "2027-02-05"],
  });
  assert.equal(r.payoffDate, "2027-01-08");
  assert.equal(r.months, 2);
});
