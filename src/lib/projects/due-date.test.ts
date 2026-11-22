import { test } from "node:test";
import assert from "node:assert/strict";
import { castDate } from "./api/handlers";
import { dueDay, formatDueDay } from "./due-date";

/** Runs `fn` with process.env.TZ set to `tz` (Node re-reads it on assignment), then restores it. */
function withTimeZone(tz: string, fn: () => void): void {
  const before = process.env.TZ;
  process.env.TZ = tz;
  try {
    fn();
  } finally {
    if (before === undefined) delete process.env.TZ;
    else process.env.TZ = before;
  }
}

// West of UTC (the bug: local time shows the day before), east of UTC (local time would be the
// same day at midnight but must not drift for late instants), and UTC itself.
const ZONES = ["America/Los_Angeles", "Pacific/Honolulu", "Asia/Tokyo", "Pacific/Kiritimati", "UTC"];

test("dueDay and formatDueDay give the stored UTC calendar day in every time zone", () => {
  for (const tz of ZONES) {
    withTimeZone(tz, () => {
      // Proves the zone took effect: local midnight is not UTC midnight outside UTC
      if (tz !== "UTC") assert.notEqual(new Date(2026, 10, 18).toISOString(), "2026-11-18T00:00:00.000Z", tz);
      assert.equal(dueDay("2026-11-18T00:00:00.000Z"), "2026-11-18", tz);
      assert.equal(formatDueDay("2026-11-18T00:00:00.000Z"), "Nov 18", tz);
      // A time of day (set through the API) still counts as its UTC day
      assert.equal(dueDay("2026-12-24T23:30:00.000Z"), "2026-12-24", tz);
      assert.equal(formatDueDay("2026-12-31T00:00:00.000Z", "MMM d, yyyy"), "Dec 31, 2026", tz);
      assert.equal(formatDueDay("2027-01-01T00:00:00.000Z"), "Jan 1", tz);
    });
  }
});

test("no due date, null (cleared) and an unparseable value give \"\"", () => {
  for (const value of [undefined, null, "", "not a date"]) {
    assert.equal(dueDay(value), "");
    assert.equal(formatDueDay(value), "");
  }
});

test("round trip: the form's day, stored as the API stores it, reads back as the same day", () => {
  for (const tz of ZONES) {
    withTimeZone(tz, () => {
      for (const day of ["2026-11-18", "2026-03-08", "2026-11-01", "2026-12-31", "2028-02-29"]) {
        const stored = castDate(day);
        assert.equal(stored, `${day}T00:00:00.000Z`, tz);
        assert.equal(dueDay(stored), day, `${tz} ${day}`);
        // Saving the edit form untouched sends the same day again
        assert.equal(castDate(dueDay(stored)), stored, `${tz} ${day}`);
      }
    });
  }
});
