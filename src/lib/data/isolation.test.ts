// Proves, through every real route, that one owner cannot read or change another's records.

import { test } from "node:test";
import assert from "node:assert/strict";
import { allRoutes } from "./all-routes";
import { dispatch } from "./dispatch";
import { BrowserStore } from "./browser-store";
import { scopedStore } from "./scoped-store";
import { COLLECTIONS, type BaseDoc, type CollectionName } from "./store";
import { memoryStorage } from "./test-helpers";
import { FIXED_NOW, probeAsStranger, seedOwner } from "./test-support/isolation";

const A = "a".repeat(24);
const B = "b".repeat(24);
const NAMES = Object.keys(COLLECTIONS) as CollectionName[];

type Raw = BaseDoc & { ownerId?: string };

const rawDocs = (raw: BrowserStore, name: CollectionName) => raw.collection<Raw>(name).find({});

async function snapshot(raw: BrowserStore, owner: string): Promise<Record<string, Raw[]>> {
  const out: Record<string, Raw[]> = {};
  for (const name of NAMES) {
    out[name] = (await rawDocs(raw, name)).filter((d) => d.ownerId === owner);
  }
  return out;
}

async function seeded() {
  const raw = new BrowserStore(memoryStorage());
  await seedOwner(scopedStore(raw, A));
  await seedOwner(scopedStore(raw, B)); // same slugs, names and keys: unique fields are per owner
  return raw;
}

test("every collection has at least two records for each owner", async () => {
  const raw = await seeded();
  for (const owner of [A, B]) {
    const mine = await snapshot(raw, owner);
    for (const name of NAMES) {
      // The finance profile is a per-owner singleton (unique {ownerId} index on MongoDB).
      if (name === "financeProfile") {
        assert.equal(mine[name].length, 1, `financeProfile has ${mine[name].length} records for ${owner[0]}`);
        continue;
      }
      assert.ok(mine[name].length >= 2, `${name} has ${mine[name].length} records for ${owner[0]}`);
    }
  }
});

test("a stranger's calls through every route read and change nothing of the owner's", async () => {
  const raw = await seeded();
  const before = await snapshot(raw, A);
  const records = Object.values(before).flat();
  const ids = records.map((d) => d._id);
  assert.ok(records.length >= NAMES.length * 2 - 1); // two per collection, one finance profile

  const results = await probeAsStranger(scopedStore(raw, B), records);
  assert.ok(results.length >= allRoutes.length);

  assert.deepEqual(await snapshot(raw, A), before);
  for (const id of ids) {
    const leaks = results.filter((r) => JSON.stringify(r.body).includes(id));
    assert.equal(leaks.length, 0, `an answer contains ${id}: ${JSON.stringify(leaks[0])}`);
  }
});

test("every stored record belongs to A or B and none lacks an owner", async () => {
  const raw = await seeded();
  // A is not a record id; the owner id is just a well-formed id to throw at every param route.
  await probeAsStranger(scopedStore(raw, B), [{ _id: A }]);
  for (const name of NAMES) {
    for (const doc of await rawDocs(raw, name)) {
      assert.ok(doc.ownerId === A || doc.ownerId === B, `${name} ${doc._id} owner is ${String(doc.ownerId)}`);
    }
  }
});

test("B's answers on every parameterless GET route do not change when A's data appears", async () => {
  const raw = new BrowserStore(memoryStorage());
  const b = scopedStore(raw, B);
  await seedOwner(b);
  const gets = allRoutes.filter((r) => r.method === "GET" && !r.path.includes(":"));
  assert.ok(gets.length > 10);
  const ask = async () => {
    const out: unknown[] = [];
    for (const r of gets) out.push(await dispatch(allRoutes, b, "GET", r.path, undefined, FIXED_NOW));
    return JSON.parse(JSON.stringify(out));
  };
  const before = await ask();
  await seedOwner(scopedStore(raw, A));
  const after = await ask();
  gets.forEach((r, i) => assert.deepEqual(after[i], before[i], `GET ${r.path} changed for B`));
});
