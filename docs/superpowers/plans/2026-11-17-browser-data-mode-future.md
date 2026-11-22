# Browser Data Mode: Future Module — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Future module (apartment listings, tours, settings) work in both My data and Browser data modes through one copy of its route logic.

**Architecture:** Same pattern as Links (plan 1): route logic moves into plain handlers over the `Store` interface in `src/lib/future/api/`; the five Future route files become `serve()` calls; three collections are added to the store registry and the Mongo store; sample data is added; the module is switched on for browser mode.

**Tech Stack:** Next.js 16 App Router, TypeScript, Mongoose 9, Zod 4, `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-16-browser-data-mode-design.md`

**Scope:** Plan 2 of 5. Projects, Figure and Finance follow.

## Global Constraints

- Code reachable from the browser must not import `mongoose`, `next/server` or `src/lib/db.ts`. Only `src/lib/data/mongo-store.ts`, `src/lib/data/serve.ts`, `src/lib/api-helpers.ts` and `route.ts` files may. `src/lib/future/api/*` is browser-reachable.
- Modules never import each other. `src/lib/future/**` may import `@/lib/data/*`, `@/lib/future/*`, `@/types/future/*` only. Future imports nothing from Finance.
- Documents cross the `Store` boundary as plain JSON: `_id` a 24-hex string, dates ISO strings. Future's `availableDate` / tour `date` are `yyyy-MM-dd` strings and `time` is `HH:mm`.
- The query evaluator throws on dotted keys and unsupported operators; use only `$gt $gte $lt $lte $ne $in $exists $regex/$options`, top-level `$or`, and updates `$set $unset $inc $setOnInsert`.
- My data mode must behave as it does today, apart from malformed ids returning 404.
- Never hand-test against the live database (`test`). Use `tracker_scratch` on a second port: `NEXT_DIST_DIR=.next-scratch MONGODB_URI=mongodb://localhost:27017/tracker_scratch npx next dev -p 3031`. Never send requests to port 3030.
- No new dependencies. Sample data is hand-written and obviously fictional.
- Tests: `npm test`. Commit after each task with the message given; stage files by name.

## Review Focus

1. **City filter is case-insensitive and exact** (`?city=boston` matches "Boston" but not "Boston Heights"), and a city containing regex characters (e.g. `St. Paul (West)`) is matched literally. → Task 1.
2. **Deleting a listing removes its tours**, in both stores. → Task 1.
3. **A tour for a listing that no longer exists, or with a malformed `listingId`**, is refused with 400 `"That listing no longer exists"`, on create and on update. → Task 1.
4. **Settings are a single record**: the first PUT creates it, later PUTs update the same one, and a field left out of the body is cleared. → Task 1.
5. **Tours with no time sort before tours with a time on the same date**, the same in both stores. → Task 1 (browser) and Task 2 (Mongo check).

---

### Task 1: Future handlers and routes

**Files:**
- Modify: `src/lib/data/api.ts` — add pure `setAndUnset` and `escapeRegex` (bodies copied from `src/lib/api-helpers.ts`)
- Modify: `src/lib/api-helpers.ts` — re-export `setAndUnset` and `escapeRegex` from `@/lib/data/api` instead of defining them (other modules' routes still import them from here)
- Modify: `src/lib/data/store.ts` — add to `COLLECTIONS`: `listings: { unique: [] }`, `tours: { unique: [] }`, `futureSettings: { unique: ["key"] }`
- Modify: `src/lib/data/mongo-store.ts` — add to `MODELS`: `listings → Listing`, `tours → Tour`, `futureSettings → FutureSettings` (from `src/models/future/`)
- Modify: `src/lib/data/all-routes.ts` — append `...futureRoutes`
- Create: `src/lib/future/api/handlers.ts`, `src/lib/future/api/routes.ts`
- Test: `src/lib/future/api/handlers.test.ts`, and add `setAndUnset` / `escapeRegex` cases to `src/lib/data/dispatch.test.ts`

**Interfaces:**
- Consumes: `Handler`, `RouteDef`, `ok`, `fail`, `notFound`, `invalid`, `isId` (`src/lib/data/api.ts`); `Store`, `Collection`, `BaseDoc` (`src/lib/data/store.ts`); `dispatch` (`src/lib/data/dispatch.ts`); `BrowserStore`, `memoryStorage` for tests.
- Produces:
  - `setAndUnset<T extends Record<string, unknown>>(data: T, optionalKeys: readonly string[]): { $set: Record<string, unknown>; $unset?: Record<string, 1> }` and `escapeRegex(s: string): string` in `src/lib/data/api.ts`.
  - `export const SETTINGS_KEY = "default"` in `handlers.ts` (the model keeps its own copy; handlers must not import the model).
  - `export const futureRoutes: RouteDef[]`, covering exactly:

| Method | Path | Behavior (carried over from the current route file) |
|---|---|---|
| GET | `/api/future/listings` | optional `?city=` (trimmed, exact, case-insensitive) and `?status=` (ignored unless one of `LISTING_STATUSES`); sort `{ rent: 1, createdAt: -1 }`; limit 1000 |
| POST | `/api/future/listings` | `listingSchema`; 201 |
| PUT | `/api/future/listings/:listingId` | malformed id → 404 `"Listing not found"`; `listingSchema`; update with `setAndUnset(data, LISTING_OPTIONAL_FIELDS)`; missing → 404 |
| PATCH | `/api/future/listings/:listingId` | `listingStatusSchema`; `$set: { status }` only |
| DELETE | `/api/future/listings/:listingId` | deletes the listing, then its tours; body `{ message: "Listing deleted" }` |
| GET | `/api/future/tours` | sort `{ date: 1, time: 1 }`; limit 1000 |
| POST | `/api/future/tours` | `tourSchema`; listing must exist else 400 `"That listing no longer exists"`; 201 |
| PUT | `/api/future/tours/:tourId` | malformed id → 404 `"Tour not found"`; `tourSchema`; listing check as above; `setAndUnset(data, ["time", "notes"])`; missing → 404 |
| DELETE | `/api/future/tours/:tourId` | body `{ message: "Tour deleted" }` |
| GET | `/api/future/settings` | body `{ annualSalary, commuteDestination }` from the record with `key: SETTINGS_KEY` (both undefined when there is none) |
| PUT | `/api/future/settings` | `settingsSchema`; `updateOne({ key: SETTINGS_KEY }, setAndUnset(data, ["annualSalary", "commuteDestination"]), { upsert: true })`; same body shape |

The city filter is `{ city: { $regex: "^" + escapeRegex(city) + "$", $options: "i" } }` (a string pattern, not a `RegExp` object, so both stores accept it). Document types: `Listing` and `Tour` from `src/types/future/apartments.ts`; for settings, `FutureSettings & BaseDoc & { key: string }`.

- [ ] **Step 1: Write the failing tests.** Helper: `const call = (method, url, body?) => dispatch(futureRoutes, store, method, url, body)` with a fresh `BrowserStore(memoryStorage())` per test; `const listing = (over = {}) => ({ name: "Elm St 2B", city: "Boston", rent: 210000, ...over })`.

```ts
test("listings: defaults, sort by rent, city and status filters", async () => {
  const a = (await call("POST", "/api/future/listings", listing())).body as Listing;
  assert.deepEqual([a.status, a.amenities], ["saved", []]);
  await call("POST", "/api/future/listings", listing({ name: "Cheap", rent: 150000, city: "boston", status: "toured" }));
  await call("POST", "/api/future/listings", listing({ name: "Heights", city: "Boston Heights" }));
  await call("POST", "/api/future/listings", listing({ name: "Odd", city: "St. Paul (West)" }));
  const names = async (qs: string) => ((await call("GET", `/api/future/listings${qs}`)).body as Listing[]).map((l) => l.name);
  assert.deepEqual((await names("")).slice(0, 1), ["Cheap"]);
  assert.deepEqual(await names("?city=BOSTON"), ["Cheap", "Elm St 2B"]);
  assert.deepEqual(await names("?city=St.%20Paul%20(West)"), ["Odd"]);
  assert.deepEqual(await names("?city=St%20Paul%20(West)"), []);
  assert.deepEqual(await names("?status=toured"), ["Cheap"]);
  assert.equal((await names("?status=bogus")).length, 4);
});

test("listings: PUT clears omitted optional fields, PATCH changes status only", async () => {
  const a = (await call("POST", "/api/future/listings", listing({ beds: 2, notes: "nice", rating: 4 }))).body as Listing;
  const put = (await call("PUT", `/api/future/listings/${a._id}`, listing({ beds: 3 }))).body as Listing;
  assert.deepEqual([put.beds, "notes" in put, "rating" in put], [3, false, false]);
  const patched = (await call("PATCH", `/api/future/listings/${a._id}`, { status: "applied" })).body as Listing;
  assert.deepEqual([patched.status, patched.beds, patched.name], ["applied", 3, "Elm St 2B"]);
  assert.equal((await call("PATCH", `/api/future/listings/${a._id}`, { status: "nope" })).status, 400);
});

test("deleting a listing removes its tours", async () => {
  const a = (await call("POST", "/api/future/listings", listing())).body as Listing;
  const b = (await call("POST", "/api/future/listings", listing({ name: "Other" }))).body as Listing;
  await call("POST", "/api/future/tours", { listingId: a._id, date: "2026-12-01" });
  await call("POST", "/api/future/tours", { listingId: b._id, date: "2026-12-02" });
  assert.deepEqual(await call("DELETE", `/api/future/listings/${a._id}`), { status: 200, body: { message: "Listing deleted" } });
  assert.deepEqual(((await call("GET", "/api/future/tours")).body as Tour[]).map((t) => t.listingId), [b._id]);
});

test("tours: listing must exist, sorted by date then time with untimed first, PUT clears time", async () => {
  const a = (await call("POST", "/api/future/listings", listing())).body as Listing;
  for (const listingId of ["abc", "a".repeat(24)]) {
    assert.deepEqual(await call("POST", "/api/future/tours", { listingId, date: "2026-12-01" }), { status: 400, body: { error: "That listing no longer exists" } });
  }
  const late = (await call("POST", "/api/future/tours", { listingId: a._id, date: "2026-12-05", time: "14:30" })).body as Tour;
  await call("POST", "/api/future/tours", { listingId: a._id, date: "2026-12-05" });
  await call("POST", "/api/future/tours", { listingId: a._id, date: "2026-12-01", time: "09:00" });
  const order = ((await call("GET", "/api/future/tours")).body as Tour[]).map((t) => [t.date, t.time]);
  assert.deepEqual(order, [["2026-12-01", "09:00"], ["2026-12-05", undefined], ["2026-12-05", "14:30"]]);
  const put = (await call("PUT", `/api/future/tours/${late._id}`, { listingId: a._id, date: "2026-12-06" })).body as Tour;
  assert.deepEqual([put.date, "time" in put], ["2026-12-06", false]);
  assert.equal((await call("PUT", `/api/future/tours/${late._id}`, { listingId: "a".repeat(24), date: "2026-12-06" })).status, 400);
});

test("settings: one record, created on first PUT, omitted fields cleared", async () => {
  assert.deepEqual((await call("GET", "/api/future/settings")).body, { annualSalary: undefined, commuteDestination: undefined });
  await call("PUT", "/api/future/settings", { annualSalary: 9000000, commuteDestination: "Downtown" });
  const second = await call("PUT", "/api/future/settings", { annualSalary: 9500000 });
  assert.deepEqual(second, { status: 200, body: { annualSalary: 9500000, commuteDestination: undefined } });
  assert.equal(await store.collection("futureSettings").count(), 1);
});

test("validation is 400; unknown and malformed ids are 404", async () => {
  assert.equal((await call("POST", "/api/future/listings", listing({ rent: 0 }))).status, 400);
  assert.equal((await call("POST", "/api/future/tours", { listingId: "x", date: "12/01/2026" })).status, 400);
  for (const id of ["abc", "a".repeat(24)]) {
    assert.deepEqual(await call("PUT", `/api/future/listings/${id}`, listing()), { status: 404, body: { error: "Listing not found" } });
    assert.deepEqual(await call("DELETE", `/api/future/listings/${id}`), { status: 404, body: { error: "Listing not found" } });
    assert.deepEqual(await call("DELETE", `/api/future/tours/${id}`), { status: 404, body: { error: "Tour not found" } });
  }
});
```

In `src/lib/data/dispatch.test.ts`:

```ts
test("setAndUnset sets provided fields and unsets omitted optional ones; escapeRegex escapes", () => {
  assert.deepEqual(setAndUnset({ a: 1, b: "", c: undefined }, ["b", "c", "d"]), { $set: { a: 1 }, $unset: { b: 1, c: 1, d: 1 } });
  assert.deepEqual(setAndUnset({ a: 1 }, []), { $set: { a: 1 } });
  assert.equal(escapeRegex("St. Paul (West)"), "St\\. Paul \\(West\\)");
});
```

- [ ] **Step 2: Run** `npm test` — expect the new tests to fail.
- [ ] **Step 3: Implement** the helpers, registry entries, Mongo model mapping, handlers, `futureRoutes`, and `allRoutes` entry.
- [ ] **Step 4: Run** `npm test`, `npx tsc --noEmit`, `npx eslint src/lib/future src/lib/data src/lib/api-helpers.ts` — expect passing, no errors.
- [ ] **Step 5: Commit** `feat(future): move route logic into store-backed handlers`

---

### Task 2: Future routes on the adapter

**Files:**
- Modify: `src/app/api/future/listings/route.ts`, `src/app/api/future/listings/[listingId]/route.ts`, `src/app/api/future/tours/route.ts`, `src/app/api/future/tours/[tourId]/route.ts`, `src/app/api/future/settings/route.ts` — each becomes `serve()` calls only, e.g. `export const GET = serve("GET", "/api/future/listings");`

**Interfaces:**
- Consumes: `serve(method, path)` from `src/lib/data/serve.ts`; `futureRoutes` registered in `allRoutes` (Task 1).
- Produces: nothing new. Hooks in `src/hooks/future/` already use `@/hooks/request` and need no change.

- [ ] **Step 1: Capture "before" responses** on the scratch server running the code as of Task 1 (route files not yet changed): save `GET /api/future/listings`, `GET /api/future/tours`, `GET /api/future/settings` as JSON files in the task's workspace directory.
- [ ] **Step 2: Replace the five route files** with adapter calls.
- [ ] **Step 3: Verify My data mode on the scratch server** (port 3031), recording commands and output:
  - The three GETs match the "before" files as parsed JSON.
  - Create a listing with optional fields → 201; `GET ?city=<its city in different case>` returns it; PUT without the optional fields → they are gone; PATCH status → only status changes.
  - Create two tours on the same date for it, one with a time and one without → `GET /api/future/tours` lists the untimed one first.
  - `POST /api/future/tours` with `listingId` of 24 `a`s → 400 `"That listing no longer exists"`.
  - `PUT /api/future/settings` twice (second omitting a field) → the field is cleared; afterwards restore the settings to their "before" values with a final PUT.
  - `DELETE` the listing → 200, and its tours are gone from `GET /api/future/tours`.
  - `GET`/`PUT`/`DELETE` with id `abc` → 404.
  - Leave `tracker_scratch` with the same listings, tours and settings it had before.
- [ ] **Step 4: Run** `npm test`, `npx tsc --noEmit`, `npx eslint src/app/api/future` — expect clean.
- [ ] **Step 5: Commit** `feat(future): serve Future routes through the store adapter`

---

### Task 3: Sample data and browser mode

**Files:**
- Create: `src/lib/demo/future.ts`
- Modify: `src/lib/demo/index.ts` (load Future sample data too), `src/lib/modules.ts` (`browserData: true` for `future`), `src/lib/demo/demo.test.ts`

**Interfaces:**
- Consumes: `Store` (`src/lib/data/store.ts`); `Listing`, `Tour`, `ListingFormData` types (`src/types/future/apartments.ts`); `toDay` is NOT imported from `src/lib/future/format.ts` — compute `yyyy-MM-dd` strings locally with `date-fns` `format`/`addDays`.
- Produces:
  - `futureSample(today: Date): { settings: { annualSalary: number; commuteDestination: string }; listings: (ListingFormData & { tours: { daysFromToday: number; time?: string; notes?: string }[] })[] }` — 6 listings across 3 fictional-but-plausible cities, rents between $1,400 and $3,200 (in cents), a spread of statuses including one `rejected` and one `toured`, some with `sqft`/`beds`/`rating`/`commuteMinutes`/`amenities`, `availableDate` values 2–8 weeks after `today`; 3 tours in total: one in the past (negative `daysFromToday`) and two upcoming, at least one with a time. Addresses, names and contacts must be obviously made up (e.g. "12 Example St"); no real phone numbers or emails (use `555-01xx` numbers and `@example.com`).
  - `loadSampleData(store: Store, today: Date = new Date()): Promise<void>` — still loads Links, and now also clears `tours`, `listings`, `futureSettings` and inserts the Future sample: settings as one record with `key: "default"`, listings, then each listing's tours with `date` = `today + daysFromToday` as `yyyy-MM-dd`.
- `availableModules("browser")` now returns `future` and `links`.

- [ ] **Step 1: Update and add tests** in `src/lib/demo/demo.test.ts`:

```ts
test("loadSampleData fills the Future module relative to today, and twice does not duplicate", async () => {
  const store = new BrowserStore(memoryStorage());
  const today = new Date(2026, 10, 17);
  await loadSampleData(store, today);
  await loadSampleData(store, today);
  const listings = await store.collection<Listing>("listings").find();
  const tours = await store.collection<Tour>("tours").find({}, { sort: { date: 1 } });
  const sample = futureSample(today);
  assert.equal(listings.length, sample.listings.length);
  assert.equal(tours.length, sample.listings.reduce((n, l) => n + l.tours.length, 0));
  assert.ok(tours.every((t) => listings.some((l) => l._id === t.listingId)));
  assert.ok(tours[0].date < "2026-11-17" && tours[tours.length - 1].date > "2026-11-17");
  assert.ok(listings.every((l) => l.rent >= 140000 && l.rent <= 320000));
  assert.ok(listings.some((l) => l.status === "rejected") && listings.some((l) => l.status === "toured"));
  assert.equal(await store.collection("futureSettings").count(), 1);
  assert.ok(new Set(listings.map((l) => l.city)).size === 3);
});

test("sample listings pass the module's own validation", () => {
  for (const { tours, ...data } of futureSample(new Date(2026, 10, 17)).listings) {
    assert.equal(listingSchema.safeParse(data).success, true, data.name);
    assert.ok(Array.isArray(tours));
  }
});
```

and change the existing `availableModules` assertion to `["future", "links"]`.

- [ ] **Step 2: Run** `npm test` — expect failures.
- [ ] **Step 3: Implement** the sample file, the loader change and the `browserData` flag.
- [ ] **Step 4: Run** `npm test`, `npx tsc --noEmit`, `npx eslint src/lib/demo src/lib/modules.ts` — expect clean. Start the scratch server and confirm `/future/apartments` and `/` return 200 with no compile errors in the log.
- [ ] **Step 5: Commit** `feat(future): sample data and browser data mode for the Future module`
