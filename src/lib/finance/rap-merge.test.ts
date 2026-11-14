import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeRapEntries } from "./rap-merge";

test("manual entry beats rap entry on same date", () => {
  const merged = mergeRapEntries(
    [{ effectiveDate: "2027-07-01", amount: 5_000 }],
    [{ effectiveDate: "2027-07-01", amount: 9_000, source: "rap" }]
  );
  assert.deepEqual(merged, [{ effectiveDate: "2027-07-01", amount: 5_000 }]);
});

test("rap entries kept when no conflict, sorted by date", () => {
  const merged = mergeRapEntries(
    [{ effectiveDate: "2026-11-20", amount: 1_000 }],
    [
      { effectiveDate: "2028-07-01", amount: 9_000, source: "rap" },
      { effectiveDate: "2027-07-01", amount: 8_000, source: "rap" },
    ]
  );
  assert.deepEqual(
    merged.map((e) => e.effectiveDate),
    ["2026-11-20", "2027-07-01", "2028-07-01"]
  );
});

test("rap tags on manual input are ignored (manual stays manual)", () => {
  const merged = mergeRapEntries([{ effectiveDate: "2026-11-20", amount: 1_000, source: "rap" }], []);
  assert.deepEqual(merged, [{ effectiveDate: "2026-11-20", amount: 1_000 }]);
});
