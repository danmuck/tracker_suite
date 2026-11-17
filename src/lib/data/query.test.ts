import { test } from "node:test";
import assert from "node:assert/strict";
import { applyUpdate, matches, selectFields, sortDocs } from "./query";

const doc: Record<string, unknown> = { _id: "a", name: "Rent", amount: 875, tags: ["bills", "home"], date: "2026-11-01T05:00:00.000Z", note: null };

test("equality, array contains, missing fields", () => {
  assert.equal(matches(doc, { name: "Rent" }), true);
  assert.equal(matches(doc, { tags: "home" }), true);
  assert.equal(matches(doc, { tags: "car" }), false);
  assert.equal(matches(doc, { missing: null }), true);
  assert.equal(matches(doc, { note: null }), true);
  assert.equal(matches(doc, {}), true);
});

test("comparison operators, including Date against ISO strings", () => {
  assert.equal(matches(doc, { amount: { $gte: 875, $lt: 900 } }), true);
  assert.equal(matches(doc, { amount: { $gt: 875 } }), false);
  assert.equal(matches(doc, { date: { $gte: new Date("2026-11-01T00:00:00.000Z"), $lte: new Date("2026-11-30T00:00:00.000Z") } }), true);
  assert.equal(matches(doc, { _id: { $ne: "a" } }), false);
  assert.equal(matches(doc, { _id: { $in: ["a", "b"] } }), true);
  assert.equal(matches(doc, { missing: { $exists: false } }), true);
  assert.equal(matches(doc, { name: { $regex: "ren", $options: "i" } }), true);
});

test("$or and unknown operators", () => {
  assert.equal(matches(doc, { $or: [{ name: "x" }, { amount: 875 }] }), true);
  assert.equal(matches(doc, { $or: [{ name: "x" }, { amount: 1 }] }), false);
  assert.throws(() => matches(doc, { amount: { $mod: [2, 0] } }), /Unsupported filter operator: \$mod/);
});

test("applyUpdate handles $set, $unset, $inc and $setOnInsert without mutating", () => {
  const next = applyUpdate(doc, { $set: { name: "Rent 2" }, $unset: { note: 1 }, $inc: { amount: -75, count: 2 } });
  assert.deepEqual([next.name, next.amount, next.count, "note" in next], ["Rent 2", 800, 2, false]);
  assert.equal(doc.name, "Rent");
  assert.equal(applyUpdate(doc, { $setOnInsert: { name: "x" } }).name, "Rent");
  assert.equal(applyUpdate(doc, { $setOnInsert: { name: "x" } }, true).name, "x");
});

test("sortDocs sorts by several keys and selectFields keeps _id", () => {
  const rows = [{ _id: "1", order: 1, createdAt: "b" }, { _id: "2", order: 0, createdAt: "a" }, { _id: "3", order: 1, createdAt: "c" }];
  assert.deepEqual(sortDocs(rows, { order: 1, createdAt: -1 }).map((r) => r._id), ["2", "3", "1"]);
  assert.deepEqual(selectFields(rows[0], ["order"]), { _id: "1", order: 1 });
});

test("dotted paths fail loudly in filters and updates", () => {
  assert.throws(() => matches(doc, { "exercises.name": "x" }), /Dotted paths are not supported: exercises\.name/);
  assert.throws(() => matches(doc, { $or: [{ name: "Rent" }, { "a.b": 1 }] }), /Dotted paths are not supported: a\.b/);
  assert.throws(() => applyUpdate(doc, { $set: { "a.b": 1 } }), /Dotted paths are not supported: a\.b/);
  assert.throws(() => applyUpdate(doc, { $unset: { "a.b": "" } }), /Dotted paths are not supported: a\.b/);
  assert.throws(() => applyUpdate(doc, { $inc: { "a.b": 1 } }), /Dotted paths are not supported: a\.b/);
  assert.throws(() => applyUpdate(doc, { $setOnInsert: { "a.b": 1 } }, true), /Dotted paths are not supported: a\.b/);
});

test("sortDocs treats null and missing as the same value, first when ascending", () => {
  const rows: Record<string, unknown>[] = [{ _id: "1", t: null }, { _id: "2" }, { _id: "3", t: "a" }];
  assert.deepEqual(sortDocs(rows, { t: 1, _id: 1 }).map((r) => r._id), ["1", "2", "3"]);
  assert.deepEqual(sortDocs(rows, { t: -1, _id: 1 }).map((r) => r._id), ["3", "1", "2"]);
});

test("$in and $or need arrays and say so", () => {
  assert.throws(() => matches(doc, { _id: { $in: "a" } }), { message: "$in needs an array" });
  assert.throws(() => matches(doc, { $or: { name: "Rent" } }), { message: "$or needs an array" });
  assert.throws(() => matches(doc, { $or: 1 }), { message: "$or needs an array" });
});
