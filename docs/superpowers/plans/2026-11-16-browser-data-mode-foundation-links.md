# Browser Data Mode: Foundation + Links — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the app run the Links module against either MongoDB or browser storage through one copy of the route logic, with a header switch, sample data and a locked demo build.

**Architecture:** Route logic moves into plain handlers that talk to a `Store` interface. `MongoStore` wraps the existing Mongoose models on the server; `BrowserStore` evaluates the same queries over localStorage. Route files become one-line adapters, and in browser mode the hooks' request helper dispatches to the same handlers locally instead of calling `fetch`.

**Tech Stack:** Next.js 16 App Router, TypeScript, Mongoose 9, Zod 4, SWR 2, shadcn/ui, `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-16-browser-data-mode-design.md`

**Scope:** This is plan 1 of 5. It builds the foundation and converts Links. Future, Projects, Figure and Finance each get their own plan, written after this one lands so they use the real interfaces. The public demo ships only after all five.

## Global Constraints

- Code reachable from the browser must not import `mongoose`, `next/server` or `src/lib/db.ts`. Only `src/lib/data/mongo-store.ts`, `src/lib/data/serve.ts` and `route.ts` files may.
- Modules never import each other (ESLint `no-restricted-imports`). Shared code lives in `src/lib/data/`, `src/lib/demo/`, `src/hooks/`, `src/components/`; none of those are module folders.
- Documents cross the `Store` boundary as plain JSON: `_id` a 24-character hex string, dates ISO strings.
- No new dependencies.
- Demo flag is `NEXT_PUBLIC_DEMO=1`, read at build time.
- My data mode must behave as it does today, apart from invalid ids returning 404 instead of 500.
- Never hand-test against the owner's live database. Use the scratch database from Task 5.
- Nothing copies MongoDB data into the browser.
- Tests: `npm test` (`node --test` over `src/**/*.test.ts`, `@/` alias works, TZ is America/New_York). Tests import with relative paths or `@/`.
- Commit after each task with the message given. Stage files by name, not `git add -A`.

## Review Focus

1. **localStorage throws on write** (quota exceeded, storage disabled): the write rejects with a clear `Error("Browser storage is full or unavailable")`; the in-memory copy is rolled back so memory and storage agree. → Task 2.
2. **A storage key holds corrupt JSON**: that collection reads as empty instead of throwing. → Task 2.
3. **Malformed id in a URL** (`/api/links/abc`): 404 from both stores, never a 500 or a cast error. → Task 4.
4. **A request in browser mode for a route with no handler** (unconverted module, stale hook): rejects with `"Not available in browser data mode"` so pages show their error state instead of loading forever. → Task 6.
5. **Two groups created with the same name**: the second gets a suffixed slug in both stores, and a unique-field collision raises `ConflictError` rather than silently duplicating. → Tasks 2 and 4.

---

## File Structure

```
src/lib/data/
  query.ts            filter matching, update operators, sorting (pure)
  store.ts            Store / Collection types, ConflictError, collection registry
  browser-store.ts    Store over a Storage-like object
  api.ts              ApiResult, Handler, RouteDef, ok/fail/isId helpers (pure)
  dispatch.ts         match method+URL to a RouteDef and run it (pure)
  all-routes.ts       every converted module's RouteDefs
  mode.ts             demo flag, saved data source, useDataSource hook
  local.ts            browser-side entry: BrowserStore singleton + dispatch
  mongo-store.ts      Store over Mongoose models            (server only)
  serve.ts            Next route adapter                    (server only)
src/lib/links/api/
  handlers.ts         Links route logic
  routes.ts           linksRoutes: RouteDef[]
src/lib/demo/
  links.ts            Links sample data
  index.ts            loadSampleData / resetBrowserData
src/components/
  data-source-switch.tsx   header control
  module-gate.tsx          "not available in browser data mode" state
```

---

### Task 1: Query evaluator

**Files:**
- Create: `src/lib/data/query.ts`
- Test: `src/lib/data/query.test.ts`

**Interfaces:**
- Produces:
  - `type Filter = Record<string, unknown>`
  - `type Update = { $set?: Record<string, unknown>; $unset?: Record<string, unknown>; $inc?: Record<string, number>; $setOnInsert?: Record<string, unknown> }`
  - `type Sort = Record<string, 1 | -1>`
  - `matches(doc: Record<string, unknown>, filter: Filter): boolean`
  - `applyUpdate<T extends Record<string, unknown>>(doc: T, update: Update, inserting?: boolean): T` — returns a new object; `$setOnInsert` applies only when `inserting` is true
  - `sortDocs<T extends Record<string, unknown>>(docs: T[], sort: Sort): T[]` — returns a new array, stable, keys applied in insertion order
  - `selectFields<T extends Record<string, unknown>>(doc: T, fields: string[]): Partial<T>` — always keeps `_id`

Semantics to implement:
- A filter key with a plain value means equality; if the document's value is an array, it means "array contains".
- Operator objects: `$gt $gte $lt $lte $ne $in $exists $regex` (with `$options: "i"`). Top-level `$or: Filter[]`.
- `Date` values in a filter are converted to ISO strings before comparing, so they compare correctly against stored ISO strings.
- A missing field equals `undefined`; `{ field: null }` matches missing or null (as Mongo does).
- Dotted paths are not supported; throw `Error("Unsupported filter operator: <name>")` for any other `$` operator so a later module that needs one fails loudly.

- [ ] **Step 1: Write the failing tests** in `src/lib/data/query.test.ts`

```ts
const doc = { _id: "a", name: "Rent", amount: 875, tags: ["bills", "home"], date: "2026-11-01T05:00:00.000Z", note: null };

test("equality, array contains, missing fields", () => {
  assert.equal(matches(doc, { name: "Rent" }), true);
  assert.equal(matches(doc, { tags: "home" }), true);
  assert.equal(matches(doc, { tags: "car" }), false);
  assert.equal(matches(doc, { missing: null }), true);
  assert.equal(matches(doc, { note: null }), true);
  assert.equal(matches(doc, {}), true);
});

test("comparison operators, including Date against ISO strings", () => {
  assert.equal(matches(doc, { amount: { $gte: 875, $lt: 900 } }), true);
  assert.equal(matches(doc, { amount: { $gt: 875 } }), false);
  assert.equal(matches(doc, { date: { $gte: new Date("2026-11-01T00:00:00.000Z"), $lte: new Date("2026-11-30T00:00:00.000Z") } }), true);
  assert.equal(matches(doc, { _id: { $ne: "a" } }), false);
  assert.equal(matches(doc, { _id: { $in: ["a", "b"] } }), true);
  assert.equal(matches(doc, { missing: { $exists: false } }), true);
  assert.equal(matches(doc, { name: { $regex: "ren", $options: "i" } }), true);
});

test("$or and unknown operators", () => {
  assert.equal(matches(doc, { $or: [{ name: "x" }, { amount: 875 }] }), true);
  assert.equal(matches(doc, { $or: [{ name: "x" }, { amount: 1 }] }), false);
  assert.throws(() => matches(doc, { amount: { $mod: [2, 0] } }), /Unsupported filter operator: \$mod/);
});

test("applyUpdate handles $set, $unset, $inc and $setOnInsert without mutating", () => {
  const next = applyUpdate(doc, { $set: { name: "Rent 2" }, $unset: { note: 1 }, $inc: { amount: -75, count: 2 } });
  assert.deepEqual([next.name, next.amount, next.count, "note" in next], ["Rent 2", 800, 2, false]);
  assert.equal(doc.name, "Rent");
  assert.equal(applyUpdate(doc, { $setOnInsert: { name: "x" } }).name, "Rent");
  assert.equal(applyUpdate(doc, { $setOnInsert: { name: "x" } }, true).name, "x");
});

test("sortDocs sorts by several keys and selectFields keeps _id", () => {
  const rows = [{ _id: "1", order: 1, createdAt: "b" }, { _id: "2", order: 0, createdAt: "a" }, { _id: "3", order: 1, createdAt: "c" }];
  assert.deepEqual(sortDocs(rows, { order: 1, createdAt: -1 }).map((r) => r._id), ["2", "3", "1"]);
  assert.deepEqual(selectFields(rows[0], ["order"]), { _id: "1", order: 1 });
});
```

- [ ] **Step 2: Run** `npm test 2>&1 | grep -E "query|fail"` — expect failures (module not found).
- [ ] **Step 3: Implement `src/lib/data/query.ts`** with the signatures and semantics above.
- [ ] **Step 4: Run** `npm test` — expect all passing.
- [ ] **Step 5: Commit** `feat(data): add query evaluator for browser storage`

---

### Task 2: Store interface and BrowserStore

**Files:**
- Create: `src/lib/data/store.ts`, `src/lib/data/browser-store.ts`
- Test: `src/lib/data/browser-store.test.ts`

**Interfaces:**
- Consumes: `Filter`, `Update`, `Sort`, `matches`, `applyUpdate`, `sortDocs`, `selectFields` from Task 1.
- Produces, in `store.ts`:

```ts
export interface BaseDoc { _id: string; createdAt: string; updatedAt: string }
export interface FindOptions { sort?: Sort; skip?: number; limit?: number; select?: string[] }
export interface Collection<T extends BaseDoc> {
  findById(id: string): Promise<T | null>;
  findOne(filter?: Filter, options?: FindOptions): Promise<T | null>;
  find(filter?: Filter, options?: FindOptions): Promise<T[]>;
  count(filter?: Filter): Promise<number>;
  exists(filter: Filter): Promise<boolean>;
  distinct(field: string, filter?: Filter): Promise<unknown[]>;
  insert(doc: Omit<T, keyof BaseDoc>): Promise<T>;
  insertMany(docs: Omit<T, keyof BaseDoc>[]): Promise<T[]>;
  updateById(id: string, update: Update): Promise<T | null>;          // returns the updated doc
  updateOne(filter: Filter, update: Update, options?: { upsert?: boolean }): Promise<T | null>;
  updateMany(filter: Filter, update: Update): Promise<number>;        // count changed
  batchUpdate(ops: { filter: Filter; update: Update }[]): Promise<void>;
  deleteById(id: string): Promise<T | null>;                          // returns the deleted doc
  deleteMany(filter: Filter): Promise<number>;
}
export interface Store { collection<T extends BaseDoc>(name: CollectionName): Collection<T> }
export class ConflictError extends Error { constructor(public collection: string, public field: string) }
export const COLLECTIONS = { linkGroups: { unique: ["slug"] }, links: { unique: [] } } as const;
export type CollectionName = keyof typeof COLLECTIONS;
```

- Produces, in `browser-store.ts`:
  - `interface StorageLike { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void; key(index: number): string | null; readonly length: number }`
  - `const DATA_VERSION = 1`
  - `class BrowserStore implements Store { constructor(storage: StorageLike); invalidate(collection?: CollectionName): void; clear(): void }`
  - `newId(): string` — 24 lowercase hex characters

Behavior:
- Storage keys: `ts:data:<collection>` holds a JSON array; `ts:data:version` holds the version.
- On construction, if the stored version differs from `DATA_VERSION`, remove every `ts:data:*` key, then write the current version.
- A collection is loaded into memory on first use. `invalidate(name)` drops the in-memory copy so the next call re-reads storage (used for changes from other tabs); `clear()` removes all `ts:data:*` collection keys and in-memory copies.
- `insert` assigns `_id`, `createdAt`, `updatedAt` (ISO, now). Updates refresh `updatedAt`. Values that are `undefined` are dropped, as JSON does.
- Unique fields from `COLLECTIONS` are checked on insert and update; a collision throws `ConflictError`.
- `updateOne` with `upsert` inserts `applyUpdate({...equality fields of the filter}, update, true)` when nothing matches.
- A write that makes `setItem` throw restores the previous in-memory array and throws `Error("Browser storage is full or unavailable")`.
- Corrupt JSON in a key reads as an empty collection.

- [ ] **Step 1: Write the failing tests** using an in-memory `StorageLike` (a `Map` wrapper with an optional `failWrites` switch):

```ts
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
  await groups.batchUpdate([{ filter: { slug: "s" }, update: { $inc: { order: 2 } } }, { filter: { slug: "s" }, update: { $inc: { order: 3 } } }]);
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
```

- [ ] **Step 2: Run** `npm test` — expect the new file to fail.
- [ ] **Step 3: Implement `store.ts` and `browser-store.ts`** as specified.
- [ ] **Step 4: Run** `npm test` — expect all passing.
- [ ] **Step 5: Commit** `feat(data): add Store interface and BrowserStore`

---

### Task 3: Handler types and dispatch

**Files:**
- Create: `src/lib/data/api.ts`, `src/lib/data/dispatch.ts`
- Test: `src/lib/data/dispatch.test.ts`

**Interfaces:**
- Consumes: `Store`, `ConflictError` from Task 2.
- Produces, in `api.ts`:

```ts
export interface ApiResult { status: number; body: unknown }
export interface HandlerContext { store: Store; params: Record<string, string>; query: URLSearchParams; body: unknown }
export type Handler = (ctx: HandlerContext) => Promise<ApiResult>;
export type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
export interface RouteDef { method: Method; path: string; handler: Handler }   // path like "/api/links/:linkId"
export const ok = (body: unknown, status = 200): ApiResult
export const fail = (status: number, error: string, details?: unknown): ApiResult   // body { error, details? }
export const notFound = (what: string): ApiResult                                  // 404, "<what> not found"
export const invalid = (error: ZodError): ApiResult                                // 400, { error: "Validation failed", details: error.flatten() }
export const isId = (value: string): boolean                                       // /^[0-9a-f]{24}$/i
```

- Produces, in `dispatch.ts`:
  - `matchRoute(routes: RouteDef[], method: string, pathname: string): { route: RouteDef; params: Record<string, string> } | null`
  - `dispatch(routes: RouteDef[], store: Store, method: string, url: string, body?: unknown): Promise<ApiResult>` — `url` is path plus optional query string. No match → `fail(404, "Not available in browser data mode")`. A thrown `ConflictError` → `fail(409, "Already exists")`. Any other throw → `console.error` and `fail(500, "Request failed")`.
  - `serverGuard(isDemo: boolean): ApiResult | null` — `fail(403, "The demo does not use a server database")` when `isDemo`, else `null`.

- [ ] **Step 1: Write the failing tests**

```ts
const routes: RouteDef[] = [
  { method: "GET", path: "/api/links", handler: async ({ query }) => ok({ group: query.get("groupId") }) },
  { method: "GET", path: "/api/links/:linkId", handler: async ({ params }) => ok(params) },
  { method: "POST", path: "/api/links", handler: async ({ body }) => ok(body, 201) },
  { method: "DELETE", path: "/api/links/:linkId", handler: async () => { throw new ConflictError("links", "slug"); } },
  { method: "PUT", path: "/api/links/:linkId", handler: async () => { throw new Error("boom"); } },
];
const store = new BrowserStore(memoryStorage());

test("dispatch matches method and path, passing params, query and body", async () => {
  assert.deepEqual(await dispatch(routes, store, "GET", "/api/links?groupId=g1"), { status: 200, body: { group: "g1" } });
  assert.deepEqual(await dispatch(routes, store, "GET", "/api/links/abc"), { status: 200, body: { linkId: "abc" } });
  assert.deepEqual(await dispatch(routes, store, "POST", "/api/links", { a: 1 }), { status: 201, body: { a: 1 } });
});

test("dispatch reports unknown routes, conflicts and crashes as results", async () => {
  assert.deepEqual(await dispatch(routes, store, "GET", "/api/accounts"), { status: 404, body: { error: "Not available in browser data mode" } });
  assert.equal((await dispatch(routes, store, "PATCH", "/api/links")).status, 404);
  assert.equal((await dispatch(routes, store, "DELETE", "/api/links/x")).status, 409);
  assert.deepEqual(await dispatch(routes, store, "PUT", "/api/links/x"), { status: 500, body: { error: "Request failed" } });
});

test("serverGuard blocks only the demo, and isId accepts 24 hex characters", () => {
  assert.equal(serverGuard(false), null);
  assert.deepEqual(serverGuard(true), { status: 403, body: { error: "The demo does not use a server database" } });
  assert.deepEqual([isId("a".repeat(24)), isId("abc"), isId("z".repeat(24))], [true, false, false]);
});
```

- [ ] **Step 2: Run** `npm test` — expect failures.
- [ ] **Step 3: Implement `api.ts` and `dispatch.ts`.** Move the shared `memoryStorage()` test helper to `src/lib/data/test-helpers.ts` and use it from both test files.
- [ ] **Step 4: Run** `npm test` — expect all passing.
- [ ] **Step 5: Commit** `feat(data): add handler types and route dispatch`

---

### Task 4: Links handlers

**Files:**
- Create: `src/lib/links/api/handlers.ts`, `src/lib/links/api/routes.ts`
- Modify: `src/lib/links/validators.ts` (trim `name`, `icon`, `url` with `z.string().trim()`, since Mongoose did the trimming until now)
- Test: `src/lib/links/api/handlers.test.ts`

**Interfaces:**
- Consumes: `Handler`, `RouteDef`, `ok`, `fail`, `notFound`, `invalid`, `isId` (Task 3); `Store`, `BaseDoc` (Task 2).
- Produces: `export const linksRoutes: RouteDef[]` in `routes.ts`, covering exactly:

| Method | Path | Handler | Notes |
|---|---|---|---|
| GET | `/api/link-groups` | `listGroups` | sorted `{ order: 1, createdAt: -1 }`, each with `linkCount` |
| POST | `/api/link-groups` | `createGroup` | 201; `order` = highest existing + 1 (0 when empty) |
| GET | `/api/link-groups/:groupId` | `getGroup` | |
| PUT | `/api/link-groups/:groupId` | `updateGroup` | re-slugs only when the name changes; `icon` left alone when omitted |
| DELETE | `/api/link-groups/:groupId` | `deleteGroup` | deletes the group's links first; body `{ message: "Group and associated links deleted" }` |
| GET | `/api/links` | `listLinks` | optional `?groupId=`; sorted `{ order: 1, createdAt: -1 }` |
| POST | `/api/links` | `createLink` | 201; 404 `"Link group not found"` for an unknown group; `order` = highest in that group + 1 |
| GET | `/api/links/:linkId` | `getLink` | |
| PUT | `/api/links/:linkId` | `updateLink` | updates `name` and `url` only |
| DELETE | `/api/links/:linkId` | `deleteLink` | body `{ message: "Link deleted" }` |

Behavior carried over from the current route files (`src/app/api/link-groups/**`, `src/app/api/links/**`): the `slugify` function, the `-<Date.now()>` suffix when a slug is taken, error strings (`"Group not found"`, `"Link not found"`), validation via `linkGroupSchema` / `linkSchema`. New: a malformed id returns the same 404 as a missing one, and `linkCount` is computed by finding the links for the listed groups and counting in code (no aggregation).

Types: use `LinkGroup` from `src/types/links/link-group.ts` and `LinkItem` from `src/types/links/link.ts` as the collection document types.

- [ ] **Step 1: Write the failing tests.** Helper: `const call = (method, url, body?) => dispatch(linksRoutes, store, method, url, body)` with a fresh `BrowserStore(memoryStorage())` per test.

```ts
test("groups: create assigns slug and order; list returns link counts in order", async () => {
  const a = (await call("POST", "/api/link-groups", { name: "  Home Lab  ", icon: "Server" })).body as LinkGroup;
  const b = (await call("POST", "/api/link-groups", { name: "Gaming" })).body as LinkGroup;
  assert.deepEqual([a.name, a.slug, a.order, b.order], ["Home Lab", "home-lab", 0, 1]);
  await call("POST", "/api/links", { groupId: a._id, name: "Router", url: "https://router.example" });
  const list = (await call("GET", "/api/link-groups")).body as LinkGroup[];
  assert.deepEqual(list.map((g) => [g.name, g.linkCount]), [["Home Lab", 1], ["Gaming", 0]]);
});

test("groups: a duplicate name gets a suffixed slug", async () => {
  await call("POST", "/api/link-groups", { name: "Gaming" });
  const second = (await call("POST", "/api/link-groups", { name: "Gaming" })).body as LinkGroup;
  assert.match(second.slug, /^gaming-\d+$/);
});

test("groups: update re-slugs on rename and keeps the icon when omitted; delete cascades", async () => {
  const g = (await call("POST", "/api/link-groups", { name: "Tools", icon: "Wrench" })).body as LinkGroup;
  await call("POST", "/api/links", { groupId: g._id, name: "X", url: "https://x.example" });
  const renamed = (await call("PUT", `/api/link-groups/${g._id}`, { name: "Dev Tools" })).body as LinkGroup;
  assert.deepEqual([renamed.slug, renamed.icon], ["dev-tools", "Wrench"]);
  assert.equal((await call("DELETE", `/api/link-groups/${g._id}`)).status, 200);
  assert.deepEqual((await call("GET", `/api/links?groupId=${g._id}`)).body, []);
});

test("links: create orders within the group, update changes name and url only", async () => {
  const g = (await call("POST", "/api/link-groups", { name: "G" })).body as LinkGroup;
  const one = (await call("POST", "/api/links", { groupId: g._id, name: "One", url: "https://one.example" })).body as LinkItem;
  const two = (await call("POST", "/api/links", { groupId: g._id, name: "Two", url: "https://two.example" })).body as LinkItem;
  assert.deepEqual([one.order, two.order], [0, 1]);
  const updated = (await call("PUT", `/api/links/${one._id}`, { groupId: "ignored", name: "Uno", url: "https://uno.example" })).body as LinkItem;
  assert.deepEqual([updated.name, updated.url, updated.groupId, updated.order], ["Uno", "https://uno.example", g._id, 0]);
  assert.deepEqual(((await call("GET", `/api/links?groupId=${g._id}`)).body as LinkItem[]).map((l) => l.name), ["Uno", "Two"]);
});

test("validation failures are 400; unknown and malformed ids are 404", async () => {
  assert.equal((await call("POST", "/api/link-groups", { name: "" })).status, 400);
  assert.equal((await call("POST", "/api/links", { groupId: "a".repeat(24), name: "N", url: "not a url" })).status, 400);
  assert.deepEqual(await call("POST", "/api/links", { groupId: "a".repeat(24), name: "N", url: "https://n.example" }), { status: 404, body: { error: "Link group not found" } });
  for (const id of ["abc", "a".repeat(24)]) {
    assert.deepEqual(await call("GET", `/api/link-groups/${id}`), { status: 404, body: { error: "Group not found" } });
    assert.deepEqual(await call("DELETE", `/api/links/${id}`), { status: 404, body: { error: "Link not found" } });
  }
});
```

- [ ] **Step 2: Run** `npm test` — expect failures.
- [ ] **Step 3: Implement handlers and `linksRoutes`**, and trim in the validators.
- [ ] **Step 4: Run** `npm test` and `npx eslint src/lib/links src/lib/data` — expect passing and no errors.
- [ ] **Step 5: Commit** `feat(links): move route logic into store-backed handlers`

---

### Task 5: MongoStore, route adapter, and Links routes on the adapter

**Files:**
- Create: `src/lib/data/mongo-store.ts`, `src/lib/data/serve.ts`, `src/lib/data/all-routes.ts`
- Modify: `src/app/api/link-groups/route.ts`, `src/app/api/link-groups/[groupId]/route.ts`, `src/app/api/links/route.ts`, `src/app/api/links/[linkId]/route.ts` (each becomes adapter calls only)
- Modify: `src/lib/db.ts` — move the missing-`MONGODB_URI` check from module load into `connectDB()`, so a demo deployment with no connection string can still load route files and answer 403

**Interfaces:**
- Consumes: `Store`, `Collection`, `ConflictError`, `CollectionName` (Task 2); `RouteDef`, `Method`, `ApiResult` (Task 3); `dispatch`-style error mapping and `serverGuard` (Task 3); `linksRoutes` (Task 4).
- Produces:
  - `all-routes.ts`: `export const allRoutes: RouteDef[] = [...linksRoutes]` — later plans append their module's routes here.
  - `mongo-store.ts`: `export const mongoStore: Store`. Maps `linkGroups → LinkGroup`, `links → Link` models. Reads use `.lean()`; every returned document is passed through `JSON.parse(JSON.stringify(doc))` so ids and dates are strings. `updateById` uses `findByIdAndUpdate(id, update, { new: true, runValidators: true })`. `batchUpdate` maps to `Model.bulkWrite` with `updateOne` operations. A Mongo error with `code === 11000` is rethrown as `ConflictError`.
  - `serve.ts`: `export function serve(method: Method, path: string): (request: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>`. Looks up the `RouteDef` in `allRoutes` by exact `method` + `path` and throws at module load if there is none. Per request: return the `serverGuard(process.env.NEXT_PUBLIC_DEMO === "1")` result if any, before connecting; `await connectDB()`; parse the JSON body for non-GET/DELETE (empty or invalid body → `undefined`); run the handler with `mongoStore`; map `ConflictError` → 409 and other throws → logged 500, with the same bodies as `dispatch`; respond with `NextResponse.json(result.body, { status: result.status })`.

Route files look like:

```ts
import { serve } from "@/lib/data/serve";

export const GET = serve("GET", "/api/links/:linkId");
export const PUT = serve("PUT", "/api/links/:linkId");
export const DELETE = serve("DELETE", "/api/links/:linkId");
```

- [ ] **Step 1: Create the scratch database.** Find the live database name (the URI in `.env` has none, so Mongoose uses `test`; confirm with `mongodump --uri="mongodb://localhost:27017/" --archive=/dev/null 2>&1 | grep "dumping"`). Copy it:

```bash
mongodump --uri="mongodb://localhost:27017/" --db=test --archive | mongorestore --uri="mongodb://localhost:27017/" --archive --nsFrom='test.*' --nsTo='tracker_scratch.*' --drop
```

Create `.env.scratch` containing `MONGODB_URI=mongodb://localhost:27017/tracker_scratch` and confirm it is gitignored. All manual checks in this plan run the dev server with that URI on a second port: `MONGODB_URI=mongodb://localhost:27017/tracker_scratch npx next dev -p 3031`.

- [ ] **Step 2: Record the "before" responses** from the scratch server running the current code:

```bash
curl -s localhost:3031/api/link-groups > /tmp/before-groups.json
```

- [ ] **Step 3: Implement `all-routes.ts`, `mongo-store.ts`, `serve.ts`**, then replace the four route files with adapter calls.
- [ ] **Step 4: Verify My data mode is unchanged** against the scratch server:
  - `curl -s localhost:3031/api/link-groups | diff - /tmp/before-groups.json` → no differences.
  - In the browser at `localhost:3031/links`: create a group, rename it, add a link, edit it, delete the link, delete the group. Each works and the sidebar group list updates.
  - `curl -s -o /dev/null -w "%{http_code}" localhost:3031/api/links/abc` → `404`.
  - `NEXT_PUBLIC_DEMO=1 MONGODB_URI=mongodb://localhost:27017/tracker_scratch npx next dev -p 3032`, then `curl -s -w " %{http_code}" localhost:3032/api/link-groups` → `{"error":"The demo does not use a server database"} 403`.
- [ ] **Step 5: Run** `npm test`, `npx tsc --noEmit`, `npx eslint src/lib/data src/app/api/links src/app/api/link-groups` — expect clean.
- [ ] **Step 6: Commit** `feat(links): serve Links routes through the store adapter`

---

### Task 6: Data source mode and request helper

**Files:**
- Create: `src/lib/data/mode.ts`, `src/lib/data/local.ts`
- Modify: `src/hooks/request.ts`, `src/hooks/links/use-link-groups.ts`, `src/hooks/links/use-links.ts`
- Test: `src/lib/data/mode.test.ts`

**Interfaces:**
- Consumes: `allRoutes` (Task 5), `dispatch` (Task 3), `BrowserStore`, `StorageLike` (Task 2).
- Produces, in `mode.ts`:
  - `type DataSource = "server" | "browser"`
  - `const IS_DEMO: boolean` — `process.env.NEXT_PUBLIC_DEMO === "1"`
  - `const DATA_SOURCE_KEY = "ts:data-source"`
  - `resolveDataSource(isDemo: boolean, saved: string | null): DataSource` — pure: demo → `"browser"`; otherwise `"browser"` only when `saved === "browser"`.
  - `getDataSource(): DataSource` — `resolveDataSource(IS_DEMO, <localStorage value, or null when window is undefined or storage throws>)`
  - `setDataSource(source: DataSource): void` — saves and calls `window.location.reload()`; a no-op in the demo.
  - `useDataSource(): DataSource` — `useSyncExternalStore`, server snapshot `resolveDataSource(IS_DEMO, null)`.
- Produces, in `local.ts`:
  - `getBrowserStore(): BrowserStore` — lazily created singleton over `window.localStorage`; on first creation adds a `storage` event listener that calls `invalidate()` for a changed `ts:data:<collection>` key.
  - `localRequest<T>(method: string, url: string, body?: unknown): Promise<T>` — `dispatch(allRoutes, getBrowserStore(), ...)`; resolves with `result.body` for a 2xx status, otherwise throws `Error(body.error ?? "Request failed: <status>")`.
- Changes `request.ts`: `fetcher(url)` and `send(url, method, body)` call `localRequest` when `getDataSource() === "browser"`, and keep today's `fetch` behavior otherwise. Signatures unchanged.
- Changes the two Links hook files: drop their private `fetcher` and raw `fetch` calls; use `fetcher` / `send` from `@/hooks/request`. Exported function names and return shapes stay the same.

- [ ] **Step 1: Write the failing test** for the pure part:

```ts
test("resolveDataSource: the demo is always browser; otherwise the saved choice, defaulting to server", () => {
  assert.equal(resolveDataSource(true, null), "browser");
  assert.equal(resolveDataSource(true, "server"), "browser");
  assert.equal(resolveDataSource(false, null), "server");
  assert.equal(resolveDataSource(false, "browser"), "browser");
  assert.equal(resolveDataSource(false, "garbage"), "server");
});
```

- [ ] **Step 2: Run** `npm test` — expect failure.
- [ ] **Step 3: Implement `mode.ts`, `local.ts`, and the `request.ts` / Links hooks changes.**
- [ ] **Step 4: Verify in the browser** on the scratch server (`localhost:3031`):
  - Default: Links works as before, and the Network panel shows `/api/link-groups` requests.
  - Run `localStorage.setItem("ts:data-source", "browser")` in the console and reload: `/links` shows no groups; creating a group and a link works and survives a reload; the Network panel shows no `/api/` requests; `localStorage.getItem("ts:data:linkGroups")` holds the group.
  - Unconverted modules are not checked here: their hooks still call `fetch` themselves until their own plan converts them, and the gate added in Task 7 is what keeps those pages from running in browser mode.
  - Open a second tab on `/links`, add a group in the first, reload the second: the group is there.
  - `localStorage.removeItem("ts:data-source")` and reload: the Mongo groups are back, untouched.
- [ ] **Step 5: Run** `npm test`, `npx tsc --noEmit`, `npx eslint src/hooks src/lib/data` — expect clean.
- [ ] **Step 6: Commit** `feat(data): route hook requests to browser storage in browser mode`

---

### Task 7: Switch control, module availability, sample data

**Files:**
- Create: `src/components/data-source-switch.tsx`, `src/components/module-gate.tsx`, `src/lib/demo/links.ts`, `src/lib/demo/index.ts`
- Modify: `src/lib/modules.ts` (add `browserData: boolean` to `ModuleConfig`; `true` for `links` only), `src/components/app-header.tsx`, `src/components/app-sidebar.tsx`, `src/app/(app)/page.tsx`, `src/app/(app)/layout.tsx`
- Test: `src/lib/demo/demo.test.ts`

**Interfaces:**
- Consumes: `useDataSource`, `setDataSource`, `IS_DEMO` (Task 6); `getBrowserStore` (Task 6); `Store` (Task 2); `modules` (`src/lib/modules.ts`).
- Produces:
  - `modules.ts`: `availableModules(source: DataSource): ModuleConfig[]` — all modules for `"server"`, only `browserData` ones for `"browser"`.
  - `demo/links.ts`: `linksSample(): { groups: { name: string; icon: string; links: { name: string; url: string }[] }[] }` — 3 groups, 3–5 links each, obviously generic public sites (documentation, news, tools). No personal or private hosts.
  - `demo/index.ts`:
    - `loadSampleData(store: Store): Promise<void>` — clears the sample's collections, then inserts groups with `order` 0..n and `slug` from the name, and their links with `order` 0..n.
    - `SEEDED_KEY = "ts:data:seeded"`
    - `ensureDemoSeed(store: Store, storage: StorageLike): Promise<boolean>` — when the key is unset, loads the sample, sets the key, and returns `true`; otherwise returns `false`.
  - `DataSourceSwitch` — a dropdown (`@/components/ui/dropdown-menu`) in the header, left of the theme toggle:
    - Trigger: a `Database` icon button; in browser mode it also shows a `Badge` reading **Browser data**.
    - Items in the owner's build: **My data** and **Browser data** (the active one checked), a separator, then **Load sample data** and **Reset browser data**, both disabled unless in browser mode.
    - Items in the demo: a disabled label **Demo: data is stored in this browser**, then **Load sample data** and **Reset browser data**.
    - Load and Reset each ask via `window.confirm` (`"Replace browser data with the sample set?"`, `"Delete all browser data?"`), then act on `getBrowserStore()` and reload the page. Reset calls `clear()` and removes `SEEDED_KEY`; after the reload the demo reseeds itself, while the owner's build stays empty.
  - `ModuleGate({ children })` — client component used in `src/app/(app)/layout.tsx` around `{children}`. Finds the module whose `basePath` prefixes the pathname; in browser mode, if that module is not `browserData`, renders the existing `EmptyState` (`src/components/empty-state.tsx`) with title **Not available in browser data mode** and description **This module only works with My data for now.** In the demo it also runs `ensureDemoSeed` once on mount and reloads if it returned `true`.
- Sidebar and dashboard use `availableModules(useDataSource())` instead of `modules`.

- [ ] **Step 1: Write the failing tests**

```ts
test("loadSampleData fills groups and links, and running it twice does not duplicate", async () => {
  const store = new BrowserStore(memoryStorage());
  await loadSampleData(store);
  await loadSampleData(store);
  const groups = await store.collection<LinkGroup>("linkGroups").find({}, { sort: { order: 1 } });
  const links = await store.collection<LinkItem>("links").find();
  const sample = linksSample();
  assert.equal(groups.length, sample.groups.length);
  assert.equal(links.length, sample.groups.reduce((n, g) => n + g.links.length, 0));
  assert.deepEqual(groups.map((g) => g.order), groups.map((_, i) => i));
  assert.ok(links.every((l) => groups.some((g) => g._id === l.groupId)));
  assert.ok(links.every((l) => l.url.startsWith("https://")));
});

test("ensureDemoSeed seeds once", async () => {
  const storage = memoryStorage();
  const store = new BrowserStore(storage);
  assert.equal(await ensureDemoSeed(store, storage), true);
  assert.equal(await ensureDemoSeed(store, storage), false);
  await store.collection<LinkGroup>("linkGroups").deleteMany({});
  assert.equal(await ensureDemoSeed(store, storage), false);
});

test("availableModules hides modules without browser data in browser mode", () => {
  assert.deepEqual(availableModules("browser").map((m) => m.id), ["links"]);
  assert.equal(availableModules("server").length, modules.length);
});
```

- [ ] **Step 2: Run** `npm test` — expect failures.
- [ ] **Step 3: Implement** the sample data, the `modules.ts` changes, the two components, and wire them into header, sidebar, dashboard and layout.
- [ ] **Step 4: Verify in the browser** on the scratch server:
  - Owner's build (`localhost:3031`): the switch shows **My data** checked. Choosing **Browser data** reloads; the badge appears; the sidebar and dashboard show only Links; `/finance` shows the "Not available" state. **Load sample data** fills three groups; **Reset browser data** empties them. Switching back to **My data** restores every module and the Mongo data.
  - Demo build (`localhost:3032`, started with `NEXT_PUBLIC_DEMO=1` and **no** `MONGODB_URI`; move `.env` aside while it runs): first visit shows the sample groups without any action; the switch shows the demo label and cannot change source; adding a link works; **Reset browser data** returns to the sample set; the Network panel shows no `/api/` requests; `curl localhost:3032/api/link-groups` → 403.
  - Dark and light themes, and a 375px-wide viewport: the header control fits and nothing scrolls sideways.
- [ ] **Step 5: Run** `npm test`, `npx tsc --noEmit`, `npx eslint src/components src/lib "src/app/(app)"` — expect no new errors (six older lint errors in unrelated files remain).
- [ ] **Step 6: Commit** `feat(data): add data source switch, sample data and demo lock for Links`

---

### Task 8: Production build check and docs

**Files:**
- Modify: `CLAUDE.md` (gitignored; still update it), `eslint.config.mjs` only if needed

- [ ] **Step 1: Stop any dev servers, then build the demo** with no connection string: move `.env` aside so Next does not load it, then run `env -u MONGODB_URI NEXT_PUBLIC_DEMO=1 npm run build`. Expect success. Restore `.env` afterwards.
- [ ] **Step 2: Confirm no database code reached the browser bundle:** `grep -rl "mongoose" .next/static | wc -l` → `0`.
- [ ] **Step 3: Build normally:** `npm run build` → success.
- [ ] **Step 4: Update `CLAUDE.md`**: add a "Data sources" section describing `src/lib/data/` (store, handlers, `serve`, `allRoutes`), the rule that route files only call `serve`, the demo flag, the scratch database for testing, and that converting a module means: handlers + routes in `src/lib/<module>/api/`, add to `allRoutes`, add collections to `COLLECTIONS` and `mongo-store.ts`, move hooks to `@/hooks/request`, set `browserData: true`, add sample data.
- [ ] **Step 5: Commit** `chore(data): verify demo build and document data sources`
