# Browser Data Mode — Design

Date: 2026-11-16 · Status: draft for approval

## Intent

Let Tracker Suite run against two data sources:

- **My data**: MongoDB through the API routes, as today.
- **Browser data**: everything stored in the visitor's own browser, nothing sent to a server.

The owner wants to host the site publicly as a prototype without exposing their own data or running a public database. A hosted **demo build** is locked to browser data. The owner's own build gets a switch between the two, plus a way to preload browser data with sample data.

## Goals

- One implementation of each feature's logic. A change to a route's behavior applies to both data sources without being written twice.
- The demo build cannot reach a database: no connection string, and API routes refuse every request.
- In the owner's build, a header switch flips between My data and Browser data without a rebuild.
- Browser data can be filled with a realistic sample set and reset, for every converted module.
- Converting modules one at a time; each converted module is usable in browser mode on its own.
- The existing app behaves the same in My data mode after each module is converted.

## Non-goals

- Syncing or copying between MongoDB and browser data, in either direction.
- Login, accounts, or per-visitor data on the server.
- Sharing browser data across devices or browsers.
- Replacing MongoDB or Mongoose for the owner's data.

## Anti-goals

- Any path by which the demo build, or browser mode, reads or writes the owner's MongoDB.
- Real personal data in the sample set. It is hand-written and committed to the repo.
- Two diverging copies of route logic.

## Constraints

- Next.js 16 App Router, client pages with SWR hooks calling `/api/...`. 41 route files, 17 Mongoose models, 5 modules.
- Modules do not import each other (ESLint `no-restricted-imports`); only the dashboard reads across modules. New shared code must sit outside the module folders.
- Tests are `node --test` over pure `src/**/*.test.ts`; there are no route tests today.
- Code that can run in the browser must not import `mongoose`, `next/server`, or `src/lib/db.ts`.
- Hooks are inconsistent today: Figure and Future use `src/hooks/request.ts` (`fetcher`, `send`); Finance, Projects and Links define their own fetchers and call `fetch` directly.

## Approaches

1. **Shared logic, two storage backends** (chosen by the owner). Route logic moves into plain functions that talk to a small storage interface. The server runs them against MongoDB; browser mode runs the same functions against browser storage. One copy of the logic; the cost is refactoring all 41 routes, module by module.
2. **Separate browser implementation.** Leave the routes alone and write a browser-only twin of each. Faster first demo and no risk to the working app, but every later feature is built twice and the twins drift. Rejected for that reason.
3. **Per-visitor data in a shared database** (cookie id + owner field on every record). One copy of the logic, but a public write endpoint, a leak if any query misses the filter, and abuse/cleanup concerns. Rejected: it is what the owner is trying to avoid.

## Design

### Pieces

```
page → hook → request helper ─┬─ My data:      fetch /api/...  → route adapter → handler(MongoStore)
                              └─ Browser data: local router    →                 handler(BrowserStore)
```

**Handlers.** Each API operation becomes a plain async function: it receives the store plus the request's path params, query and JSON body, and returns `{ status, body }`. Validation (the existing Zod schemas), not-found checks and all business logic live here. Handlers import no Mongoose and no Next.js server code. They live per module, e.g. `src/lib/<module>/api/`.

**Store interface.** A small collection-style interface covering what the routes use today:

- read: find by id, find one, find many (filter, sort, skip, limit, field selection), count, exists, distinct
- write: insert one/many, update by id, update one/many, upsert, delete by id, delete many
- filters: equality, `$gt/$gte/$lt/$lte`, `$ne`, `$in`, `$or`, `$exists`, case-insensitive `$regex`, and matching a value inside an array field
- updates: `$set`, `$unset`, `$inc`, `$setOnInsert`

Documents go in and come out as plain JSON, the same shape the API returns today: ids as 24-character hex strings, dates as ISO strings. The three aggregation pipelines (link counts, task counts, exercise history) are rewritten as a find plus grouping in the handler. The six `bulkWrite` calls become sequences of single updates.

**MongoStore.** Implements the interface by delegating to the existing Mongoose models, so casting, schema validation and indexes keep working for the owner's data. Server only.

**BrowserStore.** Implements the interface over collections held in memory and persisted to browser storage. It includes a small filter/update evaluator for the operators listed above (in-house, tested; no new dependency), generates 24-hex ids, and stamps `createdAt`/`updatedAt`.

**Route adapter.** Each `route.ts` shrinks to a call to one shared wrapper that: refuses with 403 when the demo flag is set; connects to MongoDB; runs the handler with MongoStore; turns `{ status, body }` into a response; logs and returns 500 on a thrown error.

**Local router.** A table mapping method + URL pattern to handler, built from the same registrations the route adapters use. In browser mode the request helper calls it instead of `fetch`, and it returns or throws exactly as the network path does, so hooks and pages do not know which source they are on.

**Request helper.** `src/hooks/request.ts` becomes the only place hooks reach data. All hooks move onto `fetcher`/`send`.

### Data source switch

- Source is `server` or `browser`. The demo flag (`NEXT_PUBLIC_DEMO=1`, build-time) forces `browser`. Otherwise it is the owner's saved choice in localStorage, default `server`.
- Header control next to the theme toggle. In the owner's build it switches source and reloads data. A persistent badge shows when browser data is active.
- In the demo build the control cannot switch; it shows that the demo keeps data in this browser.
- The same control offers **Load sample data** and **Reset browser data** while in browser mode. Both ask for confirmation.
- A module not yet converted is hidden from the sidebar and dashboard while in browser mode. A direct visit to one of its pages shows a "not available in browser data mode" state.

### Sample data

- Hand-written, in the repo, one file per module under a shared `src/lib/demo/` folder.
- Dates are generated relative to today, so the dashboard, projections and weekly charts look current whenever it is loaded.
- The demo build loads it automatically on a visitor's first visit. The owner's build loads it only on request.
- The finance seed (the Cash account) runs against whichever store is active.

### Defaults and validation

Handlers must produce complete documents themselves: defaults that today come only from Mongoose schemas (for example `order: 0`, project `status: "active"`, `currency: "USD"`) move into the Zod validators or the handler, so both stores receive the same document. Mongoose schemas stay as a second check for the owner's data.

### Demo lock

Three independent layers, any one of which is sufficient:

1. The demo deployment has no `MONGODB_URI`.
2. The route adapter returns 403 for every request when the demo flag is set, before connecting.
3. The request helper never calls `fetch` for data in browser mode.

### Order of work

1. Foundation: store interface, BrowserStore with evaluator and tests, MongoStore, route adapter, local router, request helper, switch control, demo flag.
2. Links (smallest; proves the whole path including sample data and the demo lock).
3. Future, then Projects, then Figure.
4. Finance last: largest routes, plus `post-payments.ts`, `apply-profile.ts` and `payment-plan.ts`, which import models directly today and must take the store instead.

After each module: My data mode behaves as before, browser mode works for that module, and handler tests pass.

**The public demo ships only after all five modules are converted** (owner's decision). Until then browser mode is used by the owner alone, so the hidden-module and "not available" states need to work but not to be polished, and the sample set only has to cover converted modules as they land.

### Testing

- BrowserStore evaluator: unit tests per operator.
- Handlers: `node --test` against BrowserStore. This gives route logic its first automated tests.
- MongoStore: checked by hand in the running app per module (no Mongo in the test run).
- Demo lock: a test that the adapter refuses when the flag is set, and a manual check of a demo build with no connection string.

## Calls made by the designer (not decided by the owner)

- Browser storage is localStorage-backed, one key per collection, loaded into memory at startup. Simple and synchronous; the 5 MB limit is ample for a prototype. IndexedDB is the fallback if a module outgrows it.
- No new dependency for the query evaluator.
- Switching source reloads the page rather than patching SWR caches in place.
- In the demo build the switch is shown but inert, with reset and reload-sample actions available.
- Unconverted modules are hidden in browser mode rather than shown broken.
- Nothing copies the owner's Mongo data into the browser.

## Left to the builder

- Exact names, file layout and TypeScript signatures for the store, handlers and adapter.
- How URL patterns are registered so the route files and the local router share one list.
- Whether sort/skip/limit are options on find or a chained builder.
- How date fields are compared in the BrowserStore (ISO strings sort correctly; mixed inputs need normalizing), and confirming the projection engine accepts ISO-string dates everywhere it is fed lean documents today.
- The contents of the sample set, within "realistic, obviously fictional, relative dates".
- Wording and placement details of the switch, badge and unavailable-module state.
