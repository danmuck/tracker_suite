import { test } from "node:test";
import assert from "node:assert/strict";
import { createStorageResolver, shouldReloadAfterSeed } from "./storage";
import { memoryStorage } from "./test-helpers";

test("blocked storage resolves to one shared in-memory fallback", () => {
  const resolver = createStorageResolver(() => {
    throw new Error("SecurityError");
  });
  const first = resolver.get();
  assert.equal(resolver.get(), first);
  assert.equal(resolver.isPersistent(), false);
  first.setItem("k", "v");
  assert.equal(resolver.get().getItem("k"), "v");
});

test("usable storage is returned as is and counts as persistent", () => {
  const local = memoryStorage();
  const resolver = createStorageResolver(() => local);
  assert.equal(resolver.get(), local);
  assert.equal(resolver.isPersistent(), true);
});

test("storage that throws on write falls back to memory", () => {
  const local = memoryStorage();
  local.failWrites = true;
  const resolver = createStorageResolver(() => local);
  assert.notEqual(resolver.get(), local);
  assert.equal(resolver.isPersistent(), false);
});

test("reload after seeding only when storage persists", () => {
  assert.equal(shouldReloadAfterSeed(true, true), true);
  assert.equal(shouldReloadAfterSeed(true, false), false);
  assert.equal(shouldReloadAfterSeed(false, true), false);
});
