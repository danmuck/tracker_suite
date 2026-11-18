# Browser Data Mode: Figure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Make the Figure module (workouts, workout logs, runs, exercise stats, recipes, shopping list) run on both data sources, with My data behaving as it does today, then fix the named defects. Figure is the last module: after it, every module works in browser data mode.

**Architecture:** Same as Links, Future, Finance and Projects: route logic moves to store-agnostic handlers in `src/lib/figure/api/` (`handlers.ts`, `routes.ts`); each `route.ts` becomes `serve(method, path)`. A golden transcript recorded from today's code over HTTP on MongoDB is replayed in-process on the browser store and over HTTP on the converted code. Figure's hooks already use `fetcher` / `send`.

**Tech Stack:** Next.js 16, TypeScript, Mongoose 9, SWR, Zod 4, date-fns, `node --test`. Reference implementations to copy patterns from: `src/lib/projects/api/` + `scripts/projects-parity/` (most recent, same shape), `src/lib/future/api/`.

**Spec:** `docs/superpowers/specs/2026-11-16-browser-data-mode-design.md`.

## Global Constraints

- Handlers must not import `mongoose`, `next/server` or `src/lib/db.ts`. Figure imports nothing from other modules.
- Documents cross the store as plain JSON: ids as 24-hex strings, dates as ISO strings (`date` fields in Figure are already `yyyy-MM-dd` strings). Handlers produce complete documents themselves: schema defaults (workout `exercises: []`, `order`; log `exercises: []`, set `done: false`; run `type: "easy"`; recipe `ingredients: []`, `instructions: ""`, `tags: []`; shopping item `checked: false`, `order`), and what the Mongoose schemas trim that Zod does not (`notes` on workouts, workout exercises, logs and runs). Sub-documents carry no `_id`.
- No aggregation pipelines: exercise history is a `find` plus filtering and grouping in the handler. Store operators only as listed in `src/lib/data/query.ts` (it throws on others). The browser store throws on a dotted path that crosses an array (`"exercises.name"`), in filters and in `distinct`: match exercise names in the handler, in JavaScript, in both stores.
- The clock comes from `ctx.now` (the `today` fallback in `/api/figure/stats`).
- My data mode must answer exactly as today except the intended differences below. Existing behaviour that looks wrong is reproduced and pinned with a `current behavior:` test unless Task 4 names it.
- Intended differences in My data mode (same as the other converted modules): unparseable JSON answers 400 instead of 500; server log lines lose their route prefix; the demo build answers 403. (Figure's routes already answer 404 for a malformed path id.) An uppercase hex id in a path answers 404 (ids are recognised in lowercase only); in a body (`workoutId`) it is lowercased, as Mongoose does.
- Never touch the live database `test` or port 3030. Parity servers only on `tracker_parity`, ports 3031–3036, `NEXT_DIST_DIR=.next-parity`, explicit `MONGODB_URI`; stop what you start; `git checkout tsconfig.json` if the dev server rewrote it; delete `.next-parity`.
- Sample data is fictional, with no "(sample)" or "Example" markers. Nothing copies MongoDB data into the browser.
- One commit per task, files staged by name, never push.

## Review Focus

- Exercise name matching in JavaScript must equal today's MongoDB regex matching: case-insensitive, whole name, `progress` allowing surrounding whitespace, regex metacharacters in a name (`"Curl (EZ bar)"`, `"1.5 rep"`) taken literally.
- Exercise history: the newest 200 matching logs (`date` desc, `createdAt` desc) are the window; `before` and `excludeLogId`; an excluded log still counts toward the 200; the first hit per lowercased name wins. Two logs on the same day with the same `createdAt` cannot be told apart by MongoDB either: pin `_id` as the last tie-breaker only if it cannot change a result today's code gives deterministically, and say so.
- `GET /api/figure/exercises/names`: which spelling wins when the same name is stored in two casings depends today on `distinct` order (index order for logs, natural order for workouts). Reproduce it where MongoDB's order is defined; where it is not, pick a deterministic rule and say which.
- Ids stored as ObjectId in MongoDB and strings in the browser: `workoutId` on logs (kept only when well-formed, unset on update otherwise), `recipeId` on shopping items and the `_id: { $in }` lookup for `recipeName`, a `recipeId` whose recipe was deleted.
- Add-to-list merging in both stores: case-insensitive name and unit, "no unit" meaning missing, `""` or `null`, only unchecked items, quantity summed (and left alone when the ingredient has none), two ingredients in one recipe that merge into each other, `order` continuing after the last item. Which item is merged into when two match (today: `findOne` with no sort).
- Sort ties: shopping list `{ checked: 1, order: 1 }`, workouts `{ order: 1, createdAt: 1 }`, recipes `{ name: 1 }` (MongoDB compares names by byte, so `"apple"` sorts after `"Zucchini"`) must list the same in both stores.

---

### Task 1: Golden transcript from today's code

**Files:** Create `scripts/figure-parity/{scenario.ts,run.ts,reset-db.mjs,golden/transcript.json}`, modelled on `scripts/projects-parity/` (reuse its `normalize.ts` by import where generic; do not change the Projects or Finance tooling's behaviour).

- [ ] Scenario of 70–100 steps over all 29 route handlers under `src/app/api/figure/**` and every branch: workouts (list order, create with auto `order`, get, update incl. omitting `notes` and `targetWeight`, delete, validation failures); workout logs (create with a valid, unknown, malformed and absent `workoutId`; list by `date`, by range, with `limit` incl. 0, 500 and junk, with a malformed date; get; update dropping `workoutId` and `notes`; delete); runs (create incl. default `type`, list with range and `limit`, update with and without `notes`, delete, distance 0 → 400); exercise `names` (same name in two casings, in a workout and in a log), `progress` (no name, name with surrounding spaces and different case, name with regex metacharacters, `startDate`), `history` (no names, several names, `before`, `excludeLogId`, duplicate names in the query); `stats` with a fixed `today` (weeks 1, 12, 500, junk) over logs and runs dated relative to that fixed day; recipes (create, `?tag=`, update with and without `servings`, delete); shopping items (create, list order with checked and unchecked, partial update of `checked` alone and of `name` alone on a checked item, delete, `clear-checked` with some and none); `add-to-list` (new items, merge by name and unit in different case, merge with no unit, ingredient with no quantity, a checked item with the same name not merged, unknown recipe); `recipeName` in the list before and after its recipe is deleted; unknown ids (404), malformed ids (404), unparseable JSON (record today's status; an allowed difference).
- [ ] All dates in the scenario are fixed strings and every `stats` step passes `today`, so the transcript does not depend on the day it is recorded.
- [ ] `capture` against the UNCHANGED routes on a fresh `tracker_parity`; a second `check` run on a fresh database matches. Normalization as in Projects: ids to aliases by first appearance, "now" instants to `<instant>`, `__v` dropped.
- [ ] Commit `test(figure): parity scenario and golden transcript from the unconverted routes`.

### Task 2: Handlers, store, routes

**Files:** Create `src/lib/figure/api/{handlers.ts,routes.ts,handlers.test.ts,parity.test.ts}`; modify `src/lib/data/store.ts` (`COLLECTIONS`: `workouts`, `workoutLogs`, `runLogs`, `recipes`, `shoppingItems`, none unique), `src/lib/data/mongo-store.ts` (the five models in `src/models/figure/`), `src/lib/data/all-routes.ts`, the 16 `route.ts` files under `src/app/api/figure/**` (→ `serve`), `eslint.config.mjs` (`CONVERTED_MODULES` gains `figure`).

**Interfaces — Consumes:** `scripts/figure-parity/` from Task 1. **Produces:** `figureRoutes` in `src/lib/figure/api/routes.ts` covering `GET/POST /api/figure/workouts`, `GET/PUT/DELETE /api/figure/workouts/:workoutId`, `GET/POST /api/figure/workout-logs`, `GET/PUT/DELETE /api/figure/workout-logs/:logId`, `GET/POST /api/figure/runs`, `PUT/DELETE /api/figure/runs/:runId`, `GET/POST /api/figure/recipes`, `GET/PUT/DELETE /api/figure/recipes/:recipeId`, `POST /api/figure/recipes/:recipeId/add-to-list`, `GET/POST /api/figure/shopping-items`, `PUT/DELETE /api/figure/shopping-items/:itemId`, `POST /api/figure/shopping-items/clear-checked`, `GET /api/figure/exercises/{names,progress,history}`, `GET /api/figure/stats`, with today's bodies and statuses.

- [ ] Handler tests first (browser store), one per route branch, plus every Review Focus case; `current behavior:` tests for anything reproduced that looks wrong, listed in the report.
- [ ] `parity.test.ts` replays the scenario in-process at the golden's clock and must match the golden.
- [ ] Convert the route files; `run.ts check` over HTTP on MongoDB against the Task 1 golden: only the allowed differences. Then re-record the golden from the converted code and require an exact match in-process and on a second fresh MongoDB check.
- [ ] `npm test` (guards: browser-safe imports, routes match files), `npx tsc --noEmit`, `npm run lint` (three known errors in `category-badge.tsx`, `group-card.tsx`, `ui/sidebar.tsx` and nothing new). Commit `feat(figure): store-agnostic handlers and serve() routes`.

### Task 3: Sample data, browser mode, hooks

**Files:** `src/lib/modules.ts` (`browserData: true` for Figure), `src/lib/demo/figure.ts` (create), `src/lib/demo/index.ts`, `src/lib/demo/demo.test.ts`, `src/hooks/figure/*.ts`, `src/hooks/figure/no-direct-fetch.test.ts` (create, like `src/hooks/projects/no-direct-fetch.test.ts`), call sites under `src/app/(app)/figure/**`, `src/components/figure/**`, `src/components/dashboard/figure-card.tsx`.

- [ ] Hooks: `NO_RETRY_ON_STATUS` from `src/hooks/swr-options.ts` on every `useSWR`; the guard test. Every call site handles a thrown `RequestError` and missing data (list each in the report with what the page shows); an error state shows only when there is no data to show.
- [ ] Sample data, dates relative to today: 3 workout definitions; about 30 workout logs over the last 12 weeks with a current streak and visible progress on at least two exercises; about 20 runs of mixed types; 5 recipes with tags and ingredients; 8–10 shopping items, some checked, some from a recipe. Loaded and reset with the other modules' sample data; `demo.test.ts` covers it (every document passes its Zod schema; the dashboard's Figure card numbers are non-zero).
- [ ] Browser check on a scratch server (`NEXT_DIST_DIR=.next-parity`, port 3033, `MONGODB_URI=mongodb://localhost:27017/tracker_parity`): in My data mode create a workout, log it, add a run, add a recipe to the shopping list, check an item off; switch to Browser data, load sample data, repeat; confirm zero `/api/figure` requests in browser mode, that Figure shows in the sidebar and on the home dashboard in both modes, and that no module is hidden in browser mode any more. Report what was clicked and seen. Leave no browser data behind on that origin beyond the sample set.
- [ ] Commit `feat(figure): sample data, available in browser data mode`.

### Task 4: Defects

Each: flip or add the test first, re-record the golden, explain every changed step. For each item first show whether it reproduces (the golden from Task 1 says); if it does not, say so and change nothing.

- [ ] `PUT /api/figure/shopping-items/:itemId` validates with `shoppingItemSchema.partial()`, and in Zod 4 the `checked` default still applies, so renaming a checked item unchecks it → a field absent from the body is left unchanged.
- [ ] Optional text that cannot be cleared: `PUT` on a workout or workout log without `notes` keeps the old notes, and `PUT` on a shopping item cannot remove `quantity` or `unit` → follow the rule runs and recipes already use (the full-document `PUT`s unset an absent or empty `notes`; for the partial shopping-item `PUT`, `unit: ""` and `quantity: null` unset the field). Check what the forms send and make the two agree; say what each form sends.
- [ ] `add-to-list` runs one read and one write per ingredient and counts on nothing else writing in between; in the browser store it must run inside the request queue as one step (it does if it is a single handler: confirm with a test of two overlapping calls giving summed quantities, no duplicates).
- [ ] Commit `fix(figure): partial shopping-item update, clearing optional fields, overlapping add-to-list`.
- [ ] In the report, list every other `current behavior:` item left as is, one line each.
