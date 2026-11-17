import { test } from "node:test";
import assert from "node:assert/strict";
import { BrowserStore, createMemoryStorage, DATA_VERSION } from "./browser-store";
import { ConflictError, type BaseDoc } from "./store";
import { memoryStorage } from "./test-helpers";

type Group = BaseDoc & { name: string; slug: string; order: number };

test("insert assigns id and timestamps; find sorts, skips, limits and selects", async () => {
  const groups = new BrowserStore(memoryStorage()).collection<Group>("linkGroups");
  const a = await groups.insert({ name: "A", slug: "a", order: 1 });
  await groups.insert({ name: "B", slug: "b", order: 0 });
  assert.match(a._id, /^[0-9a-f]{24}$/);
  assert.equal(a.createdAt, a.updatedAt);
  assert.deepEqual((await groups.find({}, { sort: { order: 1 } })).map((g) => g.name), ["B", "A"]);
  assert.deepEqual((await groups.find({}, { sort: { order: 1 }, skip: 1, limit: 1 })).map((g) => g.name), ["A"]);
  assert.deepEqual(await groups.findOne({}, { sort: { order: -1 }, select: ["order"] }), { _id: a._id, order: 1 });
  assert.equal(await groups.count({ order: { $gte: 1 } }), 1);
  assert.equal(await groups.exists({ slug: "zzz" }), false);
  assert.deepEqual((await groups.distinct("order")).sort(), [0, 1]);
});

test("updates return the new doc, refresh updatedAt and persist across instances", async () => {
  const storage = memoryStorage();
  const groups = new BrowserStore(storage).collection<Group>("linkGroups");
  const a = await groups.insert({ name: "A", slug: "a", order: 1 });
  const updated = await groups.updateById(a._id, { $set: { name: "A2" }, $inc: { order: 2 } });
  assert.deepEqual([updated?.name, updated?.order], ["A2", 3]);
  assert.equal(await groups.updateById("0".repeat(24), { $set: { name: "x" } }), null);
  assert.equal(await groups.updateMany({}, { $set: { order: 9 } }), 1);
  const again = new BrowserStore(storage).collection<Group>("linkGroups");
  assert.equal((await again.findById(a._id))?.order, 9);
  assert.equal((await again.deleteById(a._id))?.name, "A2");
  assert.equal(await again.count(), 0);
});

test("upsert inserts once, batchUpdate applies in order, deleteMany counts", async () => {
  const groups = new BrowserStore(memoryStorage()).collection<Group>("linkGroups");
  await groups.updateOne({ slug: "s" }, { $setOnInsert: { name: "S", order: 0 } }, { upsert: true });
  await groups.updateOne({ slug: "s" }, { $setOnInsert: { name: "T", order: 5 } }, { upsert: true });
  assert.deepEqual((await groups.find()).map((g) => [g.name, g.slug, g.order]), [["S", "s", 0]]);
  await groups.batchUpdate([
    { filter: { slug: "s" }, update: { $inc: { order: 2 } } },
    { filter: { slug: "s" }, update: { $inc: { order: 3 } } },
  ]);
  assert.equal((await groups.findOne({ slug: "s" }))?.order, 5);
  assert.equal(await groups.deleteMany({ slug: "s" }), 1);
});

test("unique fields raise ConflictError on insert and update", async () => {
  const groups = new BrowserStore(memoryStorage()).collection<Group>("linkGroups");
  await groups.insert({ name: "A", slug: "a", order: 0 });
  const b = await groups.insert({ name: "B", slug: "b", order: 0 });
  await assert.rejects(groups.insert({ name: "A again", slug: "a", order: 0 }), ConflictError);
  await assert.rejects(groups.updateById(b._id, { $set: { slug: "a" } }), ConflictError);
});

test("corrupt JSON reads as empty; a failed write rolls back and reports storage trouble", async () => {
  const storage = memoryStorage();
  storage.setItem("ts:data:linkGroups", "{not json");
  const groups = new BrowserStore(storage).collection<Group>("linkGroups");
  assert.deepEqual(await groups.find(), []);
  storage.failWrites = true;
  await assert.rejects(groups.insert({ name: "A", slug: "a", order: 0 }), /Browser storage is full or unavailable/);
  storage.failWrites = false;
  assert.equal(await groups.count(), 0);
});

test("a version change wipes stored data; invalidate re-reads; clear empties", async () => {
  const storage = memoryStorage();
  storage.setItem("ts:data:version", "0");
  storage.setItem("ts:data:linkGroups", JSON.stringify([{ _id: "x", name: "old", slug: "old", order: 0 }]));
  const store = new BrowserStore(storage);
  const groups = store.collection<Group>("linkGroups");
  assert.equal(await groups.count(), 0);
  assert.equal(storage.getItem("ts:data:version"), String(DATA_VERSION));
  storage.setItem("ts:data:linkGroups", JSON.stringify([{ _id: "y", name: "other tab", slug: "o", order: 0 }]));
  assert.equal(await groups.count(), 0);
  store.invalidate("linkGroups");
  assert.equal(await groups.count(), 1);
  store.clear();
  assert.equal(await groups.count(), 0);
  assert.equal(storage.getItem("ts:data:linkGroups"), null);
});

test("clear keeps the version key so data added afterwards survives a reload", async () => {
  const storage = memoryStorage();
  const store = new BrowserStore(storage);
  await store.collection<Group>("linkGroups").insert({ name: "A", slug: "a", order: 0 });
  store.clear();
  assert.equal(storage.getItem("ts:data:version"), String(DATA_VERSION));
  await store.collection<Group>("linkGroups").insert({ name: "B", slug: "b", order: 0 });
  const reloaded = new BrowserStore(storage).collection<Group>("linkGroups");
  assert.deepEqual((await reloaded.find()).map((g) => g.name), ["B"]);
});

test("batchUpdate updates only the first match per op, as bulkWrite updateOne does", async () => {
  const groups = new BrowserStore(memoryStorage()).collection<Group>("linkGroups");
  await groups.insert({ name: "A", slug: "a", order: 1 });
  await groups.insert({ name: "B", slug: "b", order: 1 });
  await groups.batchUpdate([{ filter: { order: 1 }, update: { $set: { order: 9 } } }]);
  assert.deepEqual((await groups.find({}, { sort: { name: 1 } })).map((g) => g.order), [9, 1]);
});

test("limit 0 means no limit, as in MongoDB", async () => {
  const groups = new BrowserStore(memoryStorage()).collection<Group>("linkGroups");
  await groups.insert({ name: "A", slug: "a", order: 1 });
  await groups.insert({ name: "B", slug: "b", order: 2 });
  assert.equal((await groups.find({}, { limit: 0 })).length, 2);
  assert.ok(await groups.findOne({}, { limit: 0 }));
  assert.equal((await groups.find({}, { skip: 0 })).length, 2);
  assert.equal((await groups.find({}, { skip: 1, limit: 1 })).length, 1);
});

test("unsupported skip and limit values reject instead of differing from MongoDB", async () => {
  const groups = new BrowserStore(memoryStorage()).collection<Group>("linkGroups");
  await groups.insert({ name: "A", slug: "a", order: 1 });
  await assert.rejects(groups.find({}, { skip: NaN }), { message: "Unsupported skip: NaN" });
  await assert.rejects(groups.find({}, { skip: -1 }), { message: "Unsupported skip: -1" });
  await assert.rejects(groups.find({}, { skip: 1.5 }), { message: "Unsupported skip: 1.5" });
  await assert.rejects(groups.find({}, { limit: NaN }), { message: "Unsupported limit: NaN" });
  await assert.rejects(groups.find({}, { limit: -5 }), { message: "Unsupported limit: -5" });
  await assert.rejects(groups.findOne({}, { limit: -1 }), { message: "Unsupported limit: -1" });
});

test("updates that change _id reject; createdAt is silently kept", async () => {
  const groups = new BrowserStore(memoryStorage()).collection<Group>("linkGroups");
  const a = await groups.insert({ name: "A", slug: "a", order: 1 });
  const idChanged = { message: "_id cannot be changed" };
  await assert.rejects(groups.updateById(a._id, { $set: { _id: "x", name: "A2" } }), idChanged);
  await assert.rejects(groups.updateMany({}, { $unset: { _id: "" } }), idChanged);
  await assert.rejects(groups.batchUpdate([{ filter: {}, update: { $inc: { _id: 1 } } }]), idChanged);
  await assert.rejects(groups.updateOne({ slug: "a" }, { $set: { _id: "q" } }), idChanged);
  assert.equal((await groups.findById(a._id))?.name, "A");
  const viaId = await groups.updateById(a._id, { $set: { createdAt: "y", name: "A2" } });
  assert.deepEqual([viaId?._id, viaId?.createdAt, viaId?.name], [a._id, a.createdAt, "A2"]);
  await groups.updateMany({}, { $unset: { createdAt: "" } });
  await groups.batchUpdate([{ filter: {}, update: { $set: { createdAt: "z" } } }]);
  const after = await groups.findById(a._id);
  assert.deepEqual([after?._id, after?.createdAt], [a._id, a.createdAt]);
});

test("a BrowserStore works over the in-memory storage fallback", async () => {
  const groups = new BrowserStore(createMemoryStorage()).collection<Group>("linkGroups");
  const a = await groups.insert({ name: "A", slug: "a", order: 1 });
  assert.equal((await groups.findById(a._id))?.name, "A");
});

test("a duplicate pair already in storage does not block writes to other docs", async () => {
  const storage = memoryStorage();
  new BrowserStore(storage); // stamps the data version so the seeded rows survive
  const stamp = { createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" };
  storage.setItem(
    "ts:data:linkGroups",
    JSON.stringify([
      { _id: "a".repeat(24), name: "A", slug: "dup", order: 0, ...stamp },
      { _id: "b".repeat(24), name: "B", slug: "dup", order: 1, ...stamp },
      { _id: "c".repeat(24), name: "C", slug: "c", order: 2, ...stamp },
    ]),
  );
  const groups = new BrowserStore(storage).collection<Group>("linkGroups");
  assert.equal((await groups.updateById("c".repeat(24), { $set: { name: "C2" } }))?.name, "C2");
  assert.equal(await groups.updateMany({ slug: "c" }, { $inc: { order: 1 } }), 1);
  await groups.batchUpdate([{ filter: { slug: "c" }, update: { $set: { order: 7 } } }]);
  await assert.rejects(groups.insert({ name: "D", slug: "dup", order: 3 }), ConflictError);
  await assert.rejects(groups.updateById("c".repeat(24), { $set: { slug: "dup" } }), ConflictError);
  await assert.rejects(groups.insertMany([{ name: "E", slug: "e", order: 0 }, { name: "F", slug: "e", order: 0 }]), ConflictError);
});

test("reading a collection keeps only plain-object elements", async () => {
  const storage = memoryStorage();
  new BrowserStore(storage);
  storage.setItem("ts:data:linkGroups", JSON.stringify([1, null, "s", [2], { _id: "x", name: "X", slug: "x", order: 0 }]));
  const groups = new BrowserStore(storage).collection<Group>("linkGroups");
  assert.deepEqual((await groups.find()).map((g) => g._id), ["x"]);
});

test("upsert with a 24-hex _id filter inserts with that _id, and an invalid one is rejected", async () => {
  const groups = new BrowserStore(memoryStorage()).collection<Group>("linkGroups");
  const id = "0123456789abcdef01234567";
  const created = await groups.updateOne({ _id: id }, { $set: { name: "U", slug: "u", order: 0 } }, { upsert: true });
  assert.equal(created?._id, id);
  assert.equal((await groups.findById(id))?.name, "U");
  await assert.rejects(
    groups.updateOne({ _id: "not-an-object-id" }, { $set: { name: "V", slug: "v", order: 0 } }, { upsert: true }),
    { message: "Invalid _id" },
  );
});

test("updating a doc that already shares a unique value works while the value is left alone", async () => {
  const storage = memoryStorage();
  const store = new BrowserStore(storage); // writes the version key; seeding earlier would be wiped as stale data
  storage.setItem(
    "ts:data:linkGroups",
    JSON.stringify([
      { _id: "a".repeat(24), name: "A", slug: "dup", order: 0 },
      { _id: "b".repeat(24), name: "B", slug: "dup", order: 1 },
      { _id: "c".repeat(24), name: "C", slug: "third", order: 2 },
    ]),
  );
  const groups = store.collection<Group>("linkGroups");
  assert.equal((await groups.updateById("a".repeat(24), { $set: { name: "A renamed" } }))?.name, "A renamed");
  assert.equal((await groups.updateById("a".repeat(24), { $set: { slug: "dup" } }))?.slug, "dup");
  await assert.rejects(groups.updateById("a".repeat(24), { $set: { slug: "third" } }), ConflictError);
});

test("upserts reject _id in $setOnInsert and an invalid _id in the filter, before touching storage", async () => {
  const storage = memoryStorage();
  const groups = new BrowserStore(storage).collection<Group>("linkGroups");
  const id = "a".repeat(24);
  await assert.rejects(
    groups.updateOne({ slug: "s" }, { $setOnInsert: { _id: id, name: "S", order: 0 } }, { upsert: true }),
    { message: "_id cannot be changed" },
  );
  storage.failWrites = true; // a write would throw a different error, so these prove nothing was attempted
  for (const bad of ["xyz", "A".repeat(24), 5]) {
    await assert.rejects(
      groups.updateOne({ _id: bad as string }, { $setOnInsert: { name: "S", slug: "s", order: 0 } }, { upsert: true }),
      { message: "Invalid _id" },
    );
  }
  storage.failWrites = false;
  const created = await groups.updateOne({ _id: id }, { $setOnInsert: { name: "S", slug: "s", order: 0 } }, { upsert: true });
  assert.equal(created?._id, id);
  assert.equal(await groups.updateOne({ _id: "xyz" }, { $set: { name: "x" } }), null); // no upsert: unchanged behavior
});

test("updateById with timestamps: false changes the document and leaves updatedAt alone", async () => {
  const store = new BrowserStore(memoryStorage());
  const links = store.collection<BaseDoc & { name: string; n?: number }>("links");
  const made = await links.insert({ name: "a" });
  await new Promise((r) => setTimeout(r, 5));
  const quiet = await links.updateById(made._id, { $set: { n: 1 } }, { timestamps: false });
  assert.deepEqual([quiet!.n, quiet!.updatedAt, quiet!.createdAt], [1, made.updatedAt, made.createdAt]);
  assert.equal((await links.findById(made._id))!.updatedAt, made.updatedAt);
  const loud = await links.updateById(made._id, { $set: { n: 2 } });
  assert.ok(loud!.updatedAt > made.updatedAt);
  assert.equal(await links.updateById("a".repeat(24), { $set: { n: 3 } }, { timestamps: false }), null);
});
