import { test } from "node:test";
import assert from "node:assert/strict";
import { monthWeekBuckets } from "./summary-utils";

const day = (date: string, totalCredits: number, totalDebits: number) => ({ date, totalCredits, totalDebits });

test("buckets a 30-day month into 1–7 … 29–30", () => {
  const days = Array.from({ length: 30 }, (_, i) => day(`2026-11-${String(i + 1).padStart(2, "0")}`, 0, 0));
  assert.deepEqual(
    monthWeekBuckets(days).map((b) => b.label),
    ["1–7", "8–14", "15–21", "22–28", "29–30"]
  );
});

test("sums credits and debits per bucket", () => {
  const days = [day("2026-11-01", 100, 5), day("2026-11-07", 50, 0), day("2026-11-13", 200, 30), day("2026-11-27", 0, 10)];
  assert.deepEqual(
    monthWeekBuckets(days).map((b) => [b.label, b.totalCredits, b.totalDebits]),
    [["1–7", 150, 5], ["8–14", 200, 30], ["22–28", 0, 10]]
  );
});

test("empty input → no buckets", () => {
  assert.deepEqual(monthWeekBuckets([]), []);
});
