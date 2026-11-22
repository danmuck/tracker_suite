import test from "node:test";
import assert from "node:assert/strict";
import { asDate, toIso, filterDate, firstFutureInstant, isFutureDated, lastPresentInstant, localDateStr, todayStoredDate } from "./dates";

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

test("localDateStr, todayStoredDate and firstFutureInstant use the local calendar day of the given clock", () => {
  assert.equal(localDateStr(new Date("2026-11-17T15:00:00.000Z")), "2026-11-17");
  assert.equal(localDateStr(new Date("2026-11-17T03:00:00.000Z")), "2026-11-16");
  const now = new Date("2026-11-17T15:00:00.000Z");
  assert.equal(todayStoredDate(now), "2026-11-17T00:00:00.000Z");
  assert.equal(firstFutureInstant(now), "2026-11-18T00:00:00.000Z");
  assert.equal(now.toISOString(), "2026-11-17T15:00:00.000Z");
});

test("todayStoredDate and firstFutureInstant across DST, year end and a UTC date that is already tomorrow", () => {
  const cases: [string, string, string][] = [
    ["2026-03-08T06:30:00Z", "2026-03-08T00:00:00.000Z", "2026-03-09T00:00:00.000Z"],
    ["2026-12-31T23:30:00Z", "2026-12-31T00:00:00.000Z", "2027-01-01T00:00:00.000Z"],
    ["2026-11-17T03:00:00Z", "2026-11-16T00:00:00.000Z", "2026-11-17T00:00:00.000Z"],
  ];
  for (const [instant, today, future] of cases) {
    assert.equal(todayStoredDate(new Date(instant)), today);
    assert.equal(firstFutureInstant(new Date(instant)), future);
  }
});

test("isFutureDated compares the stored UTC day with the local day of now", () => {
  const west = new Date("2026-11-18T03:00:00.000Z"); // 17 Nov in New York, 18 Nov in UTC
  assert.equal(isFutureDated("2026-11-17", west), false);
  assert.equal(isFutureDated("2026-11-17T23:59:59.999Z", west), false);
  assert.equal(isFutureDated("2026-11-18", west), true);
  assert.equal(isFutureDated(new Date("2026-11-18T00:00:00.000Z"), west), true);
  assert.equal(isFutureDated("garbage", west), false);
});

test("lastPresentInstant: an inclusive upper bound that keeps exactly the dates isFutureDated calls not future", () => {
  const west = new Date("2026-11-18T03:00:00.000Z"); // 17 Nov in New York, 18 Nov in UTC
  assert.equal(lastPresentInstant(west), "2026-11-17T23:59:59.999Z");
  const kept = (date: string) => new Date(date).getTime() <= new Date(lastPresentInstant(west)).getTime();
  for (const date of ["2026-11-17T00:00:00.000Z", "2026-11-17T23:59:59.999Z", "2026-11-18T00:00:00.000Z", "2026-11-16T12:00:00.000Z"]) {
    assert.equal(kept(date), !isFutureDated(date, west), date);
  }
  // The local end of day is not that bound west of UTC: it reaches into the next UTC day
  assert.equal(lastPresentInstant(new Date("2026-11-17T15:00:00.000Z")), "2026-11-17T23:59:59.999Z");
});
