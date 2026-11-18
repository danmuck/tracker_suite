# Browser Data Mode: Projects Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Make the Projects module (projects, kanban tasks, scratchpad) run on both data sources, with My data behaving as it does today, then fix three plain defects.

**Architecture:** Same as Links, Future and Finance: route logic moves to store-agnostic handlers in `src/lib/projects/api/` (`handlers.ts`, `routes.ts`); each `route.ts` becomes `serve(method, path)`; hooks move to `fetcher`/`send` in `src/hooks/request.ts`. A golden transcript recorded from today's code over HTTP on MongoDB is replayed in-process on the browser store and over HTTP on the converted code.

**Tech Stack:** Next.js 16, TypeScript, Mongoose 9, SWR, Zod, `node --test`. Reference implementations to copy patterns from: `src/lib/future/api/` (simple module) and `src/lib/finance/api/` + `scripts/finance-parity/` (parity tooling, `docs.ts` shaping, `test-helpers.ts`).

**Spec:** `docs/superpowers/specs/2026-11-16-browser-data-mode-design.md`.

## Global Constraints

- Handlers must not import `mongoose`, `next/server` or `src/lib/db.ts`. Projects imports nothing from other modules.
- Documents cross the store as plain JSON: ids as 24-hex strings, dates as ISO strings. Handlers produce complete documents themselves (schema defaults: project `status: "active"`, `color: "#3b82f6"`; task `status: "todo"`, `priority: "medium"`, `order: 0`, `tags: []`; scratchpad `content: ""`), and trim what the Mongoose schemas trim (`name`, `description`, `repositoryUrl`, `title`, each tag).
- No aggregation pipelines: task counts are a `find` plus grouping in the handler. Store operators only as listed in `src/lib/data/query.ts` (it throws on others).
- The clock comes from `ctx.now`.
- My data mode must answer exactly as today except the intended differences below. Existing behaviour that looks wrong is reproduced and pinned with a `current behavior:` test unless Task 4 names it.
- Intended differences in My data mode (same as the other converted modules): a malformed id in a path answers the route's 404 instead of 500; a malformed `projectId` in a query or body answers what the route answers today where reproducible, else 400 (say which); unparseable JSON answers 400; hooks throw `RequestError` on a non-OK response instead of handing the error body to the page; server log lines lose their route prefix; the demo build answers 403.
  - An uppercase hex id in a path answers 404 (ids are recognised in lowercase only, as in Finance and Future); in a query or body it is lowercased, as Mongoose does.
- Never touch the live database `test` or port 3030. Parity servers only on `tracker_parity`, ports 3031–3036, `NEXT_DIST_DIR=.next-parity`; stop what you start; `git checkout tsconfig.json` if the dev server rewrote it.
- Sample data is fictional. Nothing copies MongoDB data into the browser.
- One commit per task, files staged by name, never push.

## Review Focus

- Kanban order after reorder, in both stores: `updateMany` with `$inc` and range filters must shift the same tasks; ties in `order` must list in the same order in both stores (MongoDB sorts `{ status: 1, order: 1 }` with no tie-breaker: pin a deterministic one only if it cannot change today's results, and say so).
- `projectId` stored as ObjectId in MongoDB vs string in the browser: filters, `$in` for counts, the unique scratchpad index, cascade delete.
- `dueDate`: `""`, absent, a date-only string and an ISO string must store and return the same in both stores as Mongoose does today.
- Scratchpad created on first read; two overlapping first reads.
- Pages that read an error body as data today (hooks used `fetch(...).then(r => r.json())`): each call site must handle a thrown error and `undefined` data.

---

### Task 1: Golden transcript from today's code

**Files:** `scripts/projects-parity/{scenario.ts,run.ts,reset-db.mjs,golden/transcript.json}` (reuse `scripts/finance-parity/normalize.ts` where it is generic; move shared pieces to `scripts/parity/` only if that needs no change to the Finance tooling's behaviour).

- [ ] Scenario of 45–70 steps over every route and branch: project list with and without `?status=`, task counts (none, some done), create/update/delete project incl. validation failures, empty `repositoryUrl`, cascade delete (tasks and scratchpad gone, another project's untouched); tasks list (missing `projectId` 400, unknown project), create in each column (auto `order`), update (incl. status change, `dueDate` set / `""` / absent, tags with spaces), delete (order gap left), reorder within a column up and down, across columns, to an order past the end, to the same place; scratchpad first read (created), update, upsert on a project with none, 50,001 characters (400); unknown ids (404) and malformed ids (record today's status; mark as an allowed difference per Global Constraints).
- [ ] `capture` against the UNCHANGED routes on a fresh `tracker_parity`; a second `check` run on a fresh database matches (proves the scenario is deterministic). Normalization: ids to aliases by first appearance, instants that are "now" to `<instant>`, `__v` dropped.
- [ ] Commit `test(projects): parity scenario and golden transcript from the unconverted routes`.

### Task 2: Handlers, store, routes

**Files:** Create `src/lib/projects/api/{handlers.ts,routes.ts,handlers.test.ts,parity.test.ts}`; modify `src/lib/data/store.ts` (`COLLECTIONS`: `projects`, `tasks` (no unique), `scratchpads` (unique `projectId`)), `src/lib/data/mongo-store.ts`, `src/lib/data/all-routes.ts`, the six `route.ts` files under `src/app/api/projects/**` and `src/app/api/tasks/**` (→ `serve`), `eslint.config.mjs` (`CONVERTED_MODULES`).

**Interfaces — Produces:** routes `GET/POST /api/projects`, `GET/PUT/DELETE /api/projects/:projectId`, `GET/PUT /api/projects/:projectId/scratchpad`, `GET/POST /api/tasks`, `PUT/DELETE /api/tasks/:taskId`, `PATCH /api/tasks/:taskId/reorder`, with today's bodies and statuses.

- [ ] Handler tests first (browser store), one per route branch, plus the Review Focus cases; `current behavior:` tests for anything reproduced that looks wrong, listed in the report.
- [ ] `parity.test.ts` replays the scenario in-process at the golden's clock and must match the golden (allowed differences compared exactly once the golden is re-recorded in the last step).
- [ ] Convert the route files; `run.ts check` over HTTP on MongoDB against the Task 1 golden: only the allowed differences. Then re-record the golden from the converted code and require an exact match in-process and on a second fresh MongoDB check.
- [ ] `npm test` (guards: browser-safe imports, routes match files), tsc, eslint. Commit `feat(projects): store-agnostic handlers and serve() routes`.

### Task 3: Hooks, browser mode, sample data

**Files:** `src/hooks/projects/{use-projects,use-tasks,use-scratchpad}.ts`, `src/hooks/projects/no-direct-fetch.test.ts`, `src/lib/modules.ts` (`browserData: true`), `src/lib/demo/projects.ts`, `src/lib/demo/index.ts`, `src/lib/demo/demo.test.ts`, call sites under `src/app/(app)/projects/**`, `src/components/projects/**`, `src/components/dashboard/projects-card.tsx`.

- [ ] Hooks use `fetcher` / `send` only; a guard test like `src/hooks/finance/no-direct-fetch.test.ts`. No retry on `RequestError` (reuse or mirror `FINANCE_SWR` without importing from Finance: a shared option belongs in `src/hooks/`).
- [ ] Every call site handles a thrown error and missing data (list each in the report with what the page shows).
- [ ] Sample data: 3 fictional projects (one completed, one archived), 12–18 tasks across all columns with relative due dates, priorities and tags, one scratchpad with content. Loaded and reset with the other modules' sample data; `demo.test.ts` covers it.
- [ ] Browser check on a scratch server (`NEXT_DIST_DIR`, port 3033, `MONGODB_URI=…/tracker_parity`): in My data mode create a project, add/move/delete tasks, edit the scratchpad; switch to Browser data, load sample data, repeat; confirm zero `/api/projects` or `/api/tasks` requests in browser mode and that the home dashboard's Projects card shows in both modes. Report what was clicked and seen.
- [ ] Commit `feat(projects): hooks on the request helper, sample data, available in browser data mode`.

### Task 4: Three defects

Each: flip or add the test first, re-record the golden, explain every changed step.

- [ ] `POST /api/tasks` with a well-formed `projectId` that matches no project creates an orphan task today → 404 `{ error: "Project not found" }`, nothing written. `GET /api/tasks?projectId=<unknown>` keeps answering `[]`.
- [ ] `PUT /api/projects/:id` cannot clear `repositoryUrl` (the empty string is dropped from the update, so the old URL stays) → an empty `repositoryUrl` unsets the field. Check `description` and a task's `description` / `dueDate` for the same defect and fix the same way if present (say which).
- [ ] Scratchpad first read: two overlapping first `GET`s can both insert; the second fails on the unique index with 500 → treat `ConflictError` as "already created" and return the existing one.
- [ ] Commit `fix(projects): unknown project on task create, clearing a repository URL, concurrent first scratchpad read`.
- [ ] In the report, list every other `current behavior:` item left as is (e.g. order gaps after delete, `PUT` changing status without renumbering), one line each.
