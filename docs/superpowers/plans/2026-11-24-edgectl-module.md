# edgectl Module — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A working GUI for a locally running edgectl lab: Mirage status, Ghosts, Seeds, intents, reports, and running a command.

**Architecture:** Pages call Tracker Suite's own `/api/edgectl/**` routes. Those are plain route handlers that call Mirage's `api/v1` through a server-only client holding the operator certificate. Nothing is stored in MongoDB or browser storage.

**Tech Stack:** Next.js 16 App Router, TypeScript, `node:https`, Zod 4, SWR, shadcn/ui, `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-24-edgectl-module-design.md`. Contract: `docs/architecture/definitions/api_v1.toml` in the edgectl repo.

## Global Constraints

- Do not edit anything in the edgectl repo.
- The browser never calls Mirage. Only `src/lib/edgectl/server/**` and `src/app/api/edgectl/**` may import `node:https`, `node:fs` or `next/server`.
- UI words: Mirage, Ghost, Seed, `issue`, `report`. No invented terms.
- Hooks use `fetcher` / `send` from `src/hooks/request.ts` and `NO_RETRY_ON_STATUS`; no direct `fetch`.
- The module is not added to `CONVERTED_MODULES`, `allRoutes` or `COLLECTIONS`, and does not use `serve()`.
- No new dependencies. Never hand-test against the live database; use the scratch server on port 3031.
- Do not commit unless the user says so.

## Review Focus

1. The operator certificate and key are read from disk per request and never appear in a response or log. → Task 2.
2. "Not configured" and "unreachable" are distinct, clear states on every page. → Tasks 2, 3, 6.
3. Spawn and attach are never retried automatically. → Tasks 5, 6.
4. base64 output is never rendered as text. → Tasks 1, 6.
5. An id from the address bar cannot change the Mirage path. → Tasks 1, 2.

---

### Task 1: Types, validators, pure helpers

**Files:** create `src/types/edgectl/api.ts`, `src/lib/edgectl/validators.ts`, `issue.ts`, `output.ts`, `paths.ts`, `format.ts`, and `validators.test.ts`, `issue.test.ts`, `output.test.ts`, `paths.test.ts`.

- [ ] Interfaces for every shape in `[shapes]` of the contract, plus `ConnectionState` and `IntentSummary`.
- [ ] Zod schemas for the same shapes (`null` lists and maps read as empty) and for the `issue`, attach and spawn request bodies; `pathId` for ids that go into a path.
- [ ] `runnableCommands(catalog)`, `buildIssue({ghostId, command, values, now?, suffix?})`, `reconcileUntilSettled(reconcile, {max, wait})`.
- [ ] `outputView(seedResult)`: text, or binary with byte counts.
- [ ] Tests first for each; `npm test`.

### Task 2: Server client

**Files:** create `src/lib/edgectl/server/client.ts`, `client.test.ts`, `src/lib/edgectl/server/test-certs.ts` (test helper that generates a throwaway CA, server and client certificate with `openssl`).

- [ ] `readConfig(env)`, `MirageError`, `mirageRequest`.
- [ ] Tests against a stub HTTPS server that requires a client certificate: success unwraps `data`; an error envelope keeps `code`, `message`, `retryable` and the HTTP status; no certificate configured → `not_configured`; missing file → `not_configured`; nothing listening → `unreachable`; a certificate the server does not trust → `unreachable`; non-JSON body → `bad_response`; certificate files are re-read on each request; request body and `X-Request-Id` are sent.

### Task 3: API routes

**Files:** create `src/lib/edgectl/server/respond.ts` and the ten `route.ts` files under `src/app/api/edgectl/` listed in the spec.

- [ ] Each route validates input with Zod (400 on failure) and forwards through `mirageRequest`.
- [ ] `status` answers 200 with a `ConnectionState`. `intents` GET builds summaries from snapshots, eight at a time.

### Task 4: Registration and guards

**Files:** modify `src/lib/modules.ts`, `src/app/globals.css`, `eslint.config.mjs`, `src/components/app-header.tsx`, `src/lib/data/browser-safe-imports.test.ts`, `CLAUDE.md`.

- [ ] Module entry (`browserData: false`; nav Overview, Ghosts, Seeds, Intents, Activity), `--module-edgectl`, `edgectl: ["edgectl"]` in `MODULE_API_DIRS`, breadcrumb label.
- [ ] Guard: any `src/lib/<module>/server/` folder is forbidden to browser-reachable code (test and ESLint pattern).

### Task 5: Hooks

**Files:** create `src/hooks/edgectl/use-mirage.ts`, `use-ghosts.ts`, `use-seeds.ts`, `use-intents.ts`, `use-reports.ts`, `use-execution.ts`, `no-direct-fetch.test.ts`.

- [ ] 5 s refresh for status, intents, reports; 15 s for Ghosts and Seeds. Mutations are plain `send` calls, no retry.

### Task 6: Pages, dialogs, dashboard card

**Files:** create `src/components/edgectl/*` (`mirage-gate`, `state-badge`, `reports-table`, `command-output`, `run-command-dialog`, `ghost-dialogs`), `src/app/(app)/edgectl/layout.tsx` (the gate), pages `src/app/(app)/edgectl/{page,ghosts/page,seeds/page,intents/page,intent/page,activity/page}.tsx`, `src/components/dashboard/edgectl-card.tsx`; modify `src/components/dashboard/index.ts`.

- [ ] Every page inside `MirageGate`; empty states for every list.

### Task 7: Verify

- [ ] `npm test`, `npm run lint`, `npm run build`, `npm run build:static`.
- [ ] Browser pass against a lab, as listed in the spec's Verification section, including stopping the lab.

## Operator parity (2026-11-25)

Design: "Operator parity (2026-11-25)" in the spec. Nothing is committed until the user says so.

1. Types and validators for the amendment's shapes (`routes`, `services`, deploy, dependency
   proposal, Ghost status/events/verification, activity), `targetName`, `seedIds`. Tests.
2. Server: `client.ts` second identity; `edgecert.ts` (config, `execFile`, the five commands);
   `approvals.ts` (prepared payloads, expiry); `local-ghost.ts` (which Ghost is local). Tests with
   a stub tool, never the real keys.
3. Routes under `src/app/api/edgectl/`: `capabilities`, `routing`, `services`, `reconcile`,
   `ghosts/deploy-targets`, `ghosts/deploy`, `ghosts/spawn-local` (now issues the certificate
   first), `ghosts/[ghostId]/{status,events,verification}`, `activity`,
   `dependencies/proposals` (GET, POST), `dependencies/intent` (preview),
   `dependencies/proposals/[proposalId]` (GET), `.../approval` (prepare), `.../approve`, `.../execute`.
4. Hooks: `use-capabilities`, `use-routing`, `use-deploy`, `use-ghost-console`, `use-activity`,
   `use-proposals`.
5. UI: Routing page; Ghost page; Ghosts page (Add, Deploy, links); Intents "Reconcile all";
   Dependencies list and detail with propose, approve (digest confirmation) and execute (its own
   confirmation) dialogs; Activity tabs. Nav: Routing, Dependencies.
6. `npm test`, `npm run lint`, `npm run build`, `npm run build:static` (module still absent).
7. Browser check against a lab that has the new routes: everything except execute.
