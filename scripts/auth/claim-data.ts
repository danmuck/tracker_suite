// Gives every record that has no owner to the named admin, then rebuilds the indexes so they are
// per owner. Without --apply it only reports; it writes nothing.
//
//   node --experimental-strip-types --no-warnings --import ./scripts/register-ts.mjs \
//     scripts/auth/claim-data.ts --db <name> --admin <email> [--apply] [--uri <uri>]
//
// Stop the app and create the admin first. Take a mongodump of a live database before --apply.
// Connects only to the database named by --db. Running --apply twice changes nothing the second time.
//
// The report shows, per collection, who owns what, and per model what syncIndexes would drop and
// create (Model.diffIndexes, which only lists indexes: mongoose 9.11.4 lib/model.js). It blocks,
// writing nothing, when a record's ownerId is null or names no AuthUser, or when the per-owner
// unique indexes could not be built (repeats among the unowned records, the admin's records, or
// both together). --apply claims, builds the new indexes before dropping the old unique ones,
// carries on past a model that fails and names it, then checks the result.

import mongoose from "mongoose";
import AuthUser from "@/models/auth/AuthUser";
import { MODELS, type AnyModel } from "@/lib/data/mongo-store";
import type { CollectionName } from "@/lib/data/store";
import {
  foldOwners,
  indexName,
  orderIndexCreates,
  planClaim,
  verifyClaim,
  type CollectionFacts,
  type IndexDiff,
  type OwnerGroup,
} from "@/lib/auth/server/claim-plan";
import { flagValue, parseTarget } from "@/lib/auth/server/script-target";
import { connectTo } from "./target";

type Unique = { label: string; filter?: Record<string, unknown>; key: (doc: Record<string, unknown>) => string };
type Extra = {
  /** Fields that a per-owner unique index covers: what to compare before claiming. */
  unique?: Unique;
  /** Old path-level unique indexes this model no longer has; dropped once the new ones exist. */
  oldIndexes?: string[];
};

const EXTRAS: Partial<Record<CollectionName, Extra>> = {
  linkGroups: { unique: { label: "slug", key: (d) => String(d.slug) }, oldIndexes: ["slug_1"] },
  futureSettings: { unique: { label: "key", key: (d) => String(d.key) }, oldIndexes: ["key_1"] },
  accounts: { unique: { label: "isCash", filter: { isCash: true }, key: () => "cash" } },
  financeCategories: { unique: { label: "name", key: (d) => String(d.name) }, oldIndexes: ["name_1"] },
  financeProfile: { unique: { label: "profile", key: () => "profile" } },
  scratchpads: { unique: { label: "projectId", key: (d) => String(d.projectId) }, oldIndexes: ["projectId_1"] },
};

type Spec = Extra & { name: string; model: AnyModel; claims: boolean };

const SPECS: Spec[] = (Object.keys(MODELS) as CollectionName[]).map((name) => ({
  name,
  model: MODELS[name],
  claims: true,
  ...EXTRAS[name],
}));
// AuthUser holds no owned records; its indexes are rebuilt and checked with the rest.
const AUTH_SPEC: Spec = { name: "AuthUser", model: AuthUser as unknown as AnyModel, claims: false };

const UNOWNED = { ownerId: { $exists: false } };

type IndexSpec = [Record<string, unknown>, Record<string, unknown> | undefined];

async function indexNames(model: AnyModel): Promise<string[]> {
  try {
    return (await model.collection.indexes()).map((i) => String(i.name));
  } catch {
    return []; // collection does not exist yet
  }
}

/** Read-only: lists the indexes only. */
async function diffOf(model: AnyModel): Promise<{ toDrop: string[]; toCreate: IndexSpec[] }> {
  const diff = await model.diffIndexes({ indexOptionsToCreate: true });
  return { toDrop: diff.toDrop.map(String), toCreate: diff.toCreate as IndexSpec[] };
}

function describe(spec: IndexSpec): string {
  const [keys, options] = spec;
  const flags = [options?.unique ? "unique" : "", options?.partialFilterExpression ? "partial" : "", options?.sparse ? "sparse" : ""].filter(Boolean);
  return indexName(keys, options) + (flags.length ? ` (${flags.join(", ")})` : "");
}

async function ownerGroups(model: AnyModel): Promise<OwnerGroup[]> {
  const rows = await model.collection
    .aggregate([{ $group: { _id: { owner: "$ownerId", type: { $type: "$ownerId" } }, count: { $sum: 1 } } }])
    .toArray();
  return rows.map((r) => ({ owner: r._id.owner, type: String(r._id.type), count: Number(r.count) }));
}

async function keysOf(unique: Unique, model: AnyModel, owner: Record<string, unknown>): Promise<string[]> {
  const docs = await model.find({ ...owner, ...unique.filter }).lean();
  return docs.map((d) => unique.key(d as Record<string, unknown>));
}

async function gather(adminId: string | undefined): Promise<CollectionFacts[]> {
  const out: CollectionFacts[] = [];
  for (const spec of SPECS) {
    const facts: CollectionFacts = { name: spec.name, ...foldOwners(await ownerGroups(spec.model)) };
    if (spec.unique) {
      facts.unique = {
        label: spec.unique.label,
        unowned: await keysOf(spec.unique, spec.model, UNOWNED),
        admin: adminId ? await keysOf(spec.unique, spec.model, { ownerId: adminId }) : [],
      };
    }
    out.push(facts);
  }
  return out;
}

async function userIds(): Promise<string[]> {
  return (await AuthUser.find({}, { _id: 1 }).lean()).map((u) => String(u._id));
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function main() {
  const target = parseTarget(process.argv.slice(2));
  const adminEmail = flagValue(target.rest, "--admin")?.trim().toLowerCase();
  if (!adminEmail) throw new Error("--admin <email> is required");

  await connectTo(target);
  try {
    // passwordHash and recoveryCodes are select: false; nothing here needs them.
    const admin = await AuthUser.findOne({ email: adminEmail }).lean();
    const adminId = admin ? String(admin._id) : undefined;
    const users = await userIds();
    const collections = await gather(adminId);

    const plan = planClaim({
      admin: admin ? { found: true, id: adminId, role: admin.role, disabled: Boolean(admin.disabledAt) } : { found: false },
      userIds: users,
      collections,
    });

    console.log(`Database ${target.db}${target.apply ? " (apply)" : " (dry run: nothing is written)"}`);
    console.log(`  ${"collection".padEnd(18)} ${"unowned".padStart(8)} ${"admin".padStart(8)} ${"other users".padStart(12)} ${"null owner".padStart(11)} ${"unknown owner".padStart(14)}`);
    for (const o of plan.ownership) {
      console.log(
        `  ${o.name.padEnd(18)} ${String(o.unowned).padStart(8)} ${String(o.admin).padStart(8)} ${String(o.otherUsers).padStart(12)} ${String(o.nullOwner).padStart(11)} ${String(o.unknownOwner).padStart(14)}`,
      );
    }

    console.log("Indexes syncIndexes would change:");
    let anyIndexChange = false;
    for (const spec of [...SPECS, AUTH_SPEC]) {
      const { toDrop, toCreate } = await diffOf(spec.model);
      if (toDrop.length === 0 && toCreate.length === 0) continue;
      anyIndexChange = true;
      const parts = [toDrop.length ? `drop ${toDrop.join(", ")}` : "", toCreate.length ? `create ${toCreate.map(describe).join(", ")}` : ""];
      console.log(`  ${spec.name.padEnd(18)} ${parts.filter(Boolean).join("; ")}`);
    }
    if (!anyIndexChange) console.log("  none: every model's indexes match its schema");

    if (plan.blockers.length > 0) {
      console.error("Blocked, nothing written:");
      for (const b of plan.blockers) console.error(`  - ${b}`);
      process.exitCode = 1;
      return;
    }
    if (!target.apply) {
      console.log(`Would give ${plan.total} record(s) to ${adminEmail} and rebuild indexes. Re-run with --apply to do it.`);
      return;
    }

    const claimed: Record<string, number> = {};
    const dropped: string[] = [];
    const failures: { name: string; error: string }[] = [];
    for (const spec of [...SPECS, AUTH_SPEC]) {
      try {
        if (spec.claims) {
          const res = await spec.model.updateMany(UNOWNED, { $set: { ownerId: adminId } }, { timestamps: false });
          claimed[spec.name] = res.modifiedCount;
        }
        // New indexes first, while the old unique ones still guard the data; then the old unique
        // ones; then syncIndexes removes anything else not in the schema and builds what is left.
        const { toCreate } = await diffOf(spec.model);
        const { first } = orderIndexCreates(toCreate, await indexNames(spec.model));
        if (first.length > 0) await spec.model.createIndexes({ toCreate: first } as never);
        const have = await indexNames(spec.model);
        for (const name of spec.oldIndexes ?? []) {
          if (!have.includes(name)) continue;
          await spec.model.collection.dropIndex(name);
          dropped.push(`${spec.name}.${name}`);
        }
        await spec.model.syncIndexes();
      } catch (err) {
        failures.push({ name: spec.name, error: message(err) });
      }
    }

    const total = Object.values(claimed).reduce((n, c) => n + c, 0);
    console.log(`Claimed for ${adminEmail}:`);
    for (const spec of SPECS) console.log(`  ${spec.name.padEnd(18)} ${String(claimed[spec.name] ?? "-").padStart(6)}`);
    console.log(dropped.length ? `Dropped old indexes: ${dropped.join(", ")}` : "No old indexes to drop.");
    console.log(total === 0 ? "Nothing was left to claim." : `Gave ${total} record(s) to ${adminEmail}.`);
    if (failures.length > 0) {
      console.error(`Failed on ${failures.length} model(s); the others were done:`);
      for (const f of failures) console.error(`  - ${f.name}: ${f.error}`);
      console.error("Re-run without --apply: it names repeats on the per-owner unique keys. Any other cause is in the error above.");
      process.exitCode = 1;
    }

    const indexDiffs: IndexDiff[] = [];
    for (const spec of [...SPECS, AUTH_SPEC]) {
      const { toDrop, toCreate } = await diffOf(spec.model);
      indexDiffs.push({ name: spec.name, toDrop, toCreate: toCreate.map(describe) });
    }
    const problems = verifyClaim({ userIds: await userIds(), collections: await gather(adminId), indexDiffs });
    if (problems.length === 0) {
      console.log(`Verified: no record without an owner or with a null or unknown owner; indexes match the schema on all ${indexDiffs.length} models.`);
    } else {
      console.error("Verification failed:");
      for (const p of problems) console.error(`  - ${p}`);
      process.exitCode = 1;
    }
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error(message(err));
  process.exitCode = 1;
});
