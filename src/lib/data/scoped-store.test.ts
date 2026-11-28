import { test } from "node:test";
import assert from "node:assert/strict";
import { BrowserStore } from "./browser-store";
import { ConflictError } from "./store";
import type { BaseDoc } from "./store";
import { memoryStorage } from "./test-helpers";
import { scopedStore } from "./scoped-store";

const A = "a".repeat(24);
const B = "b".repeat(24);
const MANAGED = new Error("ownerId is managed by the store");

type Item = BaseDoc & Record<string, unknown>;

function setup() {
  const raw = new BrowserStore(memoryStorage());
  return { raw, a: scopedStore(raw, A), b: scopedStore(raw, B) };
}

async function seedA() {
  const s = setup();
  const created = await s.a.collection<Item>("links").insert({ name: "n", url: "x" });
  return { ...s, id: created._id };
}

const rawLinks = (raw: BrowserStore) => raw.collection<Item>("links");

test("insert stores the owner and never returns it", async () => {
  const { raw, a } = setup();
  const created = await a.collection<Item>("links").insert({ name: "n" });
  assert.equal("ownerId" in created, false);
  assert.equal((await rawLinks(raw).findOne({}))?.ownerId, A);
});

test("reads see only the owner's records and never expose ownerId", async () => {
  const { a, b } = await seedA();
  const ca = a.collection<Item>("links");
  const cb = b.collection<Item>("links");
  assert.equal((await ca.find()).length, 1);
  assert.equal(await ca.count(), 1);
  assert.equal(await ca.exists({}), true);
  assert.deepEqual(await ca.distinct("name"), ["n"]);
  assert.equal("ownerId" in (await ca.findOne({}))!, false);
  assert.deepEqual(await ca.findOne({}, { select: ["name"] }).then((d) => Object.keys(d!).sort()), ["_id", "name"]);
  assert.equal((await ca.find({}, { select: ["name"] })).every((d) => !("ownerId" in d)), true);
  assert.deepEqual(await cb.find(), []);
  assert.equal(await cb.findOne({}), null);
  assert.equal(await cb.count(), 0);
  assert.equal(await cb.exists({}), false);
  assert.deepEqual(await cb.distinct("name"), []);
});

test("by-id operations through another owner find nothing and change nothing", async () => {
  const { raw, a, b, id } = await seedA();
  const before = await rawLinks(raw).findById(id);
  const cb = b.collection<Item>("links");
  assert.equal(await cb.findById(id), null);
  assert.equal(await cb.updateById(id, { $set: { name: "x" } }), null);
  assert.equal(await cb.deleteById(id), null);
  assert.deepEqual(await rawLinks(raw).findById(id), before);
  assert.equal(await a.collection<Item>("links").findById("nope"), null);
  assert.equal(await cb.updateById("nope", { $set: { name: "x" } }), null);
  assert.equal(await cb.deleteById("nope"), null);
  const mine = await a.collection<Item>("links").findById(id);
  assert.equal(mine?.name, "n");
  assert.equal("ownerId" in mine!, false);
});

test("updateById passes timestamps: false on", async () => {
  const { a, id } = await seedA();
  const c = a.collection<Item>("links");
  const before = (await c.findById(id))!;
  await new Promise((r) => setTimeout(r, 5));
  const same = await c.updateById(id, { $set: { name: "m" } }, { timestamps: false });
  assert.equal(same?.updatedAt, before.updatedAt);
  assert.equal(same?.name, "m");
  assert.equal("ownerId" in same!, false);
});

test("deleteById removes an owned record", async () => {
  const { a, id } = await seedA();
  const c = a.collection<Item>("links");
  const gone = await c.deleteById(id);
  assert.equal(gone?._id, id);
  assert.equal("ownerId" in gone!, false);
  assert.equal(await c.findById(id), null);
});

test("bulk writes through another owner touch nothing", async () => {
  const { raw, b, id } = await seedA();
  const before = await rawLinks(raw).find();
  const cb = b.collection<Item>("links");
  assert.equal(await cb.updateMany({}, { $set: { name: "x" } }), 0);
  assert.equal(await cb.deleteMany({}), 0);
  await cb.batchUpdate([{ filter: { _id: id }, update: { $set: { name: "x" } } }]);
  assert.deepEqual(await rawLinks(raw).find(), before);
});

test("an owner's bulk writes reach their own records", async () => {
  const { a } = await seedA();
  const c = a.collection<Item>("links");
  assert.equal(await c.updateMany({}, { $set: { name: "y" } }), 1);
  assert.equal((await c.findOne({}))?.name, "y");
  const [first] = await c.insertMany([{ name: "z" }]);
  assert.equal("ownerId" in first, false);
  assert.equal(await c.deleteMany({ name: "z" }), 1);
});

test("an upsert through another owner creates that owner's own record", async () => {
  const { raw, b } = await seedA();
  const made = await b.collection<Item>("links").updateOne({ name: "n" }, { $set: { url: "u" } }, { upsert: true });
  assert.equal("ownerId" in made!, false);
  const all = await rawLinks(raw).find();
  assert.equal(all.length, 2);
  assert.deepEqual(all.map((d) => [d.ownerId, d.url]).sort(), [[A, "x"], [B, "u"]]);
});

test("a record without an owner is invisible to an owner", async () => {
  const { raw, a } = setup();
  const orphan = await rawLinks(raw).insert({ name: "orphan" });
  const c = a.collection<Item>("links");
  assert.deepEqual(await c.find(), []);
  assert.equal(await c.findOne({}), null);
  assert.equal(await c.findById(orphan._id), null);
  assert.equal(await c.count(), 0);
  assert.equal(await c.exists({}), false);
  assert.deepEqual(await c.distinct("name"), []);
  assert.equal(await c.updateById(orphan._id, { $set: { name: "x" } }), null);
  assert.equal(await c.deleteById(orphan._id), null);
});

test("naming ownerId anywhere is refused", async () => {
  const { a } = await seedA();
  const c = a.collection<Item>("links");
  const refused = (fn: () => Promise<unknown>) => assert.rejects(fn, MANAGED);
  await refused(() => c.find({ ownerId: B }));
  await refused(() => c.find({ $or: [{ ownerId: B }] }));
  await refused(() => c.find({ $and: [{ x: 1 }, { $or: [{ ownerId: B }] }] }));
  await refused(() => c.find({ ownerId: { $ne: A } }));
  await refused(() => c.count({ ownerId: B }));
  await refused(() => c.exists({ ownerId: B }));
  await refused(() => c.updateMany({ ownerId: B }, { $set: { name: "x" } }));
  await refused(() => c.deleteMany({ ownerId: B }));
  await refused(() => c.insert({ name: "n", ownerId: B }));
  await refused(() => c.insertMany([{ name: "n", ownerId: B }]));
  for (const part of ["$set", "$unset", "$setOnInsert", "$inc"] as const) {
    const update = { [part]: { ownerId: B } } as never;
    await refused(() => c.updateOne({}, update));
    await refused(() => c.updateMany({}, update));
    await refused(() => c.updateById("c".repeat(24), update));
    await refused(() => c.batchUpdate([{ filter: {}, update }]));
  }
  await refused(() => c.distinct("ownerId"));
  await refused(() => c.find({}, { select: ["ownerId"] }));
  await refused(() => c.findOne({}, { sort: { ownerId: 1 } }));
  await refused(() => c.find({}, { sort: { ownerId: 1 } }));
});

test("unique fields are unique per owner", async () => {
  const { raw, a, b } = setup();
  await a.collection<Item>("linkGroups").insert({ slug: "x" });
  await b.collection<Item>("linkGroups").insert({ slug: "x" });
  await assert.rejects(() => a.collection<Item>("linkGroups").insert({ slug: "x" }), ConflictError);
  assert.equal((await raw.collection<Item>("linkGroups").find()).length, 2);
});

test("an unscoped BrowserStore still enforces global uniqueness", async () => {
  const raw = new BrowserStore(memoryStorage());
  await raw.collection<Item>("linkGroups").insert({ slug: "x" });
  await assert.rejects(() => raw.collection<Item>("linkGroups").insert({ slug: "x" }), ConflictError);
});
