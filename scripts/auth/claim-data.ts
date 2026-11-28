// Gives every record that has no owner to the named admin, then rebuilds the indexes so they are
// per owner. Without --apply it only reports; it writes nothing.
//
//   node --experimental-strip-types --no-warnings --import ./scripts/register-ts.mjs \
//     scripts/auth/claim-data.ts --db <name> --admin <email> [--apply] [--uri <uri>]
//
// Stop the app and create the admin first. Take a mongodump of a live database before --apply.
// Connects only to the database named by --db. Running --apply twice changes nothing the second time.

import mongoose from "mongoose";
import type { Model } from "mongoose";
import AuthUser from "../../src/models/auth/AuthUser.ts";
import LinkGroup from "../../src/models/links/LinkGroup.ts";
import Link from "../../src/models/links/Link.ts";
import Listing from "../../src/models/future/Listing.ts";
import Tour from "../../src/models/future/Tour.ts";
import FutureSettings from "../../src/models/future/FutureSettings.ts";
import Account from "../../src/models/finance/Account.ts";
import Transaction from "../../src/models/finance/Transaction.ts";
import Category from "../../src/models/finance/Category.ts";
import FinanceProfile from "../../src/models/finance/FinanceProfile.ts";
import Project from "../../src/models/projects/Project.ts";
import Task from "../../src/models/projects/Task.ts";
import Scratchpad from "../../src/models/projects/Scratchpad.ts";
import Workout from "../../src/models/figure/Workout.ts";
import WorkoutLog from "../../src/models/figure/WorkoutLog.ts";
import RunLog from "../../src/models/figure/RunLog.ts";
import Recipe from "../../src/models/figure/Recipe.ts";
import ShoppingItem from "../../src/models/figure/ShoppingItem.ts";
import { planClaim, type CollectionFacts } from "../../src/lib/auth/server/claim-plan.ts";
import { flagValue, parseTarget } from "../../src/lib/auth/server/script-target.ts";
import { connectTo } from "./target.ts";

type AnyModel = Model<any>; // eslint-disable-line @typescript-eslint/no-explicit-any

type Spec = {
  name: string;
  model: AnyModel;
  /** Fields that a per-owner unique index covers: what to compare before claiming. */
  unique?: { label: string; filter?: Record<string, unknown>; key: (doc: Record<string, unknown>) => string };
  /** Old path-level indexes this model no longer has; dropped before syncIndexes. */
  oldIndexes?: string[];
};

const SPECS: Spec[] = [
  { name: "linkGroups", model: LinkGroup, unique: { label: "slug", key: (d) => String(d.slug) }, oldIndexes: ["slug_1"] },
  { name: "links", model: Link },
  { name: "listings", model: Listing },
  { name: "tours", model: Tour },
  { name: "futureSettings", model: FutureSettings, unique: { label: "key", key: (d) => String(d.key) }, oldIndexes: ["key_1"] },
  { name: "accounts", model: Account, unique: { label: "isCash", filter: { isCash: true }, key: () => "cash" } },
  { name: "transactions", model: Transaction },
  { name: "financeCategories", model: Category, unique: { label: "name", key: (d) => String(d.name) }, oldIndexes: ["name_1"] },
  { name: "financeProfile", model: FinanceProfile, unique: { label: "profile", key: () => "profile" } },
  { name: "projects", model: Project },
  { name: "tasks", model: Task },
  { name: "scratchpads", model: Scratchpad, unique: { label: "projectId", key: (d) => String(d.projectId) }, oldIndexes: ["projectId_1"] },
  { name: "workouts", model: Workout },
  { name: "workoutLogs", model: WorkoutLog },
  { name: "runLogs", model: RunLog },
  { name: "recipes", model: Recipe },
  { name: "shoppingItems", model: ShoppingItem },
];

const UNOWNED = { ownerId: { $exists: false } };

async function indexNames(model: AnyModel): Promise<string[]> {
  try {
    return (await model.collection.indexes()).map((i) => String(i.name));
  } catch {
    return []; // collection does not exist yet
  }
}

async function keysOf(spec: Spec, owner: Record<string, unknown>): Promise<string[]> {
  const u = spec.unique!;
  const docs = await spec.model.find({ ...owner, ...u.filter }).lean();
  return docs.map((d) => u.key(d as Record<string, unknown>));
}

async function main() {
  const target = parseTarget(process.argv.slice(2));
  const adminEmail = flagValue(target.rest, "--admin")?.trim().toLowerCase();
  if (!adminEmail) throw new Error("--admin <email> is required");

  await connectTo(target);
  try {
    const admin = await AuthUser.findOne({ email: adminEmail }).lean();
    const adminId = admin ? String(admin._id) : "";

    const collections: CollectionFacts[] = [];
    for (const spec of SPECS) {
      const facts: CollectionFacts = {
        name: spec.name,
        unowned: await spec.model.countDocuments(UNOWNED),
        others: admin ? await spec.model.countDocuments({ ownerId: { $exists: true, $ne: adminId } }) : 0,
      };
      if (spec.unique) {
        facts.unique = {
          label: spec.unique.label,
          unowned: await keysOf(spec, UNOWNED),
          admin: admin ? await keysOf(spec, { ownerId: adminId }) : [],
          others: admin ? await keysOf(spec, { ownerId: { $exists: true, $ne: adminId } }) : [],
        };
      }
      collections.push(facts);
    }

    const plan = planClaim({
      admin: admin ? { found: true, role: admin.role, disabled: Boolean(admin.disabledAt) } : { found: false },
      collections,
    });

    console.log(`Database ${target.db}${target.apply ? " (apply)" : " (dry run: nothing is written)"}`);
    for (const c of collections) console.log(`  ${c.name.padEnd(18)} ${String(c.unowned).padStart(6)} without an owner`);
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
    for (const spec of SPECS) {
      const res = await spec.model.updateMany(UNOWNED, { $set: { ownerId: adminId } }, { timestamps: false });
      claimed[spec.name] = res.modifiedCount;
    }
    const dropped: string[] = [];
    for (const spec of SPECS) {
      if (!spec.oldIndexes) continue;
      const have = await indexNames(spec.model);
      for (const name of spec.oldIndexes) {
        if (!have.includes(name)) continue;
        await spec.model.collection.dropIndex(name);
        dropped.push(`${spec.name}.${name}`);
      }
    }
    for (const spec of SPECS) await spec.model.syncIndexes();
    await AuthUser.syncIndexes();

    console.log(`Claimed for ${adminEmail}:`);
    for (const spec of SPECS) console.log(`  ${spec.name.padEnd(18)} ${String(claimed[spec.name]).padStart(6)}`);
    console.log(dropped.length ? `Dropped old indexes: ${dropped.join(", ")}` : "No old indexes to drop.");
    console.log(plan.total === 0 ? "Nothing was left to claim." : `Gave ${plan.total} record(s) to ${adminEmail}. Indexes rebuilt.`);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
