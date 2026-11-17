import test from "node:test";
import assert from "node:assert/strict";
import { asDate, toIso, filterDate, localDateStr, startOfTomorrow } from "./dates";

test("toIso stores what Mongoose's date cast stores", () => {
  assert.equal(toIso("2026-11-01"), "2026-11-01T00:00:00.000Z");
  assert.equal(toIso("2026-11-01T12:34:56.000Z"), "2026-11-01T12:34:56.000Z");
  assert.equal(toIso(new Date("2026-11-01")), "2026-11-01T00:00:00.000Z");
  assert.equal(toIso("2026"), "2026-01-01T00:00:00.000Z");
  assert.equal(toIso("1767225600000"), "2026-01-01T00:00:00.000Z");
  for (const bad of ["garbage", "", " "]) {
    assert.throws(() => toIso(bad), (e: Error) => /Invalid date/.test(e.message) && !(e instanceof RangeError));
  }
});

test("filterDate is new Date(s).toISOString() with a plain Error for an invalid date", () => {
  assert.equal(filterDate("2026-11-01"), "2026-11-01T00:00:00.000Z");
  for (const bad of ["garbage", "1garbage", "1767225600000", ""]) {
    assert.throws(() => filterDate(bad), (e: Error) => /Invalid date/.test(e.message) && !(e instanceof RangeError));
  }
});

test("asDate passes Dates through and parses strings", () => {
  const d = new Date("2026-11-01T00:00:00.000Z");
  assert.equal(asDate(d), d);
  assert.equal(asDate("2026-11-01T00:00:00.000Z").getTime(), d.getTime());
});

test("localDateStr and startOfTomorrow use the local calendar day of the given clock", () => {
  assert.equal(localDateStr(new Date("2026-11-17T15:00:00.000Z")), "2026-11-17");
  assert.equal(localDateStr(new Date("2026-11-17T03:00:00.000Z")), "2026-11-16");
  assert.equal(startOfTomorrow(new Date("2026-11-17T15:00:00.000Z")).toISOString(), "2026-11-18T05:00:00.000Z");
  const now = new Date("2026-11-17T15:00:00.000Z");
  startOfTomorrow(now);
  assert.equal(now.toISOString(), "2026-11-17T15:00:00.000Z");
});
