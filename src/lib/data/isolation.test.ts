// Proves, through every real route, that one owner cannot read or change another's records.

import { test } from "node:test";
import assert from "node:assert/strict";
import { allRoutes } from "./all-routes";
import { BrowserStore } from "./browser-store";
import { scopedStore } from "./scoped-store";
import { COLLECTIONS, type BaseDoc, type CollectionName } from "./store";
import { memoryStorage } from "./test-helpers";
import { probeAsStranger, seedOwner } from "./test-support/isolation";

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
      assert.ok(mine[name].length >= 2, `${name} has ${mine[name].length} records for ${owner[0]}`);
    }
  }
});

test("a stranger's calls through every route read and change nothing of the owner's", async () => {
  const raw = await seeded();
  const before = await snapshot(raw, A);
  const ids = Object.values(before).flatMap((docs) => docs.map((d) => d._id));
  assert.ok(ids.length > 40);

  const results = await probeAsStranger(scopedStore(raw, B), ids);
  assert.ok(results.length >= allRoutes.length);

  assert.deepEqual(await snapshot(raw, A), before);
  for (const id of ids) {
    const leaks = results.filter((r) => JSON.stringify(r.body).includes(id));
    assert.equal(leaks.length, 0, `an answer contains ${id}: ${JSON.stringify(leaks[0])}`);
  }
});

test("every stored record belongs to A or B and none lacks an owner", async () => {
  const raw = await seeded();
  await probeAsStranger(scopedStore(raw, B), [A]);
  for (const name of NAMES) {
    for (const doc of await rawDocs(raw, name)) {
      assert.ok(doc.ownerId === A || doc.ownerId === B, `${name} ${doc._id} owner is ${String(doc.ownerId)}`);
    }
  }
});
