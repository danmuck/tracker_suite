import { test } from "node:test";
import assert from "node:assert/strict";
import { amountOn } from "./amount-schedule";
import { buildProjection } from "./projection-engine";

const schedule = [
  { effectiveDate: "2027-03-05", amount: 200 },
  { effectiveDate: "2026-10-02", amount: 100 },
];

test("no schedule → base", () => {
  assert.equal(amountOn(50, undefined, "2027-01-01"), 50);
  assert.equal(amountOn(50, [], "2027-01-01"), 50);
});

test("picks schedule entry by occurrence date (unsorted input)", () => {
  assert.equal(amountOn(50, schedule, "2026-10-01"), 50);
  assert.equal(amountOn(50, schedule, "2026-10-02"), 100);
  assert.equal(amountOn(50, schedule, "2027-03-04"), 100);
  assert.equal(amountOn(50, schedule, "2027-03-05"), 200);
});

test("accepts Date effective dates stored at UTC midnight", () => {
  const s = [{ effectiveDate: new Date("2027-03-05T00:00:00.000Z"), amount: 200 }];
  assert.equal(amountOn(50, s, "2027-03-05"), 200);
  assert.equal(amountOn(50, s, "2027-03-04"), 50);
});

const id = (s: string) => ({ toString: () => s });

test("buildProjection applies schedule to recurring occurrences", () => {
  const accounts = [{ _id: id("a1"), type: "bank", balance: 0, isArchived: false }];
  const transactions = [
    {
      _id: id("t1"),
      amount: 50,
      date: new Date("2026-10-02"),
      description: "Salary",
      accountId: id("a1"),
      type: "credit",
      isRecurring: true,
      categoryTags: [],
      recurrenceRule: { frequency: "biweekly", interval: 1, startDate: new Date("2026-10-02"), endDate: null, dayOfWeek: 5 },
      amountSchedule: [
        { effectiveDate: new Date("2026-10-02"), amount: 100 },
        { effectiveDate: new Date("2026-10-30"), amount: 300 },
      ],
    },
  ];
  const result = buildProjection({
    accounts: accounts as never,
    transactions: transactions as never,
    startDate: new Date("2026-10-01"),
    endDate: new Date("2026-11-14"),
  });
  const got = result.timeline.flatMap((d) => d.transactions).map((t) => `${t.date}:${t.amount}`);
  assert.deepEqual(got, ["2026-10-02:100", "2026-10-16:100", "2026-10-30:300", "2026-11-13:300"]);
});

test("buildProjection rejects windows longer than 100 years", () => {
  assert.throws(
    () => buildProjection({ accounts: [], transactions: [], startDate: new Date("2026-01-01"), endDate: new Date("9999-01-01") }),
    RangeError
  );
});
