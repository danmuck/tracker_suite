import { test } from "node:test";
import assert from "node:assert/strict";
import {
  activeListings,
  cityNames,
  cityStats,
  compareBest,
  pricePerSqft,
  rentGuide,
  rentShare,
  splitTours,
  statusCounts,
} from "./stats";

const listing = (over: Record<string, unknown>) =>
  ({ _id: "x", city: "Boston", rent: 200000, status: "saved", ...over }) as never;

test("cityNames merges case and whitespace and sorts", () => {
  const names = cityNames([{ city: "Providence" }, { city: " Boston " }, { city: "providence" }, { city: "Albany" }]);
  assert.deepEqual(names, ["Albany", "Boston", "Providence"]);
});

test("cityNames shows the most used spelling; a tie goes to capitals first", () => {
  assert.deepEqual(cityNames([{ city: "boston" }, { city: "Boston" }]), ["Boston"]);
  assert.deepEqual(cityNames([{ city: "Boston" }, { city: "boston" }, { city: "boston" }]), ["boston"]);
});

test("activeListings drops rejected only", () => {
  const out = activeListings([{ status: "saved" }, { status: "rejected" }, { status: "signed" }] as never);
  assert.equal(out.length, 2);
});

test("cityStats: count, rounded average, range; cheapest average first", () => {
  const stats = cityStats([
    { city: "Boston", rent: 300000 },
    { city: "boston", rent: 200001 },
    { city: "Hartford", rent: 150000 },
  ]);
  assert.deepEqual(stats, [
    { city: "Hartford", count: 1, avg: 150000, min: 150000, max: 150000 },
    { city: "Boston", count: 2, avg: 250001, min: 200001, max: 300000 },
  ]);
});

test("cityStats on no listings is empty", () => {
  assert.deepEqual(cityStats([]), []);
});

test("statusCounts keeps pipeline order and skips empty statuses", () => {
  const counts = statusCounts([{ status: "toured" }, { status: "saved" }, { status: "toured" }] as never);
  assert.deepEqual(counts, [
    { status: "saved", count: 1 },
    { status: "toured", count: 2 },
  ]);
});

test("rentShare and rentGuide need a salary", () => {
  assert.equal(rentShare(200000, undefined), null);
  assert.equal(rentShare(200000, 0), null);
  assert.equal(rentGuide(undefined), null);
  // $96,000/yr → $8,000/mo; $2,000 rent is 25%; guide is $2,400
  assert.equal(rentShare(200000, 9600000), 0.25);
  assert.equal(rentGuide(9600000), 240000);
});

test("pricePerSqft is cents per sq ft, null without size", () => {
  assert.equal(pricePerSqft(200000, 800), 250);
  assert.equal(pricePerSqft(200000, undefined), null);
  assert.equal(pricePerSqft(200000, 0), null);
});

test("compareBest: lowest rent and commute win, highest size and rating win", () => {
  const best = compareBest([
    listing({ _id: "a", rent: 200000, sqft: 800, commuteMinutes: 30, rating: 3 }),
    listing({ _id: "b", rent: 180000, sqft: 600, commuteMinutes: 45, rating: 5 }),
  ]);
  assert.deepEqual(best.rent, ["b"]);
  assert.deepEqual(best.sqft, ["a"]);
  assert.deepEqual(best.commuteMinutes, ["a"]);
  assert.deepEqual(best.rating, ["b"]);
  // 200000/800 = 250 vs 180000/600 = 300
  assert.deepEqual(best.pricePerSqft, ["a"]);
});

test("compareBest: ties all win; all-equal or single-valued metrics have no winner", () => {
  const best = compareBest([
    listing({ _id: "a", rent: 180000, beds: 2, sqft: 700 }),
    listing({ _id: "b", rent: 180000, beds: 2 }),
    listing({ _id: "c", rent: 220000, beds: 2 }),
  ]);
  assert.deepEqual(best.rent, ["a", "b"]);
  assert.deepEqual(best.beds, []);
  assert.deepEqual(best.sqft, []);
  assert.deepEqual(best.baths, []);
});

test("splitTours: today counts as upcoming; upcoming soonest first, past latest first", () => {
  const tours = [
    { id: 1, date: "2026-11-20", time: "15:00" },
    { id: 2, date: "2026-11-16" },
    { id: 3, date: "2026-11-20", time: "09:30" },
    { id: 4, date: "2026-11-10" },
    { id: 5, date: "2026-11-14" },
  ];
  const { upcoming, past } = splitTours(tours, "2026-11-16");
  assert.deepEqual(upcoming.map((t) => t.id), [2, 3, 1]);
  assert.deepEqual(past.map((t) => t.id), [5, 4]);
});
