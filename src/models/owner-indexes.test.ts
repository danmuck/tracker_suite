// Inspects schemas only; no database connection is opened.

import { test } from "node:test";
import assert from "node:assert/strict";
import type { Model } from "mongoose";
import LinkGroup from "./links/LinkGroup";
import Link from "./links/Link";
import Listing from "./future/Listing";
import Tour from "./future/Tour";
import FutureSettings from "./future/FutureSettings";
import Account from "./finance/Account";
import Transaction from "./finance/Transaction";
import Category from "./finance/Category";
import FinanceProfile from "./finance/FinanceProfile";
import Project from "./projects/Project";
import Task from "./projects/Task";
import Scratchpad from "./projects/Scratchpad";
import Workout from "./figure/Workout";
import WorkoutLog from "./figure/WorkoutLog";
import RunLog from "./figure/RunLog";
import Recipe from "./figure/Recipe";
import ShoppingItem from "./figure/ShoppingItem";

const MODELS: Record<string, Model<never>> = {
  LinkGroup, Link, Listing, Tour, FutureSettings, Account, Transaction, Category, FinanceProfile,
  Project, Task, Scratchpad, Workout, WorkoutLog, RunLog, Recipe, ShoppingItem,
} as unknown as Record<string, Model<never>>;

test("all 17 models are covered", () => {
  assert.equal(Object.keys(MODELS).length, 17);
});

for (const [name, model] of Object.entries(MODELS)) {
  test(`${name}: optional string ownerId, owner-first indexes, no path-level unique`, () => {
    const { schema } = model;
    const owner = schema.path("ownerId");
    assert.ok(owner, "ownerId path exists");
    assert.equal(owner.instance, "String");
    assert.ok(!owner.isRequired, "ownerId is not required");

    const indexes = schema.indexes();
    assert.ok(indexes.length > 0, "at least one index");
    for (const [keys] of indexes) {
      assert.equal(Object.keys(keys)[0], "ownerId", `index ${JSON.stringify(keys)} starts with ownerId`);
    }
    for (const p of Object.keys(schema.paths)) {
      assert.ok(!schema.path(p).options.unique, `${p} declares no path-level unique`);
    }
  });
}

test("unique indexes are exactly the per-owner ones", () => {
  const uniques = (m: Model<never>) =>
    m.schema
      .indexes()
      .filter(([, opts]) => opts?.unique)
      .map(([keys, opts]) => ({ keys, partial: opts?.partialFilterExpression }));
  assert.deepEqual(uniques(LinkGroup as never), [{ keys: { ownerId: 1, slug: 1 }, partial: undefined }]);
  assert.deepEqual(uniques(Category as never), [{ keys: { ownerId: 1, name: 1 }, partial: undefined }]);
  assert.deepEqual(uniques(FutureSettings as never), [{ keys: { ownerId: 1, key: 1 }, partial: undefined }]);
  assert.deepEqual(uniques(Scratchpad as never), [{ keys: { ownerId: 1, projectId: 1 }, partial: undefined }]);
  assert.deepEqual(uniques(FinanceProfile as never), [{ keys: { ownerId: 1 }, partial: undefined }]);
  assert.deepEqual(uniques(Account as never), [{ keys: { ownerId: 1 }, partial: { isCash: true } }]);
  for (const [name, m] of Object.entries(MODELS)) {
    if (["LinkGroup", "Category", "FutureSettings", "Scratchpad", "FinanceProfile", "Account"].includes(name)) continue;
    assert.deepEqual(uniques(m), [], `${name} has no unique index`);
  }
});

test("Account also has a plain {ownerId, type} index", () => {
  const plain = Account.schema.indexes().filter(([, o]) => !o?.unique).map(([k]) => k);
  assert.deepEqual(plain, [{ ownerId: 1, type: 1 }]);
});
