# Auth Stage 1: Ownership Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every stored record can carry an owner, one wrapper enforces it, and the tools exist to create the first admin and hand today's data to them. The running app does not change yet.

**Architecture:** `scopedStore(store, ownerId)` wraps the existing `Store` interface: it adds `ownerId` to every filter, stamps it on every insert and strips it from every result, so handlers stay unchanged. Schemas gain an optional `ownerId` and per-owner indexes. `serve()` is switched to the wrapper in stage 2, not here.

**Tech Stack:** TypeScript, Next.js 16, Mongoose 9, `node --test`, `@node-rs/argon2` (new dependency; Node 24.1 here has no built-in Argon2).

**Spec:** `docs/superpowers/specs/2026-11-28-auth-design.md` (sections A, B "Passwords", "Recovery", "First admin", and Stages 1).

## Global Constraints

- Work lands on `dev`. The working tree has the owner's uncommitted edits in `src/components/finance/calendar/day-sheet.tsx`, `src/hooks/finance/use-transactions.ts` and `tsconfig.json`: never stage, change or revert them. Stage files by exact path.
- Code under `src/lib/data/**` and `src/lib/*/api/**` is browser-reachable: no `mongoose`, `next/server`, `@/lib/db`, `@/models/**`, or `@/lib/<x>/server/**` imports.
- Server-only auth code goes in `src/lib/auth/server/`. Mongoose model names start with `Auth` (finance owns `Account`).
- `ownerId` is a string (the user's 24-hex id), optional on every schema in this stage.
- Handler output must not change: `ownerId` never appears in a record returned through `scopedStore`. The three parity replays must pass unchanged.
- Never touch the live database (`test`). Scripts take the database name on the command line and refuse when the connection's name differs. Hand-testing uses `tracker_scratch` on port 3031; the isolation runner uses `tracker_isolation` only.
- No password, recovery code or hash is ever printed to a log; `create-admin` prints recovery codes once to the terminal and nothing else secret.
- Every `.test.ts` contains a `test(` call (`no-empty-tests`). Run tests with `npm test`, lint with `npm run lint`.

## Review Focus

1. A filter that hides `ownerId` inside `$or` / `$and`, or names it in `distinct` or `select`: must throw, not leak. (Task 1)
2. `findById` / `updateById` / `deleteById` given another owner's id, or a string that is not an id: must answer `null` and change nothing. (Task 1)
3. A record stored before this stage (no `ownerId`): invisible through any scoped store, so nobody sees unclaimed data. (Task 1)
4. Two owners using the same slug, category name, settings key: both succeed; the same owner twice still conflicts. (Tasks 1, 2, 7)
5. Many parallel first requests for one new owner: exactly one Cash account and one finance profile. (Tasks 3, 7)

---

### Task 1: Scoped store

**Files:**
- Create: `src/lib/data/scoped-store.ts`, `src/lib/data/scoped-store.test.ts`
- Modify: `src/lib/data/browser-store.ts` (`checkUnique` only)

**Interfaces:**
- Produces: `scopedStore(store: Store, ownerId: string): Store` and `OWNER_FIELD = "ownerId"`.

- [ ] **Step 1: Write failing tests** in `scoped-store.test.ts`, over `new BrowserStore(memoryStorage())` (helper in `@/lib/data/test-helpers`), with `a = scopedStore(raw, A)`, `b = scopedStore(raw, B)` where `A`, `B` are two 24-hex strings, on collection `links` unless noted:
  - `insert` through `a`: returned record has no `ownerId`; `raw.collection("links").findOne({})` has `ownerId === A`.
  - `find`, `findOne`, `count`, `exists`, `distinct("name")` through `b` see nothing of A's; through `a` they see it. Results never contain `ownerId`, including with `select: ["name"]`.
  - `findById(idOfA)` through `b` is `null`; `updateById` and `deleteById` through `b` return `null` and the raw record is deep-equal to before. `findById("nope")` is `null`.
  - `updateById(id, …, { timestamps: false })` through `a` leaves `updatedAt` unchanged (the option is passed on).
  - `updateMany({}, {$set:{name:"x"}})` and `deleteMany({})` through `b` return `0` and leave A's record; `batchUpdate([{filter:{_id:idOfA}, update:{$set:{name:"x"}}}])` through `b` changes nothing.
  - `updateOne({name:"n"}, {$set:{url:"u"}}, {upsert:true})` through `b` when A has `name:"n"`: creates a second raw record with `ownerId === B`; A's is untouched.
  - A raw record inserted without `ownerId` is not returned by any read through `a`.
  - Each of these throws `Error("ownerId is managed by the store")`: a filter `{ownerId: B}`; `{$or:[{ownerId: B}]}`; `{$and:[{x:1},{$or:[{ownerId:B}]}]}`; `insert({…, ownerId: B})`; an update with `ownerId` in `$set`, `$unset`, `$setOnInsert` or `$inc`; `distinct("ownerId")`; `select: ["ownerId"]`; `sort: {ownerId: 1}`.
  - Uniqueness on `linkGroups`: `a` and `b` each insert `slug:"x"` successfully; `a` inserting `slug:"x"` again rejects with `ConflictError`.
  - Unscoped `BrowserStore` behaviour is unchanged: two inserts of `slug:"x"` with no owner conflict.

- [ ] **Step 2: Run** `npm test` and see these fail (module not found).

- [ ] **Step 3: Implement `scoped-store.ts`.** Pure file, header comment in the style of `store.ts`.
  - Filter rule: `{ ...filter, ownerId }` after a recursive check that no key at any depth of the filter (through arrays and plain objects) is `ownerId`.
  - `findById(id)`: `isId(id)` (from `./api`) else `null`, then inner `findOne({ _id: id, ownerId })`.
  - `updateById` / `deleteById`: `isId`, then inner `exists({ _id: id, ownerId })`, then the inner by-id call with the same arguments.
  - Upsert: scoped filter, plus `ownerId` merged into `$setOnInsert`.
  - Strip `ownerId` from every returned record and array of records.

- [ ] **Step 4: Change `BrowserStore.checkUnique`** so a clash counts only when `other.ownerId === doc.ownerId` (both `undefined` in browser data mode, so behaviour there is unchanged). Update its comment.

- [ ] **Step 5: Run** `npm test`. Expected: all pass, including the existing browser-store tests and the three `parity.test.ts`.

- [ ] **Step 6: Commit** `feat(data): scoped store that confines every query to one owner`.

### Task 2: `ownerId` and per-owner indexes on the 17 schemas

**Files:**
- Modify: every model under `src/models/{links,future,finance,projects,figure}/`
- Create: `src/models/owner-indexes.test.ts`

**Interfaces:**
- Produces: field `ownerId: { type: String }` on all 17 schemas; indexes as listed.

- [ ] **Step 1: Write the failing test.** It imports the 17 models (no connection, as `mongo-store.test.ts` does) and asserts for each `model.schema`:
  - `schema.path("ownerId")` exists, is a String path, and is not required.
  - every entry of `schema.indexes()` has `ownerId` as its first key.
  - at least one index exists (so lookups by owner are indexed).
  - no path other than through `schema.indexes()` declares `unique` (`schema.path(p).options.unique` is falsy for all paths).
  - exact unique indexes: `LinkGroup {ownerId:1, slug:1}`, `Category {ownerId:1, name:1}`, `FutureSettings {ownerId:1, key:1}`, `Scratchpad {ownerId:1, projectId:1}`, `FinanceProfile {ownerId:1}`, and `Account {ownerId:1}` with `partialFilterExpression: { isCash: true }`.

- [ ] **Step 2: Run** `npm test`; see it fail.

- [ ] **Step 3: Edit the schemas.** Add the field. Remove `unique: true` from `slug`, `name`, `key`, `projectId` and declare the compound unique indexes above. Prefix every existing `Schema.index({...})` with `ownerId: 1` (keep the other keys and directions). Models with no index get `Schema.index({ ownerId: 1 })`; `Account` gets a plain `{ ownerId: 1, type: 1 }` beside its partial unique one. Add `ownerId?: string` to each `I…` interface. Do not touch `src/types/**`.

- [ ] **Step 4: Run** `npm test` and `npm run lint`. Expected: pass.

- [ ] **Step 5: Commit** `feat(models): optional ownerId and per-owner indexes on every collection`.

### Task 3: Cash account and finance profile survive parallel first requests

**Files:**
- Modify: `src/lib/finance/api/docs.ts` (`ensureCashAccount`), `src/lib/finance/api/profile.ts` (`saveProfileAndApply`, the `updateOne({}, …, {upsert:true})` line)
- Test: add to the existing test file beside each (create `docs.test.ts` / `profile.test.ts` there if absent)

**Interfaces:**
- Consumes: `ConflictError` from `@/lib/data/store`.

- [ ] **Step 1: Write failing tests** using a `Store` stub that wraps a `BrowserStore` and overrides one method on `accounts` / `financeProfile`:
  - `ensureCashAccount`: `exists` answers `false`, `insert` throws `new ConflictError("accounts", "ownerId")` → the promise resolves. Any other error from `insert` still rejects.
  - profile save: `updateOne` throws `ConflictError` on the first call and succeeds on the second → `saveProfileAndApply` resolves and `updateOne` was called twice. Throwing twice rejects with the `ConflictError`.
  - two different store objects over the same storage calling `ensureCashAccount` one after the other leave exactly one Cash account.

- [ ] **Step 2: Run** `npm test`; see them fail.

- [ ] **Step 3: Implement.** In `ensureCashAccount`, catch `ConflictError` around the insert and return. Keep the `WeakMap`; extend its comment to say the database index is the guarantee across store objects. In `saveProfileAndApply`, retry the upsert once on `ConflictError`.

- [ ] **Step 4: Run** `npm test` (finance parity replay included). Expected: pass.

- [ ] **Step 5: Commit** `fix(finance): one Cash account and one profile per owner under parallel requests`.

### Task 4: Isolation across every module's routes

**Files:**
- Create: `src/lib/data/isolation.test.ts`, `src/lib/data/test-support/isolation.ts`

**Interfaces:**
- Consumes: `scopedStore`, `allRoutes`, `dispatch`, `COLLECTIONS`.
- Produces: `seedOwner(store: Store): Promise<void>` and `probeAsStranger(store: Store, foreignIds: string[]): Promise<ApiResult[]>` in `test-support/isolation.ts`, reused by Task 7.

- [ ] **Step 1: Write `seedOwner`.** Through `dispatch(allRoutes, store, …)`, create at least two records in every one of the 17 collections (take payloads from each module's existing `handlers.test.ts` and demo data under `src/lib/demo/`). Include a link group named `Gaming`, the default finance categories, Future settings, and a finance profile, so unique fields are exercised. It asserts each call's status is 2xx.

- [ ] **Step 2: Write `probeAsStranger`.** For every route in `allRoutes`: if the path has no `:param`, call it once; otherwise call it once per foreign id with every param set to that id. Non-GET calls send `{}`. Returns all results.

- [ ] **Step 3: Write the tests** over one raw `BrowserStore`:
  - `seedOwner(scopedStore(raw, A))` then `seedOwner(scopedStore(raw, B))` both succeed (same slugs, names, keys).
  - a test that fails if any `CollectionName` has fewer than two raw records owned by A (keeps `seedOwner` honest when a collection is added).
  - snapshot every raw record owned by A; run `probeAsStranger(scopedStore(raw, B), allIdsOfA)`; then: A's snapshot is deep-equal to the raw records owned by A, and `JSON.stringify` of every probe result contains none of A's ids.
  - no raw record has an `ownerId` other than A or B, and none lacks one.

- [ ] **Step 4: Run** `npm test`. Expected: pass. If a probe shows a leak, the fix belongs in `scoped-store.ts`, not in a handler.

- [ ] **Step 5: Commit** `test(data): no route lets one owner read or change another's records`.

### Task 5: Password hashing, password rules, recovery codes, `AuthUser`

**Files:**
- Create: `src/lib/auth/password-rules.ts` (+ `.test.ts`), `src/lib/auth/server/password.ts` (+ `.test.ts`), `src/lib/auth/server/recovery-codes.ts` (+ `.test.ts`), `src/models/auth/AuthUser.ts`
- Modify: `package.json` (add `@node-rs/argon2`, latest stable; read its README for the option names before writing code)

**Interfaces:**
- Produces:
  - `passwordProblem(password: string, context?: { email?: string }): string | null` (pure, browser-safe). Rules: length 12 to 128 (counted in code points); refused if in `COMMON_PASSWORDS` (case-insensitive), if one character repeated, or if it contains the email's local part (when that is 4+ characters). No composition rules.
  - `hashPassword(password: string): Promise<string>`, `verifyPassword(hash: string, password: string): Promise<boolean>` (never throws: a malformed hash is `false`), `needsRehash(hash: string): boolean`, `DUMMY_HASH: Promise<string>` (a hash of a random value, computed once, for unknown accounts). Argon2id, memory 65536 KiB, time 3, parallelism 1, as named constants.
  - `generateRecoveryCodes(): { codes: string[]; hashes: string[] }`: 10 codes, each 16 characters of Crockford base32 from 80 random bits (`node:crypto`), shown as `XXXX-XXXX-XXXX-XXXX`. `hashRecoveryCode(input: string): string`: uppercases, drops everything outside the alphabet, maps `O→0`, `I/L→1`, then SHA-256 hex.
  - `AuthUser` model, collection `authusers`: `email` (required, lowercase, trim, unique), `name` (required, trim), `passwordHash` (required), `role` (`"admin" | "member"`, default `"member"`), `disabledAt` (Date), `passwordChangedAt` (Date), `recoveryCodes` (`[{ hash: String, usedAt: Date }]`, no `_id`), `appleSub` (String, unique, sparse), `secondStep` (Mixed, default undefined), timestamps. Same hot-reload block as `src/models/finance/Account.ts`.

- [ ] **Step 1: Write failing tests.**
  - rules: 11 characters refused, 12 accepted, 128 accepted, 129 refused; `"aaaaaaaaaaaa"` refused; a listed common password refused in any case; `"danny-likes-tea"` with email `danny@example.com` refused; a 12-character passphrase of unrelated words accepted; a 12-emoji password accepted (length by code points).
  - password: `verifyPassword(await hashPassword(p), p)` is true; a different password false; `verifyPassword("not-a-hash", p)` false; the hash starts with `$argon2id$` and contains `m=65536,t=3,p=1`; two hashes of one password differ; `needsRehash` is false for a fresh hash and true for an Argon2id hash with `m=19456`.
  - codes: 10 distinct codes matching `/^([0-9A-HJKMNP-TV-Z]{4}-){3}[0-9A-HJKMNP-TV-Z]{4}$/`; `hashRecoveryCode(code)` equals the stored hash for that code, also when typed lowercase, without dashes, with spaces, and with `O`/`I`/`L` in place of `0`/`1`; hashes are 64 hex characters.

- [ ] **Step 2: Run** `npm test`; see them fail.
- [ ] **Step 3: Install the dependency and implement** the three files and the model. `COMMON_PASSWORDS` is a hand-written set of well-known passwords of 12+ characters (at least 100 entries) in `password-rules.ts`.
- [ ] **Step 4: Run** `npm test` and `npm run lint` (`browser-safe-imports` must still pass: nothing browser-reachable imports `src/lib/auth/server/`).
- [ ] **Step 5: Commit** `feat(auth): password hashing, password rules, recovery codes and the user model`.

### Task 6: `create-admin` and `claim-data` scripts

**Files:**
- Create: `scripts/auth/target.ts` (+ `src/lib/auth/server/script-target.ts` and `.test.ts` for the pure part), `scripts/auth/create-admin.ts`, `scripts/auth/claim-data.ts`
- Modify: `README.md` (a short "Accounts (in progress)" section with the two commands)

**Interfaces:**
- Consumes: Task 5's exports, the 17 models, `AuthUser`.
- Produces:
  - `parseTarget(argv: string[]): { db: string; uri: string; apply: boolean; rest: string[] }` in `script-target.ts`. `--db <name>` is required; `--uri` defaults to `mongodb://localhost:27017/<db>`; throws if the URI's path names a different database than `--db`. `connectTo(target)` in `scripts/auth/target.ts` connects and throws unless `mongoose.connection.db.databaseName === target.db`.
  - `create-admin.ts --db <name> --email <e> --name <n>`: refuses if that email exists; reads the password twice from the terminal without echo (refuses when stdin is not a TTY); applies `passwordProblem`; creates the `AuthUser` with `role: "admin"`, `passwordChangedAt: now`; prints the id and the 10 recovery codes once.
  - `claim-data.ts --db <name> --admin <email> [--apply]`: resolves the admin (must exist, role admin, not disabled). For each of the 17 models reports the count of records without `ownerId`. Reports blockers and exits non-zero without writing if: more than one `{isCash: true}` account or more than one finance profile lacks an owner, or any record already has an `ownerId` that is not this admin's and the unowned set would clash with it on a unique field. With `--apply`: `updateMany({ ownerId: { $exists: false } }, { $set: { ownerId } })` with `{ timestamps: false }` per model, drop indexes `slug_1` (linkgroups), `name_1` (categories), `key_1` (futuresettings), `projectId_1` (scratchpads) when present, then `syncIndexes()` on all 17 models and `AuthUser`. Prints a per-collection summary. Running it twice changes nothing the second time.

- [ ] **Step 1: Write failing tests** for `parseTarget`: missing `--db` throws; `--db x --uri mongodb://h/y` throws; default URI built from `--db`; `--apply` parsed; unknown flags land in `rest`.
- [ ] **Step 2: Run** `npm test`; see them fail. **Step 3: Implement** `script-target.ts`, then the scripts (run command: the same `node --experimental-strip-types --no-warnings --import ./scripts/register-ts.mjs` prefix the parity scripts use; put it in each script's header comment).
- [ ] **Step 4: Verify on the scratch database** (never `test`):
  - `create-admin --db tracker_scratch …` needs a terminal: ask the owner to run it in the Terminal panel, then continue. A second run with the same email refuses.
  - `claim-data --db tracker_scratch --admin <email>` prints counts and writes nothing (re-run prints the same counts).
  - with `--apply`: counts go to zero; in `mongosh`-free form, a one-off `node` check prints the index names of `linkgroups`, `categories`, `futuresettings`, `scratchpads` and shows the old four gone and the compound ones present; second `--apply` reports nothing to do.
  - `claim-data --db tracker_scratch --uri mongodb://localhost:27017/test …` refuses.
- [ ] **Step 5: Run** `npm test`, `npm run lint`. **Step 6: Commit** `feat(auth): scripts to create the first admin and claim existing data`.

### Task 7: Isolation over real MongoDB

**Files:**
- Create: `scripts/auth-isolation/reset-db.mjs` (copy of `scripts/finance-parity/reset-db.mjs` with `tracker_isolation` hard-coded), `scripts/auth-isolation/run.ts`

**Interfaces:**
- Consumes: `scopedStore`, `mongoStore`, `seedOwner`, `probeAsStranger`, `ensureCashAccount`, `allRoutes`, `dispatch`.

- [ ] **Step 1: Write `run.ts`.** Connects with `mongoose.connect("mongodb://localhost:27017/tracker_isolation")` (hard-coded; throws unless the connected name matches and the database is empty), runs `syncIndexes()` on the 17 models, then, printing one `ok` / `FAIL` line per check and exiting non-zero on any failure:
  1. the Task 4 checks with `mongoStore` in place of the `BrowserStore` (raw reads use the models directly);
  2. the same slug, category name and settings key saved by owners A and B both succeed; A repeating its own slug through `linkGroups.insert` rejects with `ConflictError`;
  3. 20 parallel `ensureCashAccount(scopedStore(mongoStore, C))` calls, each with its own scoped store, leave exactly one `{ownerId: C, isCash: true}` account;
  4. 20 parallel `PUT /api/finance-profile` dispatches for C leave exactly one profile for C, none answering 5xx;
  5. a record inserted with no `ownerId` straight through the model is returned by no route for A or B.
- [ ] **Step 2: Run** `node scripts/auth-isolation/reset-db.mjs` then `run.ts`. Expected: every line `ok`, exit 0. A `FAIL` on 3 or 4 means Task 2's indexes or Task 3's handling is wrong: fix there and re-run from the reset.
- [ ] **Step 3: Commit** `test(auth): isolation and first-request races checked against MongoDB`.

### Task 8: Whole-stage check

- [ ] **Step 1:** `npm test` and `npm run lint`: pass, with the three parity replays unchanged.
- [ ] **Step 2:** Start the scratch server (`MONGODB_URI=mongodb://localhost:27017/tracker_scratch NEXT_DIST_DIR=.next-scratch npx next dev -p 3031`) on the claimed scratch database and, in the browser pane, open each module in My data: lists load, and creating one record per module works (it is saved without an owner, which is expected until stage 2). No new console or server errors beyond the known hydration-id warning.
- [ ] **Step 3:** `npm run build:static` passes its checks.
- [ ] **Step 4:** Update the local `CLAUDE.md` data-layer notes (scoped store, `ownerId`, the scripts, `tracker_isolation`) and commit any tracked doc changes: `docs: ownership stage notes`.

## Not in this stage

Switching `serve()` to the scoped store, making `ownerId` required, removing `runSeeds`, sessions, routes, pages, and the guard that only `serve.ts` names `mongoStore`: all stage 2. Running `claim-data --apply` on the live `test` database is the owner's step, after a `mongodump`, when stage 2 is ready to deploy.
