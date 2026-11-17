import { test } from "node:test";
import assert from "node:assert/strict";
import { BrowserStore, DATA_VERSION, type StorageLike } from "./browser-store";
import { ConflictError, type BaseDoc } from "./store";

function memoryStorage(): StorageLike & { failWrites: boolean } {
  const map = new Map<string, string>();
  return {
    failWrites: false,
    getItem: (key) => map.get(key) ?? null,
    setItem(key, value) {
      if (this.failWrites) throw new Error("QuotaExceededError");
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
    key: (index) => [...map.keys()][index] ?? null,
    get length() {
      return map.size;
    },
  };
}

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
