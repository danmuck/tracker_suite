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

test("dotted paths in filters reach into nested objects", () => {
  const doc = { rule: { start: "2026-01-01T00:00:00.000Z", end: null }, rap: { enabled: true } };
  assert.equal(matches(doc, { "rule.start": { $lte: new Date("2026-06-01") } }), true);
  assert.equal(matches(doc, { "rule.end": null }), true);
  assert.equal(matches(doc, { "rule.end": { $exists: false } }), false);
  assert.equal(matches(doc, { "rule.missing": { $exists: false } }), true);
  assert.equal(matches({}, { "rule.end": null }), true);
  assert.equal(matches({}, { "rule.end": { $gte: "2026" } }), false);
  assert.equal(matches({ rule: null }, { "rule.end": { $exists: false } }), true);
  assert.equal(matches({ rule: 5 }, { "rule.end": null }), true);
  assert.equal(matches(doc, { "rap.enabled": true }), true);
  assert.equal(matches({ rap: { enabled: false } }, { "rap.enabled": true }), false);
  assert.equal(matches(doc, { $or: [{ "rule.end": { $gte: "2027" } }, { "rule.end": null }] }), true);
});

test("$and requires every branch, at the top level and nested with $or", () => {
  const doc = { a: 1, b: 2 };
  assert.equal(matches(doc, { $and: [{ a: 1 }, { b: 2 }] }), true);
  assert.equal(matches(doc, { $and: [{ a: 1 }, { b: 3 }] }), false);
  assert.equal(matches(doc, { $and: [{ $or: [{ a: 9 }, { b: 2 }] }, { a: 1 }] }), true);
  assert.equal(matches(doc, { $or: [{ $and: [{ a: 1 }, { b: 3 }] }, { b: 2 }] }), true);
  assert.throws(() => matches(doc, { $and: { a: 1 } }), /\$and needs an array/);
});

test("dotted $set / $unset / $inc write into nested objects without touching siblings or the input", () => {
  const doc = { rule: { start: "a", end: "b" }, n: { count: 1 } };
  assert.deepEqual(applyUpdate(doc, { $set: { "rule.end": null } }), { rule: { start: "a", end: null }, n: { count: 1 } });
  assert.deepEqual(applyUpdate(doc, { $unset: { "rule.end": 1 } }), { rule: { start: "a" }, n: { count: 1 } });
  assert.deepEqual(applyUpdate(doc, { $inc: { "n.count": 2, "n.other": 5 } }), { rule: { start: "a", end: "b" }, n: { count: 3, other: 5 } });
  assert.deepEqual(applyUpdate({}, { $set: { "a.b.c": 1 } }), { a: { b: { c: 1 } } });
  assert.deepEqual(applyUpdate({}, { $setOnInsert: { "a.b": 1 } }, true), { a: { b: 1 } });
  assert.deepEqual(applyUpdate({}, { $unset: { "a.b": 1 } }), {});
  assert.deepEqual(doc, { rule: { start: "a", end: "b" }, n: { count: 1 } });
  assert.throws(() => applyUpdate({ a: 5 }, { $set: { "a.b": 1 } }), /Cannot create field in a\.b/);
  assert.throws(() => applyUpdate({ a: null }, { $set: { "a.b": 1 } }), /Cannot create field in a\.b/);
});

test("a dotted path through an array throws, in filters and updates", () => {
  assert.throws(() => matches({ steps: [{ a: 1 }] }, { "steps.a": 1 }), /Dotted path crosses an array: steps\.a/);
  assert.throws(() => matches({ steps: [] }, { $or: [{ a: 9 }, { "steps.a": 1 }] }), /Dotted path crosses an array: steps\.a/);
  assert.equal(matches({ a: 1 }, { "steps.a": { $exists: false } }), true);
  assert.throws(() => applyUpdate({ steps: [{ a: 1 }] }, { $set: { "steps.0.a": 2 } }), /Dotted path crosses an array: steps\.0\.a/);
});

test("dotted updates: cases beyond the brief throw instead of guessing", () => {
  assert.throws(() => applyUpdate({ steps: [1] }, { $unset: { "steps.0": 1 } }), /Dotted path crosses an array: steps\.0/);
  assert.throws(() => applyUpdate({ steps: [1] }, { $inc: { "steps.0": 1 } }), /Dotted path crosses an array: steps\.0/);
  assert.throws(() => applyUpdate({ a: 5 }, { $unset: { "a.b": 1 } }), /Cannot unset field in a\.b/);
  assert.throws(() => applyUpdate({ a: null }, { $inc: { "a.b": 1 } }), /Cannot create field in a\.b/);
  assert.throws(() => applyUpdate({}, { $set: { a: 1, "a.b": 2 } }), /Conflicting update paths: a and a\.b/);
  assert.throws(() => applyUpdate({}, { $set: { "a.b": 1 }, $unset: { a: 1 } }), /Conflicting update paths/);
  assert.throws(() => applyUpdate({}, { $set: { "a..b": 1 } }), /Invalid path: a\.\.b/);
  assert.throws(() => matches({}, { ".a": 1 }), /Invalid path: \.a/);
  assert.throws(() => applyUpdate({ a: new Date() }, { $set: { "a.b": 1 } }), /Cannot create field in a\.b/);
  assert.equal(matches({ a: new Date() }, { "a.b": null }), true);
});

test("sort follows dotted paths", () => {
  assert.deepEqual(sortDocs([{ r: { d: "b" } }, { r: { d: "a" } }, {}], { "r.d": 1 }), [{}, { r: { d: "a" } }, { r: { d: "b" } }]);
  assert.throws(() => sortDocs([{ r: [{ d: 1 }] }, { r: [] }], { "r.d": 1 }), /Dotted path crosses an array: r\.d/);
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
