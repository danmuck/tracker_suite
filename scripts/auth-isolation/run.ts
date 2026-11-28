// Proves over a real MongoDB, with its real indexes, that one owner cannot reach another's records,
// and that parallel first requests leave one Cash account and one finance profile per owner.
//
//   node scripts/auth-isolation/reset-db.mjs
//   TZ=America/New_York node --experimental-strip-types --no-warnings --import ./scripts/register-ts.mjs \
//     scripts/auth-isolation/run.ts
//
// The database is hard-coded (no argument or environment variable can change it), must be empty,
// and is the only one this script touches. Prints one line per check; exits non-zero on any FAIL.

import assert from "node:assert/strict";
import mongoose from "mongoose";
import { allRoutes } from "@/lib/data/all-routes";
import { dispatch } from "@/lib/data/dispatch";
import { MODELS, mongoStore } from "@/lib/data/mongo-store";
import { scopedStore } from "@/lib/data/scoped-store";
import { COLLECTIONS, ConflictError, type BaseDoc, type CollectionName } from "@/lib/data/store";
import { ensureCashAccount } from "@/lib/finance/api/docs";
import { FIXED_NOW, probeAsStranger, probeLinkedWrites, seedOwner } from "@/lib/data/test-support/isolation";

const URI = "mongodb://localhost:27017/tracker_isolation";
const NAME = "tracker_isolation";

const A = "a".repeat(24);
const B = "b".repeat(24);
const C = "c".repeat(24);

const NAMES = Object.keys(COLLECTIONS) as CollectionName[];

type Raw = BaseDoc & { ownerId?: string; [key: string]: unknown };

/** Every stored record of a collection, read straight from the model, as plain JSON with string ids. */
async function rawDocs(name: CollectionName, filter: Record<string, unknown> = {}): Promise<Raw[]> {
  const docs = await MODELS[name].find(filter).sort({ _id: 1 }).lean();
  return JSON.parse(JSON.stringify(docs)) as Raw[];
}

async function snapshot(owner: string): Promise<Record<string, Raw[]>> {
  const out: Record<string, Raw[]> = {};
  for (const name of NAMES) out[name] = await rawDocs(name, { ownerId: owner });
  return out;
}

const getPaths = allRoutes.filter((r) => r.method === "GET" && !r.path.includes(":")).map((r) => r.path);

async function askAll(store: ReturnType<typeof scopedStore>): Promise<unknown[]> {
  const out: unknown[] = [];
  for (const path of getPaths) out.push(await dispatch(allRoutes, store, "GET", path, undefined, FIXED_NOW));
  return JSON.parse(JSON.stringify(out));
}

const PROFILE_BODY = {
  filingStatus: "single", hoursPerWeek: 40, nycResident: false, raiseRate: 0.03,
  salarySteps: [{ effectiveDate: "2026-01-01", annualGross: 90000 }], retirementSteps: [], healthSteps: [], rentSteps: [], whatIfSalaries: [],
};

let failures = 0;
async function check(label: string, run: () => Promise<string | void>): Promise<void> {
  try {
    const note = await run();
    console.log(`ok   ${label}${note ? ` (${note})` : ""}`);
  } catch (error) {
    failures++;
    console.log(`FAIL ${label}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function main(): Promise<void> {
  await mongoose.connect(URI);
  const actual = mongoose.connection.db?.databaseName;
  if (actual !== NAME) throw new Error(`Connected to ${JSON.stringify(actual)}: only ${NAME} may be used`);
  const existing = await mongoose.connection.db!.listCollections().toArray();
  const occupied = [];
  for (const c of existing) if ((await mongoose.connection.db!.collection(c.name).countDocuments()) > 0) occupied.push(c.name);
  if (occupied.length > 0) throw new Error(`${NAME} is not empty (${occupied.join(", ")}): run reset-db.mjs first`);

  // Indexes are built and awaited before anything races, so the unique indexes exist.
  for (const name of NAMES) await MODELS[name].syncIndexes();
  console.log(`indexes synced on ${NAMES.length} models`);

  const b = scopedStore(mongoStore, B);

  // Seed B alone and record every parameterless GET answer, then add A and ask again.
  await seedOwner(b);
  const beforeA = await askAll(b);
  await check("two owners seed the same slugs, names and keys (unique per owner)", async () => {
    await seedOwner(scopedStore(mongoStore, A));
  });
  // Asked right after A is seeded: later probes legitimately rewrite B's own records (a full-replace PUT).
  const afterA = await askAll(b);

  await check("every collection has at least two records for each owner", async () => {
    for (const owner of [A, B]) {
      const mine = await snapshot(owner);
      for (const name of NAMES) {
        if (name === "financeProfile") {
          assert.equal(mine[name].length, 1, `financeProfile has ${mine[name].length} records for ${owner[0]}`);
          continue;
        }
        assert.ok(mine[name].length >= 2, `${name} has ${mine[name].length} records for ${owner[0]}`);
      }
    }
  });

  await check("a stranger's calls through every route read and change nothing of the owner's", async () => {
    const before = await snapshot(A);
    const records = Object.values(before).flat();
    assert.ok(records.length >= NAMES.length * 2 - 1);
    const results = await probeAsStranger(b, records);
    assert.ok(results.length >= allRoutes.length);
    assert.deepEqual(await snapshot(A), before);
    for (const { _id: id } of records) {
      const leaks = results.filter((r) => JSON.stringify(r.body).includes(id));
      assert.equal(leaks.length, 0, `an answer contains ${id}: ${JSON.stringify(leaks[0])}`);
    }
    return `${results.length} calls`;
  });

  await check("a stranger's update of a foreign tour or payment plan, with links that resolve, changes nothing", async () => {
    const before = await snapshot(A);
    const tour = before.tours[0];
    const card = before.accounts.find((a) => a.type === "credit_card" || a.type === "debt");
    assert.ok(tour && card);
    const { tour: t, plan } = await probeLinkedWrites(b, tour, card);
    assert.equal(t.status, 404, JSON.stringify(t.body));
    assert.deepEqual(t.body, { error: "Tour not found" });
    assert.equal(plan.status, 404, JSON.stringify(plan.body));
    assert.deepEqual(plan.body, { error: "Account not found" });
    assert.deepEqual(await snapshot(A), before);
  });

  await check("B's answers on every parameterless GET route do not change when A's data appears", async () => {
    assert.ok(getPaths.length > 10);
    getPaths.forEach((path, i) => assert.deepEqual(afterA[i], beforeA[i], `GET ${path} changed for B`));
    return `${getPaths.length} routes`;
  });

  await check("every stored record belongs to A or B and none lacks an owner", async () => {
    await probeAsStranger(b, [{ _id: A }]);
    for (const name of NAMES) {
      for (const doc of await rawDocs(name)) {
        assert.ok(doc.ownerId === A || doc.ownerId === B, `${name} ${doc._id} owner is ${String(doc.ownerId)}`);
      }
    }
  });

  await check("the same slug, category name and settings key are accepted for A and B; a repeat by A is refused", async () => {
    for (const owner of [A, B]) {
      const mine = await snapshot(owner);
      assert.equal(mine.linkGroups.filter((g) => g.slug === "gaming").length, 1, `no gaming slug for ${owner[0]}`);
      assert.ok(mine.financeCategories.length >= 1);
      assert.ok(mine.futureSettings.some((s) => s.key === "second"));
    }
    const groups = (name: string) => rawDocs("linkGroups", { name });
    const gaming = (await groups("Gaming")).filter((g) => g.ownerId === A || g.ownerId === B);
    assert.equal(gaming.length, 2);
    assert.equal(gaming[0].slug, gaming[1].slug);
    const category = (await rawDocs("financeCategories", { ownerId: A }))[0];
    const sameCategory = (await rawDocs("financeCategories", { name: category.name })).filter((c) => c.ownerId === A || c.ownerId === B);
    assert.equal(sameCategory.length, 2);
    const settings = (await rawDocs("futureSettings", { key: "second" })).filter((s) => s.ownerId === A || s.ownerId === B);
    assert.equal(settings.length, 2);
    const a = scopedStore(mongoStore, A);
    await assert.rejects(
      a.collection<BaseDoc & { name: string; slug: string }>("linkGroups").insert({ name: "Gaming again", slug: "gaming" } as never),
      (error: unknown) => error instanceof ConflictError,
    );
  });

  await check("20 parallel first requests leave exactly one Cash account for C", async () => {
    await Promise.all(Array.from({ length: 20 }, () => ensureCashAccount(scopedStore(mongoStore, C))));
    const cash = await rawDocs("accounts", { ownerId: C, isCash: true });
    assert.equal(cash.length, 1, `${cash.length} Cash accounts for C`);
  });

  await check("20 parallel PUT /api/finance-profile leave exactly one profile for C and no 5xx", async () => {
    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        dispatch(allRoutes, scopedStore(mongoStore, C), "PUT", "/api/finance-profile", PROFILE_BODY, FIXED_NOW),
      ),
    );
    const bad = results.filter((r) => r.status >= 500 || r.status < 200 || r.status >= 300);
    assert.equal(bad.length, 0, `answers: ${JSON.stringify(bad[0])}`);
    const profiles = await rawDocs("financeProfile", { ownerId: C });
    assert.equal(profiles.length, 1, `${profiles.length} profiles for C`);
    const cash = await rawDocs("accounts", { ownerId: C, isCash: true });
    assert.equal(cash.length, 1, `${cash.length} Cash accounts for C`);
  });

  // Last: it plants records with no owner, which the "none lacks an owner" check would reject.
  await check("a record with no ownerId, inserted through the model, is returned by no route for A or B", async () => {
    const planted: Raw[] = [];
    for (const name of NAMES) {
      const source = (await rawDocs(name, { ownerId: A }))[0];
      assert.ok(source, `no ${name} record to copy`);
      const copy: Record<string, unknown> = { ...source, _id: new mongoose.Types.ObjectId() };
      delete copy.ownerId;
      // Straight to the collection: Mongoose would otherwise cast but never add an owner either way.
      await MODELS[name].collection.insertOne(copy as never);
      planted.push(JSON.parse(JSON.stringify(copy)) as Raw);
    }
    assert.equal((await Promise.all(NAMES.map((n) => rawDocs(n, { ownerId: { $exists: false } })))).flat().length, NAMES.length);
    const ids = planted.map((d) => d._id);
    for (const owner of [A, B]) {
      const store = scopedStore(mongoStore, owner);
      const answers: unknown[] = await askAll(store);
      answers.push(...(await probeAsStranger(store, planted)).map((r) => r.body));
      for (const id of ids) {
        const leaked = answers.filter((x) => JSON.stringify(x).includes(id));
        assert.equal(leaked.length, 0, `${owner[0]} was answered with the ownerless record ${id}: ${JSON.stringify(leaked[0])}`);
      }
    }
    for (const name of NAMES) {
      const still = await rawDocs(name, { ownerId: { $exists: false } });
      assert.equal(still.length, 1, `${name}: ${still.length} ownerless records after the probes`);
      assert.deepEqual(still[0], planted[NAMES.indexOf(name)], `${name}: the ownerless record changed`);
    }
  });
}

try {
  await main();
} catch (error) {
  failures++;
  console.log(`FAIL setup: ${error instanceof Error ? error.message : String(error)}`);
} finally {
  await mongoose.disconnect();
}
console.log(failures === 0 ? "all checks ok" : `${failures} check(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);
