import { test } from "node:test";
import assert from "node:assert/strict";
import { addDays } from "date-fns";
import { computeStreak } from "./stats";
import { fromDay, toDay } from "./format";

// Wednesday 2026-03-18. Weeks run Sunday to Saturday: this one from 03-15, the one before from 03-08.
const TODAY = "2026-03-18";

/**
 * Days as a pattern ending today: "A" active, "." rest, "?" today with nothing logged yet.
 * "AA.A" means three days ago active, two days ago active, yesterday rest, today active.
 */
function streak(pattern: string, today = TODAY) {
  const end = fromDay(today);
  const days = new Set<string>();
  [...pattern].forEach((c, i) => {
    if (c === "A") days.add(toDay(addDays(end, i - (pattern.length - 1))));
  });
  return computeStreak(days, end);
}

test("no activity is no streak", () => {
  assert.deepEqual(computeStreak(new Set(), fromDay(TODAY)), { current: 0, longest: 0 });
});

test("consecutive active days count as before", () => {
  assert.deepEqual(streak("AAAA"), { current: 4, longest: 4 });
});

test("a single rest day does not break the streak and counts toward its length", () => {
  assert.deepEqual(streak("AA.AA"), { current: 5, longest: 5 });
});

test("two rest days in a row within one week break it", () => {
  // Rests Sun 03-15 and Mon 03-16
  assert.deepEqual(streak("AAA..AA"), { current: 2, longest: 3 });
});

test("a weekend off (Saturday and Sunday) does not break it", () => {
  // From Mon 03-09: rests Sat 03-14 and Sun 03-15
  assert.deepEqual(streak("AAAAA..AAA"), { current: 10, longest: 10 });
});

test("a weekend off followed by a rest on Monday breaks it", () => {
  // From Mon 03-09: rests Sat, Sun and Mon; Monday follows Sunday in the same week
  assert.deepEqual(streak("AAAAA...AA"), { current: 2, longest: 5 });
});

test("a third rest day in the same Sunday–Saturday week breaks it", () => {
  // From Sun 03-08: rests Mon, Wed and Fri; the streak breaks on Friday and restarts on Saturday
  assert.deepEqual(streak("A.A.A.AAAAA"), { current: 5, longest: 5 });
});

test("rest days in different weeks do not add up", () => {
  // From Wed 03-11: rests Thu 03-12, Sat 03-14 and Mon 03-16, three within 7 days but across two weeks
  assert.deepEqual(streak("A.A.A.AA"), { current: 8, longest: 8 });
});

test("rest days before the streak began do not count toward its week", () => {
  // Sat 03-07 active, Sun and Mon rest (break), then from Tue 03-10 rests Wed and Fri only
  assert.deepEqual(streak("A..A.A.AAAAA"), { current: 9, longest: 9 });
});

test("rests spread out keep the streak going", () => {
  // From Mon 03-02: rests Tue and Sat, then Thu, then Tue; no week holds more than two
  assert.deepEqual(streak("A.AAA.AAAA.AAAA.A"), { current: 17, longest: 17 });
});

test("two rests in a week are allowed", () => {
  // From Sun 03-08: rests Mon and Wed
  assert.deepEqual(streak("A.A.AAAAAAA"), { current: 11, longest: 11 });
});

test("today with nothing logged yet keeps the streak; it ends at the last active day", () => {
  assert.deepEqual(streak("AAA?"), { current: 3, longest: 3 });
  assert.deepEqual(streak("AAA.?"), { current: 3, longest: 3 });
});

test("two rest days in a row this week end the current streak even before today is logged", () => {
  // Rests Mon 03-16 and Tue 03-17
  assert.deepEqual(streak("AAA..?"), { current: 0, longest: 3 });
});

test("on Monday, a weekend off still leaves the current streak standing", () => {
  // Today Mon 03-16: rests Sat 03-14 and Sun 03-15
  assert.deepEqual(streak("AAA..?", "2026-03-16"), { current: 3, longest: 3 });
});

test("a third rest in this week, yesterday, ends the current streak", () => {
  // Today Sat 03-21, from Sun 03-15: rests Mon, Wed and Fri
  assert.deepEqual(streak("A.A.A.?", "2026-03-21"), { current: 0, longest: 5 });
});

test("days after today are ignored", () => {
  const days = new Set([TODAY, "2026-03-20"]);
  assert.deepEqual(computeStreak(days, fromDay(TODAY)), { current: 1, longest: 1 });
});
