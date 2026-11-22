import { test } from "node:test";
import assert from "node:assert/strict";
import { dispatch } from "@/lib/data/dispatch";
import { ConflictError, type BaseDoc, type Store } from "@/lib/data/store";
import { categories, type CategoryDoc } from "./docs";
import { financeRoutes } from "./routes";
import { interleavingStore, NOW, setup } from "./test-helpers";

let t = setup();
test.beforeEach(() => { t = setup(); });
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const strip = <T extends BaseDoc>({ _id, createdAt, updatedAt, ...rest }: T) => rest;

test("categories: defaults seeded once, defaults first then by name; create trims and lowercases; duplicates are 400", async () => {
  const names = async () => ((await t.call("GET", "/api/categories")).body as { data: CategoryDoc[] }).data.map((c) => c.name);
  assert.deepEqual(await names(), ["bills", "bonus", "credit", "loans", "other", "salary", "spending", "subscriptions", "transfer"]);
  const made = await t.call("POST", "/api/categories", { name: "  Pets ", color: "#112233", icon: "Dog" });
  assert.equal(made.status, 201);
  assert.deepEqual(strip((made.body as { data: CategoryDoc }).data), { name: "pets", color: "#112233", icon: "Dog", isDefault: false });
  assert.deepEqual(await t.call("POST", "/api/categories", { name: " PETS", color: "#112233", icon: "Dog" }), { status: 400, body: { error: "Category already exists" } });
  const invalid = await t.call("POST", "/api/categories", { name: "x", color: "red", icon: "Dog" });
  assert.deepEqual([invalid.status, (invalid.body as { error: string }).error], [400, "Validation failed"]);
  assert.deepEqual(await t.call("POST", "/api/categories", { name: "   ", color: "#112233", icon: "Dog" }), { status: 500, body: { error: "Failed to create category" } });
  assert.deepEqual(await names(), ["bills", "bonus", "credit", "loans", "other", "salary", "spending", "subscriptions", "transfer", "pets"]);
  assert.equal(await categories(t.store).count(), 10);
});

test("a unique-index conflict stays a 500 with the route's own message", async () => {
  const real = categories(t.store);
  // A stand-in whose findOne misses and whose insert races; every other method is the real one.
  const racing = new Proxy(real, {
    get(target, prop) {
      if (prop === "findOne") return async () => null;
      if (prop === "insert") return async () => { throw new ConflictError("financeCategories", "name"); };
      const value = Reflect.get(target, prop, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  const conflicted: Store = { collection: (name) => name === "financeCategories" ? (racing as never) : t.store.collection(name) };
  assert.deepEqual(await dispatch(financeRoutes, conflicted, "POST", "/api/categories", { name: "x", color: "#112233", icon: "Dog" }), { status: 500, body: { error: "Failed to create category" } });
});

test("two overlapping first lists both seed-or-read and answer the same full list (bug 16)", async () => {
  const racing = interleavingStore(t.store);
  const [a, b] = await Promise.all([1, 2].map(() => dispatch(financeRoutes, racing, "GET", "/api/categories", undefined, NOW)));
  assert.deepEqual([a.status, b.status], [200, 200]);
  assert.deepEqual(a.body, b.body);
  assert.equal((a.body as { data: CategoryDoc[] }).data.length, 9);
  assert.equal(await categories(t.store).count(), 9);
});

test("a seed that conflicts is treated as already seeded; any other insert failure stays a 500", async () => {
  const real = categories(t.store);
  const failWith = (error: Error): Store => {
    const failing = new Proxy(real, {
      get(target, prop) {
        if (prop === "insertMany") return async () => { throw error; };
        const value = Reflect.get(target, prop, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    return { collection: (name) => name === "financeCategories" ? (failing as never) : t.store.collection(name) };
  };
  assert.deepEqual(await dispatch(financeRoutes, failWith(new ConflictError("financeCategories", "name")), "GET", "/api/categories", undefined, NOW), { status: 200, body: { data: [] } });
  assert.deepEqual(await dispatch(financeRoutes, failWith(new Error("disk full")), "GET", "/api/categories", undefined, NOW), { status: 500, body: { error: "Failed to fetch categories" } });
});

// ── Golden steps for R16–R17 (scripts/finance-parity/golden/transcript.json) ──

test("golden A02, C01–C04: seeded defaults, a created category after them, the duplicate and the validation details", async () => {
  const list = ((await t.call("GET", "/api/categories")).body as { data: CategoryDoc[] }).data.map(strip);
  assert.deepEqual(list[0], { color: "#ef4444", icon: "Receipt", isDefault: true, name: "bills" });
  const c01 = await t.call("POST", "/api/categories", { name: "Parity Pets", color: "#112233", icon: "Dog" });
  assert.deepEqual([c01.status, strip((c01.body as { data: CategoryDoc }).data)], [201, { color: "#112233", icon: "Dog", isDefault: false, name: "parity pets" }]);
  assert.deepEqual(await t.call("POST", "/api/categories", { name: "  PARITY pets ", color: "#112233", icon: "Dog" }), { status: 400, body: { error: "Category already exists" } });
  const message = JSON.stringify([{ origin: "string", code: "invalid_format", format: "regex", pattern: "/^#[0-9a-fA-F]{6}$/", path: ["color"], message: "Must be a valid hex color" }], null, 2);
  assert.deepEqual(await t.call("POST", "/api/categories", { name: "x", color: "red", icon: "Dog" }), { status: 400, body: { error: "Validation failed", details: { name: "ZodError", message } } });
  const c04 = ((await t.call("GET", "/api/categories")).body as { data: CategoryDoc[] }).data;
  assert.deepEqual([c04.length, c04[9].name], [10, "parity pets"]);
});
