# Browser Data Mode: Finance Module — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Finance module (accounts, transactions, categories, payment plans, Datasheet profile, projections, summary) run against MongoDB or browser storage through one copy of its route logic, with proof that My data (MongoDB) behavior does not change.

**Architecture:** Same pattern as Links and Future. Route logic moves into plain handlers over the `Store` interface in `src/lib/finance/api/`; the ten Finance route files become `serve()` calls; four collections join the store registry and the Mongo store. Three things are new for Finance: the shared query evaluator learns dotted paths and `$and`; handlers get a clock (`now`) from the context; and a scripted parity scenario, captured from the unchanged code first, is replayed over HTTP and in-process to prove equivalence.

**Tech Stack:** Next.js 16 App Router, TypeScript, Mongoose 9.2, Zod 4, date-fns 4, `node --test` (run with `TZ=America/New_York`, see `package.json`).

**Spec:** `docs/superpowers/specs/2026-11-16-browser-data-mode-design.md`. Binding decisions D1–D15: `.superpowers/sdd/finance-recon/decisions.md`. Database-call inventory (ids such as A1, T19, PP6 used below): `.superpowers/sdd/finance-recon/inventory.md`.

**Where the work happens (binding, ruling of the session lead).** The owner's dev server on port 3030 hot-reloads the main checkout `/Users/danmuck/local/tracker_suite` against the live database, so nothing in this plan is done there. All implementation happens in the git worktree `/private/tmp/claude-501/-Users-danmuck--claude-spares-spare-v5ZS5m/659dd1e0-be77-4fef-ab7b-c2b0b40257ef/scratchpad/finance-wt` on branch `feature/finance-browser-data` (created by the session lead from `feature/future`, with its own real `node_modules` directory). Implementers never edit, build or run anything in `/Users/danmuck/local/tracker_suite`. Every repo-relative path in this plan is relative to the worktree root. The session lead merges the branch into `feature/future` only after Task 13's HTTP parity and the D11 real-data comparison both pass.

**Scope:** The Finance module only. Projects and Figure remain unconverted. Existing Finance bugs are carried over, not fixed (D2).

## Decisions that could not be followed

Every decision is implemented, with these departures. The session lead has accepted all four as written, and has confirmed that `ensureCashAccount` wraps every Finance route in both modes.

1. **D10 "byte-for-byte … everything else verbatim".** Values are compared verbatim, but the transcript is canonicalized in three more ways than D10 lists, because the three sources (hydrated Mongoose documents, lean documents, browser-store documents) cannot agree otherwise:
   - object keys are sorted (the three sources emit the same keys in different orders);
   - an ISO instant that is not UTC midnight (only the loan-disbursement `date`, which is "now") becomes `"<instant>"`;
   - `updatedAt` is not simply removed: it is replaced by `"<new>"`, `"<same>"` or `"<changed>"` relative to the last time that document appeared in a response (and likewise inside `dataVersion`). This is stricter than D10 and is what catches a write that should not have happened. If the lead prefers plain removal, delete rule N5 in Task 1; nothing else depends on it.
2. **D10 "drives every Finance route … transactions of every type".** Two paths cannot be reached over HTTP on an unchanged server because they need the calendar to advance: applying a pending future transaction (A1–A7) and posting plan payments that fall due later. The golden covers catch-up posting of a backdated plan; the rest is covered by handler tests with a moved clock (Task 7).
3. **D1 "the ONLY intended behavior changes".** Four further differences follow from the shared adapter or from D5 and cannot be avoided without changing shared code other modules use. They are listed under "Intended behavior changes" as (d)–(g), with two smaller ones found in review as (h) and (i): the demo build returns the adapter's 403; `__v` is no longer incremented by the former `save()` sites; `console.error` prefixes change; one extra read (`exists`) per Finance request for the Cash check.
4. **D3 "`new Date(value).toISOString()`".** The helper `toIso` follows Mongoose's actual cast (`node_modules/mongoose/lib/cast/date.js`), which additionally reads a numeric string of 275761 or more as milliseconds. For every value the app's forms send the two are identical.

## Global Constraints

- **Isolation.** Work only in the worktree `/private/tmp/claude-501/-Users-danmuck--claude-spares-spare-v5ZS5m/659dd1e0-be77-4fef-ab7b-c2b0b40257ef/scratchpad/finance-wt` (branch `feature/finance-browser-data`). Never edit, build, test or start anything in `/Users/danmuck/local/tracker_suite`. Start servers from the worktree only, on ports 3031–3036, with `NEXT_DIST_DIR` set and an explicit `MONGODB_URI` naming `tracker_parity` or `tracker_scratch`; the worktree has no `.env` file and none may be added. Do not merge, rebase onto, or push to `feature/future`: the session lead merges after Task 13's HTTP parity and the D11 comparison pass.
- **Safety (D15).** Port 3030 is the owner's server on the live database: never send it a request, never stop it. Implementers use only database `tracker_parity` (emptied only with `scripts/finance-parity/reset-db.mjs`) and the lead-provided `tracker_scratch`. Never run `mongodump` / `mongorestore`.
- Scratch server command (lead's copy of real-shaped data): `TZ=America/New_York NEXT_DIST_DIR=.next-scratch MONGODB_URI=mongodb://localhost:27017/tracker_scratch npx next dev -p 3031`. Against this server request HTML or JSON with `curl` only; do not open pages in a browser (the page's own fetches would post due payments on the lead's copy).
- No TypeScript-only runtime syntax in any file `npm test` loads (`node --experimental-strip-types` rejects it): no constructor parameter properties, no enums, no namespaces. Declare class fields explicitly.
- Parity server command: `TZ=America/New_York NEXT_DIST_DIR=.next-parity MONGODB_URI=mongodb://localhost:27017/tracker_parity npx next dev -p 3032`.
- My data mode must behave exactly as today except items (a)–(i) under "Intended behavior changes". The golden transcript (Task 1) is the authority: where this plan's description of a stored shape or status disagrees with the golden, stop and report; do not change the golden.
- Bugs listed under "Known bugs carried over" are reproduced. Do not fix or tidy them.
- Code reachable from the browser must not import `mongoose`, `next/server`, `src/lib/db.ts` or `src/models/**`. Everything under `src/lib/finance/api/` is browser-reachable.
- Documents cross the `Store` boundary as plain JSON: `_id` a 24-hex string, every date a full ISO instant (`2026-11-01T00:00:00.000Z`). `Account.rap.recertDate` stays an `MM-dd` string.
- Handlers never rely on Mongoose defaults, `trim`, `lowercase`, casting or strict-mode stripping: they build complete documents (Task 6 tables).
- "Today" comes only from `ctx.now`: no `new Date()`, `Date.now()` or `localTodayStr()` in `src/lib/finance/api/**`.
- Multi-write paths keep today's order of reads and writes (inventory §6). `bulkWrite` becomes `batchUpdate`; nothing is reordered or made atomic.
- Money is integer cents in storage; request bodies carry dollars and percent as today.
- Malformed ids: a path id that is not 24 lowercase hex returns that route's existing 404 body (D1a). A malformed id in a body or query position that today reaches a Mongoose cast calls `assertId` (throws, so the route returns its 500 failure string in both stores) at the point named in the route tables.
- No new dependencies. Tests: `npm test`. Types: `npx tsc --noEmit`. Commit after each task with the message given; stage files by name.
- If an assertion about an engine-computed number fails while the handler passes the engine the same inputs the old route did, report it; do not change `projection-engine.ts` beyond Task 5.

## Review Focus

1. **Balance arithmetic.** Debt and credit-card accounts move the opposite way to bank accounts; transfers are capped by credit limit and by amount owed; an edit reverses the old effect before applying the new one; a delete reverses it. → Task 8, tests "balance signs and caps" and "edit and delete reverse exactly".
2. **Once-only posting.** A due plan payment and a pending future transaction are each applied exactly once across repeated GETs and a moved clock, capped at what is owed. → Task 7, tests "due plan payments post once" and "a future transaction is applied once".
3. **Dates stored as full ISO instants.** A `yyyy-MM-dd` body date is stored as UTC midnight, so range filters, "future" detection and recurrence expansion give today's answers in both stores. → Task 5 (`toIso`, engine with string dates) and Task 8, test "dates are stored as instants".
4. **Old documents missing defaulted fields.** A transaction stored without `balanceApplied`, or an account without `isArchived`, reads as Mongoose hydration reads it today (applied; not archived). Fresh-database tests cannot see this. → Task 6, test "shape fills the defaults", and Task 8, test "a legacy transaction without balanceApplied".
5. **No write when nothing changed, and exactly today's fields set or removed.** The former `save()` sites must not touch a document whose values are unchanged (a changed `updatedAt` changes `dataVersion`, which resets the user's projection sandbox), and updates must keep the fields today's code keeps and remove the ones it removes. → Task 6 (`saveUpdate`), Task 7 ("update: omitted fields are kept"), Task 9 and Task 10 ("writes nothing when nothing changed").

## File Structure

Created:
- `scripts/finance-parity/scenario.ts` — the ordered request list, a pure function of today's date
- `scripts/finance-parity/normalize.ts` — transcript normalization and comparison (pure)
- `scripts/finance-parity/run.ts` — HTTP driver: `capture` and `check`
- `scripts/finance-parity/reset-db.mjs` — drops `tracker_parity`, and only that
- `scripts/finance-parity/golden/transcript.json` — the golden transcript
- `src/lib/finance/api/parity-normalize.test.ts` — tests for the normalizer and scenario
- `src/lib/finance/api/docs.ts` — document types, collection accessors, `shape*`, insert builders, `saveUpdate`, `ensureCashAccount`, `loadProfile`
- `src/lib/finance/api/post-payments.ts` — `postDuePayments(store, now)`
- `src/lib/finance/api/payment-plan.ts` — store-based payment-plan logic
- `src/lib/finance/api/profile.ts` — `saveProfileAndApply(store, p, now)`
- `src/lib/finance/api/account-handlers.ts`, `transaction-handlers.ts`, `category-handlers.ts`, `payment-plan-handlers.ts`, `profile-handlers.ts`, `projection-handlers.ts` — handlers
- `src/lib/finance/api/routes.ts` — `financeRoutes`
- `src/lib/finance/api/test-helpers.ts` — test-only store and dispatch helpers
- `src/lib/finance/api/*.test.ts` — one per file above, plus `parity.test.ts`
- `src/hooks/finance/no-direct-fetch.test.ts` — guard: Finance client code reaches data only through `request.ts`
- `src/lib/demo/finance.ts` — sample data

Modified:
- `src/lib/data/query.ts` (dotted paths, `$and`), `api.ts` (`now`), `dispatch.ts` (`now` parameter), `serve.ts` (passes `new Date()`), `store.ts` (four collections; `updateById` option), `browser-store.ts` and `mongo-store.ts` (`timestamps: false`; four models; `skip`), `all-routes.ts`
- `.gitignore` (`/.next-*/`)
- `src/lib/finance/dates.ts` (`asDate`, `toIso`, `filterDate`, `localDateStr`, `startOfTomorrow`), `src/lib/finance/projection-engine.ts` (string dates; no model types)
- `src/lib/db.ts` (the Cash upsert moves in from `seed.ts`)
- the ten Finance `route.ts` files; the seven Finance hook files; `src/components/finance/projection-transactions.tsx`
- `src/lib/demo/index.ts`, `src/lib/demo/demo.test.ts`, `src/lib/modules.ts`, `eslint.config.mjs`, `CLAUDE.md`

Deleted (Task 13): `src/lib/finance/post-payments.ts`, `payment-plan.ts`, `apply-profile.ts`, `seed.ts`.

What happens to each model-importing library file (D14):

| File today | End state |
|---|---|
| `src/lib/finance/post-payments.ts` | deleted; replaced by `api/post-payments.ts` |
| `src/lib/finance/payment-plan.ts` | deleted; replaced by `api/payment-plan.ts` (the pure `describeCadence`, `PaymentPlanError`, `PaymentPlanDTO` move with it) |
| `src/lib/finance/apply-profile.ts` | deleted; `LinkedTransactionMissingError` and `saveProfileAndApply` in `api/profile.ts`; `profileFromDoc` / `loadProfile` in `api/docs.ts`; the dynamic `import("./payment-plan")` is gone (no cycle: `payment-plan.ts` imports `docs.ts`, `profile.ts` imports `payment-plan.ts`) |
| `src/lib/finance/seed.ts` | deleted; its `runSeeds` body moves unchanged into `src/lib/db.ts`; browser data uses `ensureCashAccount` |

Until Task 13 the old files stay, used only by the old route files; nothing under `src/lib/finance/api/` may import them.

## Reference: collections

| Store name | Model | Unique | Date fields | Subdocument `_id`s |
|---|---|---|---|---|
| `accounts` | `Account` | — | — (`rap.recertDate` is a string) | none: `subLoans`, `rap` are `_id: false` |
| `transactions` | `Transaction` | — | `date`, `recurrenceRule.startDate`, `recurrenceRule.endDate`, `amountSchedule[].effectiveDate`, `postedThrough` | none: `recurrenceRule`, `amountSchedule[]` are `_id: false` |
| `financeCategories` | `Category` | `name` | — | none |
| `financeProfile` | `FinanceProfile` | — (singleton: `findOne({})`, `updateOne({}, …, { upsert: true })`) | `salarySteps[]/retirementSteps[]/healthSteps[]/rentSteps[].effectiveDate` | none: all step arrays and `whatIfSalaries` are `_id: false` |

D6 check on subdocument `_id`s: verified in `src/models/finance/*.ts` that every subdocument schema sets `_id: false`, and no client code reads a subdocument `_id` (no match for `__v` or a nested `._id` in `src/hooks/finance`, `src/components/finance`, `src/app/(app)/finance`). Nothing to strip.

Defaults a handler writes on insert, and that `shape*` fills on read when the stored document lacks the field:

| Collection | On insert (always present) | `shape*` fills when missing |
|---|---|---|
| accounts | `name` (trimmed), `type`, `balance` (default `0`), `currency` (`"USD"`), `isCash: false`, `isArchived: false`; optional and only when given: `creditLimit`, `isLoan`, `linkedAccountId`, `notes` (trimmed), `apr`, `minimumPayment` | `balance: 0`, `currency: "USD"`, `isCash: false`, `isArchived: false`; inside an existing `rap`: `enabled: false`, `autoSchedule: true`, `recertDate: "07-01"`, `dependents: 0` |
| transactions | `amount`, `date` (ISO), `description` (trimmed), `accountId`, `type`, `isRecurring` (`false`), `categoryTags` (each trimmed; `[]`), `balanceApplied` (`true` unless set); optional: `toAccountId`, `notes` (trimmed), `recurrenceRule` (via `buildRule`: `interval: 1`, `endDate: null`, `daysOfMonth: []`), `amountSchedule` | `isRecurring: false`, `categoryTags: []`, `balanceApplied: true`; inside an existing `recurrenceRule`: `interval: 1`, `endDate: null`, `daysOfMonth: []` |
| financeCategories | `name` (trimmed, lowercased), `color`, `icon`, `isDefault` (`false`) | `isDefault: false` |
| financeProfile | every `FinanceProfileData` field (`profileToDoc`) | via `profileFromDoc`: `filingStatus: "single"`, `hoursPerWeek: 40`, `nycResident: false`, `raiseRate: 0.03`, both link ids `null`, the five arrays `[]` |

`shape*` is applied wherever today's code reads a hydrated document (every read used in logic, and every response except the three lean ones: the `data` array of `GET /api/transactions`, the body of `GET /api/transactions/:transactionId`, the body of `PUT /api/transactions/:transactionId`, which return stored documents as they are).

## Reference: route table

Every route is registered in `financeRoutes` wrapped by `withCash` (runs `ensureCashAccount(ctx.store)` first). The two category routes are also wrapped by `noConflict` (a `ConflictError` is rethrown as a plain `Error`, so a unique-index race stays a 500 with the route's failure string, as today). "→ 404" for a malformed path id is change (a).

| # | Method | Path | Handler | Behavior | Errors (status) | `failure` |
|---|---|---|---|---|---|---|
| R1 | GET | `/api/accounts` | `listAccounts` | `postDuePayments`; apply pending one-time transactions dated before `startOfTomorrow(now)`; list filtered by `?type=` (any string, equality) and hidden-archived unless `?includeArchived=true`; sort `{ createdAt: -1 }`; **bare array**, shaped | — | `Failed to fetch accounts` |
| R2 | POST | `/api/accounts` | `createAccount` | `accountSchema.safeParse`; `assertId(linkedAccountId)` when present; insert; optional loan disbursement; 201 bare shaped account | `Validation failed` + `details: flatten()` (400); `Linked account not found for loan disbursement` (400, after the insert) | `Failed to create account` |
| R3 | GET | `/api/accounts/:accountId` | `getAccount` | `postDuePayments` first, then lookup; bare shaped account | `Account not found` (404) | `Failed to fetch account` |
| R4 | PUT | `/api/accounts/:accountId` | `updateAccount` | 404 check, Cash type guard on the raw body, `accountSchema.safeParse`, `assertId(linkedAccountId)` when present, update; 200 bare shaped account (`null` body if it vanished) | `Account not found` (404); `Cannot change the type of the Cash account` (400); `Validation failed` + flatten (400) | `Failed to update account` |
| R5 | PATCH | `/api/accounts/:accountId` | `archiveAccount` | 404 check, `accountArchiveSchema.safeParse`, Cash guard, `$set: { isArchived }`; bare shaped account | `Account not found` (404); `Validation failed` + flatten (400); `The Cash account cannot be archived` (403) | `Failed to update account` |
| R6 | DELETE | `/api/accounts/:accountId` | `deleteAccount` | 404 check, Cash guard, delete transactions on either side, delete account; `{ message: "Account and associated transactions deleted" }` | `Account not found` (404); `The Cash account cannot be deleted` (403) | `Failed to delete account` |
| R7 | GET | `/api/accounts/:accountId/payment-plan` | `getPlan` | `postDuePayments`; `{ data: PaymentPlanDTO }` | `PaymentPlanError` message and status: `Account not found` (404), `Payment plans are for credit cards and debt accounts` (400) | `Failed to update payment plan` |
| R8 | POST | same | `setupPlan` | `postDuePayments`; `paymentPlanSetupSchema.safeParse`; `setupPayments`; 200 `{ data }` | first issue message, else `Validation failed`, **no details** (400); `Account not found` (404); `Payment plans are for credit cards and debt accounts` (400); `Payments are already set up for this account — unlink them first` (409); `Payments must come from an active bank account` (400) | `Failed to update payment plan` |
| R9 | PUT | same | `updatePlan` | `postDuePayments`; `paymentPlanUpdateSchema.safeParse`; `updatePaymentPlan`; `{ data }` | first issue message (400); `Account not found` (404); `Payment plans are for credit cards and debt accounts` (400); `No payment linked — set up payments` (409); `RAP applies to debt accounts only` (400) | `Failed to update payment plan` |
| R10 | DELETE | same | `unlinkPlan` | `postDuePayments`; `unlinkPaymentPlan`; `{ data }` | `Account not found` (404); `Payment plans are for credit cards and debt accounts` (400) | `Failed to update payment plan` |
| R11 | GET | `/api/transactions` | `listTransactions` | filters and paging as today (see Task 8); `{ data, pagination: { page, limit, total, totalPages } }`, `data` unshaped | — | `Failed to fetch transactions` |
| R12 | POST | `/api/transactions` | `createTransaction` | `transactionSchema.parse`; caps; insert; apply balance unless recurring or future; 201 bare shaped transaction | ZodError → `Validation failed` + `details: <the ZodError as JSON>` (400); `Source or destination account not found` (400, any transfer) | `Failed to create transaction` |
| R13 | GET | `/api/transactions/:transactionId` | `getTransaction` | bare stored document, unshaped | `Transaction not found` (404) | `Failed to fetch transaction` |
| R14 | PUT | `/api/transactions/:transactionId` | `updateTransaction` | 404 check, `transactionSchema.parse`, reverse old, apply new, update; bare stored document, unshaped | `Transaction not found` (404); ZodError → `Validation failed` + details (400); `Source or destination account not found` (400, non-recurring transfer, after the reversal) | `Failed to update transaction` |
| R15 | DELETE | `/api/transactions/:transactionId` | `deleteTransaction` | reverse if applied, delete, unset any `paymentTransactionId` pointing at it; `{ message: "Transaction deleted successfully" }` | `Transaction not found` (404) | `Failed to delete transaction` |
| R16 | GET | `/api/categories` | `listCategories` | seed the 9 `DEFAULT_CATEGORIES` when the collection is empty; `{ data }` sorted `{ isDefault: -1, name: 1 }`, shaped | — | `Failed to fetch categories` |
| R17 | POST | `/api/categories` | `createCategory` | `categorySchema.parse`; name trimmed and lowercased; 201 `{ data }` | `Category already exists` (400); ZodError → `Validation failed` + details (400) | `Failed to create category` |
| R18 | GET | `/api/projections` | `getProjection` | `postDuePayments`, then the parameter check; `{ data: ProjectionResult, dataVersion }` | `startDate and endDate are required` (400); `RangeError` → its message (400), e.g. `Projection window exceeds 36600 days` | `Failed to generate projections` |
| R19 | POST | `/api/projections` | `postProjection` | `postDuePayments`; `sandboxRequestSchema.parse`; same projection with the sandbox; nothing saved | ZodError → `Invalid projection request` + `details: error.issues` (400); `RangeError` → message (400) | `Failed to generate projections` |
| R20 | GET | `/api/summary` | `getSummary` | `postDuePayments`; `{ data: SummaryResult }` | `RangeError` → message (400), e.g. `Invalid time value` | `Failed to generate summary` |
| R21 | GET | `/api/finance-profile` | `getProfile` | `{ data: profileToDollars(loadProfile) }` | — | `Failed to load profile` |
| R22 | PUT | `/api/finance-profile` | `saveProfile` | `financeProfileSchema.safeParse`; `saveProfileAndApply`; `{ data, updated: { salary, rent } }` | first issue message, else `Validation failed`, + `details: flatten()` (400); `Linked Salary transaction not found — pick one` / `Linked Rent transaction not found — pick one` (409) | `Failed to save profile` |
| R23 | POST | `/api/finance-profile/merge-rent` | `mergeRent` | schema `{ keepId, mergeId }`; fold, delete, save; `{ data, updated }` | `keepId and mergeId must be two different transactions` (400, also for a schema failure); `Both transactions must exist and be recurring` (404); linked-missing messages (409) | `Failed to merge rent` |

Verified against the route files; the inventory's table matched.

## Reference: database call rewrites

Notation: `acc` = `accounts(store)`, `tx` = `transactions(store)`, `cat` = `categories(store)`, `prof` = `profiles(store)`. "shaped" = passed through `shape*`. Ids are strings throughout.

| Inventory id | Today | Replacement |
|---|---|---|
| S1 | Cash upsert in `seed.ts` | unchanged code, moved into `src/lib/db.ts`; plus `ensureCashAccount(store)`: `if (!(await acc.exists({ isCash: true }))) await acc.insert({ name: "Cash", type: "bank", isCash: true, balance: 0, currency: "USD", isArchived: false })` (read-then-insert, never an upsert: an upsert would change `updatedAt` on every request in the browser store) |
| A1 | `Transaction.find({ balanceApplied: false, isRecurring: { $ne: true }, date: { $lt: startOfTomorrow } })` | `tx.find({ balanceApplied: false, isRecurring: { $ne: true }, date: { $lt: startOfTomorrow(now).toISOString() } })`, shaped |
| A2, A7 | `findByIdAndUpdate(tx._id, { balanceApplied: true })` | `tx.updateById(id, { $set: { balanceApplied: true } })` |
| A3, A5, A10, A13, A14, A16, A18, T3, T6, T10, T11, T13, T15, T17, T21, T22, T24, P4, PP1, PP7, PP9, PP10 | `Account.findById` | `acc.findById(id)`, shaped |
| A4, T5, T12, T16, T23, P5 | `Account.bulkWrite([{ updateOne: { filter: { _id }, update: { $inc: { balance } } } }, …])` | `acc.batchUpdate([{ filter: { _id }, update: { $inc: { balance } } }, …])` with the same ops in the same order and the same signed amounts (inventory §3d) |
| A6, A11, T7, T14, T18, T25 | `Account.findByIdAndUpdate(id, { $inc: { balance } })` | `acc.updateById(id, { $inc: { balance } })` |
| A8 | `Account.find(filter).sort({ createdAt: -1 })` | `acc.find(filter, { sort: { createdAt: -1 } })`, shaped |
| A9 | `Account.create(accountData)` | `acc.insert(doc)` with the full insert document (collections table); `depositFunds`, the dollar `apr` and `minimumPayment` are not stored |
| A12 | `Transaction.create({ … date: new Date() })` | `tx.insert({ accountId, toAccountId, type: "transfer", amount, description, categoryTags: ["transfer"], date: now.toISOString(), isRecurring: false, balanceApplied: true })` |
| A15 | `findByIdAndUpdate(id, { ...fields, $unset? }, { new, runValidators })` | `acc.updateById(id, { $set: fields, ...(Object.keys(plan.unset).length ? { $unset: plan.unset } : {}) })`; `fields` = `name` (trimmed), `type`, `balance` (cents), `currency`, plus when present in the parsed body `creditLimit` (cents), `isLoan`, `linkedAccountId`, `notes` (trimmed), plus `plan.set`; never `depositFunds`, never the dollar `apr` / `minimumPayment` |
| A17 | `findByIdAndUpdate(id, { isArchived })` | `acc.updateById(id, { $set: { isArchived } })` |
| A19 | `Transaction.deleteMany({ $or: [{ accountId }, { toAccountId: accountId }] })` | `tx.deleteMany` with the same filter |
| A20, T26, M3 | `findByIdAndDelete(id)` | `deleteById(id)` |
| P1 | `Account.find({ paymentTransactionId: { $ne: null }, isArchived: { $ne: true } })` | `acc.find` with the same filter, shaped |
| P2, T8, T9, T20, PP2, PP4, AP2, M1 | `Transaction.findById` | `tx.findById(id)`; shaped except T8 |
| P3 | `Transaction.updateOne({ _id, postedThrough: previous ?? null }, { $set: { postedThrough: new Date(last) } })`, then `modifiedCount !== 1` | `const claimed = await tx.updateOne({ _id, postedThrough: previous ?? null }, { $set: { postedThrough: toIso(last) } }); if (!claimed) continue;` (`previous` is the stored ISO string) |
| PP3, AP1 | `FinanceProfile.findOne()` + `doc.toObject()` | `profileFromDoc(await prof.findOne({}))` (`loadProfile`) |
| PP5, AP4 | `Transaction.updateOne({ _id }, { $unset: { amountSchedule: 1 } })` | `tx.updateById(id, { $unset: { amountSchedule: 1 } })` |
| PP6 | mutate `tx.amountSchedule`, `tx.amount`; `tx.save()` | `saveTransaction(store, raw, { amountSchedule: entries.map(e => ({ effectiveDate: toIso(e.effectiveDate), amount: e.amount, ...(e.source ? { source: e.source } : {}) })), amount: amountOn(entries[0].amount, entries, localDateStr(now)) })` |
| PP8 | `Account.find({ "rap.enabled": true, paymentTransactionId: { $ne: null } })` | `acc.find` with the same filter (dotted path, Task 2), shaped |
| PP11 | `Transaction.create({ … })` | `tx.insert({ amount: cents, date: toIso(startDate), description: \`${account.name} payment\`, accountId: from._id, toAccountId: account._id, type: "transfer", isRecurring: true, recurrenceRule: { frequency: "monthly", interval: 1, startDate: toIso(startDate), endDate: null, dayOfMonth, daysOfMonth: [] }, categoryTags: [account.type === "credit_card" ? "credit" : "loans", "transfer"], balanceApplied: false, amountSchedule: [{ effectiveDate: toIso(startDate), amount: cents }] })` |
| PP12 | `account.paymentTransactionId = tx._id; account.save()` | `saveAccount(store, raw, { paymentTransactionId: created._id })` |
| PP13 | `account.subLoans = …; account.rap = …; account.save()` | `saveAccount(store, raw, { ...(input.subLoans ? { subLoans } : {}), ...(input.rap ? { rap: input.rap } : {}) })`, only when either was given |
| PP14 | `Transaction.deleteOne({ _id: account.paymentTransactionId })` | `tx.deleteById(account.paymentTransactionId)` |
| PP15 | `Account.updateOne({ _id }, { $unset: { paymentTransactionId: 1 } })` | `acc.updateById(account._id, { $unset: { paymentTransactionId: 1 } })` |
| T1, T2 | `find(filter).sort().skip().limit().lean()` + `countDocuments(filter)` | `tx.find(filter, { sort: { [sort]: sortOrder }, skip, limit })` and `tx.count(filter)`; date bounds `filterDate(startDate)` / `filterDate(endDate)` |
| T4 | `Transaction.create({ ...validated, amount, balanceApplied })` | `tx.insert(doc)`: `amount`, `date: toIso(validated.date)`, `description` (trimmed), `accountId`, `type`, `isRecurring`, `categoryTags` (trimmed), `balanceApplied`, plus when present `toAccountId`, `notes` (trimmed), `recurrenceRule: buildRule(validated.recurrenceRule)` |
| T19 | `findByIdAndUpdate(id, { ...validated, amount, balanceApplied }, { new, runValidators }).lean()` | `tx.updateById(id, { $set: doc })` with the same `doc` as T4 (so a field absent from the body is kept; `amountSchedule` and `postedThrough` are never touched) |
| T27 | `Account.updateMany({ paymentTransactionId: id }, { $unset: { paymentTransactionId: 1 } })` | `acc.updateMany` with the same arguments |
| C1, C2 | `countDocuments()`; `insertMany(DEFAULT_CATEGORIES)` | `cat.count()`; `cat.insertMany(DEFAULT_CATEGORIES.map((c) => ({ ...c })))` |
| C3 | `find().sort({ isDefault: -1, name: 1 })` | `cat.find({}, { sort: { isDefault: -1, name: 1 } })`, shaped |
| C4, C5 | `findOne({ name: lower })`; `create({ ...validated, name: lower })` | `const name = validated.name.trim().toLowerCase(); if (name === "") throw new Error("name is required");` then `cat.findOne({ name })`; `cat.insert({ name, color, icon, isDefault })` (Mongoose applies `trim` and `lowercase` to the query value and the stored value today: `schemaType.js` `_castForQuery`) |
| PR1, SU1 | `Account.find()` | `acc.find()`, shaped |
| PR2 | `Transaction.find()` | `tx.find()`, shaped |
| PR3 | `Transaction.find({ $or: [...] })` or `{ $and: [accountOr, dateFilter] }` | `tx.find` with the same filter, every `new Date(x)` replaced by `filterDate(x)` (`dates.ts`, Task 5); shaped |
| PR4, PR5, PR6 | `countDocuments()`; `findOne().sort({ updatedAt: -1 }).select("updatedAt")`; `FinanceProfile.findOne().select("updatedAt")` | `tx.count()`; `tx.findOne({}, { sort: { updatedAt: -1 }, select: ["updatedAt"] })`; `prof.findOne({}, { select: ["updatedAt"] })`; every `x.updatedAt?.getTime() ?? 0` becomes `x?.updatedAt ? asDate(x.updatedAt).getTime() : 0` |
| SU2 | `Transaction.find({ ...(accountId ? { accountId } : {}), $or: [...] })` | same filter, `startDate` / `endDate` as `filterDate(range.startStr)` / `filterDate(range.endStr)`; shaped |
| AP3 | mutate `amountSchedule`, `amount`, for Rent `recurrenceRule.startDate` and `date`; `tx.save()` | `saveTransaction(store, raw, { amountSchedule: schedule.map(e => ({ effectiveDate: toIso(e.effectiveDate), amount: e.amount })), amount: amountOn(schedule[0].amount, schedule, localDateStr(now)), ...(kind === "Rent" && raw.recurrenceRule ? { "recurrenceRule.startDate": toIso(schedule[0].effectiveDate), date: toIso(schedule[0].effectiveDate) } : {}) })` |
| AP5, AP6 | `Transaction.exists({ _id })` | `assertId(id)` then `tx.exists({ _id: id })` |
| AP7 | `FinanceProfile.findOneAndUpdate({}, profileDataToDoc(p), { upsert, runValidators })` | `prof.updateOne({}, { $set: profileToDoc(p) }, { upsert: true })` |
| M2 | `keep.recurrenceRule.endDate = merge.recurrenceRule.endDate ?? null; keep.save()` | `saveTransaction(store, keepRaw, { "recurrenceRule.endDate": merge.recurrenceRule.endDate ?? null })` |

`src/lib/finance/projection-sandbox.ts:89` (`typeof t.toObject === "function" ? t.toObject() : t`) already accepts plain objects and is left as it is. No Finance code needs a dotted path through an array (checked: every dotted path above goes through `recurrenceRule` or `rap`, both plain objects).

---

### Task 1: Parity scenario and golden transcript

Model tier: most capable (a long exact scenario, and judgment when a captured status disagrees with the plan). No application code changes in this task.

**Files:**
- Create: `scripts/finance-parity/scenario.ts`, `normalize.ts`, `run.ts`, `reset-db.mjs`, `golden/transcript.json`
- Modify: `.gitignore` — replace the `/.next-scratch/` and `/.next-demo/` lines with `/.next-*/`
- Test: `src/lib/finance/api/parity-normalize.test.ts`

**Interfaces:**
- Consumes: nothing from the app. `run.ts` uses global `fetch`. `reset-db.mjs` uses `mongoose` (already a dependency).
- Produces:
  - `scenario.ts`: `export interface Step { id: string; method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"; path: string; body?: unknown; rawBody?: string; save?: { name: string; from: string }; expect: number | null; allow?: { rule: "D1a" | "D1c"; status: number; error?: string } }` and `export function buildScenario(today: string): Step[]` (`today` is `yyyy-MM-dd`). `{name}` in `path`, in any string inside `body`, and in object keys of `body` is replaced with the saved id of that name. `save.from` is a dot path into the response body (`_id`, `0._id`, `data.payment.transactionId`). `expect` is the status the unchanged code returns (`null` = record whatever comes back). `allow` marks a step whose response changes by D1a or D1c: `allow.status` (and `allow.error`, when given, against `body.error`) is what the converted code must return.
  - `normalize.ts`:
    - `export interface Transcript { meta: { capturedAt: string; localDate: string; timeZone: string; commit: string }; steps: { id: string; request: string; status: number; body: unknown }[]; finalBalances: Record<string, number> }`
    - `Transcript.steps[].request` holds the method and the **unsubstituted** path (e.g. `GET /api/accounts/{checking}`), so it is identical in every run.
    - `export function createNormalizer(saved: () => Record<string, string>): (body: unknown) => unknown` — stateful across one run; apply to each response in order.
    - `export function compareTranscripts(golden: Transcript, actual: Transcript, steps: Step[]): string[]` — returns human-readable differences, empty when they match. For a step with `allow`: the golden entry must have status `expect`, and the actual entry must have `allow.status` (and `allow.error`); bodies are not compared. For every other step: `JSON.stringify` of status and body must be equal. `finalBalances` must be equal.
    - `export function substitute<T>(value: T, saved: Record<string, string>): T`
    - `export function dayOrderConflicts(days: { date: string; transactions: { sourceTransactionId?: string; isRecurring?: boolean }[] }[], created: { _id: string; date: string }[]): string[]` — N7's third check; `created` is every stored transaction in creation order. Returns one message per day on which two entries of the same kind (both recurring or both not) with different source ids appear, and creation order and stored-`date`-descending order disagree about which comes first.
  - `run.ts` CLI: `capture --base <url> --out <file>` and `check --base <url> [--golden <file>]` (default golden `scripts/finance-parity/golden/transcript.json`). Run as `TZ=America/New_York node --experimental-strip-types --no-warnings --import ./scripts/register-ts.mjs scripts/finance-parity/run.ts <command> …`.
  - `reset-db.mjs`: connects to the hard-coded `mongodb://localhost:27017/tracker_parity`, throws unless `mongoose.connection.db.databaseName === "tracker_parity"`, calls `dropDatabase()`, prints `dropped tracker_parity`, disconnects. It takes no arguments and reads no environment variable.

**Normalization rules** (applied to the JSON-round-tripped body; N5 and N6 read the original timestamp values, so compute them before N4 rewrites instants):

- N1. Remove every `createdAt` and `__v` key at any depth.
- N2. Sort object keys at every depth (arrays keep their order).
- N3. Replace every 24-hex string value, and every object key that is a 24-hex string, with an alias: `<name>` when the id was saved under a name by a `save`, otherwise `<id:N>` numbered in order of first appearance (walking the key-sorted structure depth-first). After replacing keys, sort keys again.
- N4. Replace a string matching `/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/` that does not end in `T00:00:00.000Z` with `"<instant>"`.
- N5. For an object that has both `_id` and `updatedAt`: replace `updatedAt` with `"<new>"` the first time that `_id` is seen, `"<same>"` when the value equals the one last seen for that `_id`, `"<changed>"` otherwise. Any other `updatedAt` is removed.
- N6. A `dataVersion` string has the form `count|latestTxMs|profileMs|id:balance:ms,id:balance:ms,…`. Rewrite it as `count|M|M|alias:balance:M,…` where each `M` is the N5 marker for that slot (slot keys `latestTx`, `profile`, and each account id), and the account entries are re-sorted by alias.
- N7. Order checks. `run.ts` and the in-process replay both stop with an error when a response's order rests on a tie or on store-specific ordering:
  - a `GET /api/transactions…` list in which two adjacent items are equal on the request's `sort` field (default `date`);
  - a `categoryBreakdown` (summary) in which two adjacent entries have the same `amount`;
  - a projection `timeline` day or summary `days` entry holding two transactions with different `sourceTransactionId`s, both recurring or both one-time, whose order by creation differs from their order by stored `date` descending. MongoDB may return an account-filtered query in index order (`{ accountId: 1, date: -1 }`) while the browser store returns insertion order, and the engine keeps input order within a day. To evaluate this, `run.ts` reads `GET /api/transactions?limit=1000&sort=createdAt&order=asc` (a read with no side effects, not recorded) before each `/api/projections` and `/api/summary` step; the replay reads the store.
  The scenario is built so none of these fire (distinct dates and amounts; recurring transactions created in descending stored-date order); the checks keep it that way. If one fires during a capture, stop and report: the lead adjusts the scenario. This ordering difference between the stores is listed under "Known bugs carried over".

**Guards in `run.ts`:** `check` aborts when today's local date differs from the golden's `meta.localDate` (Task 13 says what to do then); refuse a `--base` whose port is 3030 or outside 3031–3036; before step 1, send `GET /api/transactions` and abort unless it reports `total: 0` — only then send `GET /api/accounts?includeArchived=true` (that request writes: it posts due payments and applies pending transactions, so a server started on the wrong database must never receive it) and abort unless it returns at most one account, which has `isCash: true` (these two probe requests are not part of the transcript, and because they run first the Cash account already exists at step A01); abort if the local date or the UTC date at the end of the run differs from the start; in `capture`, abort if any step's status differs from a non-null `expect`.

**The scenario.** `T` = `today`. Helpers inside `scenario.ts` (pure string math on noon-UTC dates): `d(n)` = `T` plus `n` days; `som(k)` = first day of the month `k` months from `T`'s month; `eom(k)` = last day of that month; `dom(k, n)` = day `n` of that month. All dollar amounts and all `date` values below are pairwise distinct on purpose, the amounts that reach each summary category in R14–R22 differ, and the recurring transactions whose source is `{checking}` (T09 once T41 makes it recurring, T12, T13, T15, T16, then the plan transfers of P05 and P11) are created in descending order of stored `date` (all N7). `B` = `"bbbbbbbbbbbbbbbbbbbbbbbb"` (a well-formed id that does not exist). "valid account body" = `{ name: "x", type: "bank", balance: 0 }`; "valid tx body" = `{ amount: 1.11, date: d(-2), description: "x", accountId: "{checking}", type: "debit" }`. `RAW` = `rawBody: "{"`. For a D1a step, `allow` = `{ rule: "D1a", status: 404, error: <that route's not-found string> }`; for a D1c step, `allow` = `{ rule: "D1c", status: 400 }` plus `error` where the table gives one.

| id | request | body | `expect` → after |
|---|---|---|---|
| A01 | GET `/api/accounts` (save `cash` from `0._id`) | | 200 |
| A02 | GET `/api/categories` | | 200 |
| A03 | POST `/api/accounts` (save `checking` from `_id`) | `{ name: "Parity Checking", type: "bank", balance: 5000 }` | 201 |
| A04 | POST `/api/accounts` (save `savings`) | `{ name: "  Parity Savings  ", type: "bank", balance: 12000.5, notes: "  rainy day  " }` | 201 |
| A05 | POST `/api/accounts` (save `card`) | `{ name: "Parity Card", type: "credit_card", balance: 400, creditLimit: 1000, apr: 24.99, minimumPayment: 35 }` | 201 |
| A06 | POST `/api/accounts` (save `loan`) | `{ name: "Parity Student Loan", type: "debt", balance: 20000, apr: 6.5 }` | 201 |
| A07 | POST `/api/accounts` (save `car`) | `{ name: "Parity Car Loan", type: "debt", balance: 8000, isLoan: true, linkedAccountId: "{checking}", depositFunds: true, apr: 7.25, minimumPayment: 150 }` | 201 |
| A08 | POST `/api/accounts` | `{ name: "Parity Orphan Loan", type: "debt", balance: 50, isLoan: true, linkedAccountId: B, depositFunds: true }` | 400 |
| A09 | POST `/api/accounts` | `{ name: "", type: "nope", balance: "x" }` | 400 |
| A10 | POST `/api/accounts` | RAW | 500 → D1c, `Validation failed` |
| A11–A14 | GET `/api/accounts`, `?type=bank`, `?includeArchived=true`, `?type=debt&includeArchived=true` | | 200 |
| A15 | GET `/api/accounts/{checking}` | | 200 |
| A16 | GET `/api/accounts/B` | | 404 |
| A17 | GET `/api/accounts/abc` | | 500 → D1a, `Account not found` |
| A18 | PUT `/api/accounts/{card}` | `{ name: "Parity Card", type: "credit_card", balance: 400, creditLimit: 1500, apr: null, minimumPayment: 40, depositFunds: true }` | 200 |
| A19 | PUT `/api/accounts/{cash}` | `{ name: "Cash", type: "debt", balance: 0 }` | 400 |
| A20 | PUT `/api/accounts/{cash}` | `{ name: "Cash", type: "bank", balance: 25 }` | 200 |
| A21 | PUT `/api/accounts/{checking}` | `{ name: "x" }` | 400 |
| A22 | PUT `/api/accounts/B` | valid account body | 404 |
| A23 | PUT `/api/accounts/abc` | valid account body | 500 → D1a, `Account not found` |
| A24 | PUT `/api/accounts/{checking}` | RAW | 500 → D1c, `Validation failed` |
| A25 | PATCH `/api/accounts/{savings}` | `{ isArchived: true }` | 200 |
| A26, A27 | GET `/api/accounts`, `?includeArchived=true` | | 200 |
| A28 | PATCH `/api/accounts/{savings}` | `{ isArchived: false }` | 200 |
| A29 | PATCH `/api/accounts/{cash}` | `{ isArchived: true }` | 403 |
| A30 | PATCH `/api/accounts/{checking}` | `{ isArchived: "yes" }` | 400 |
| A31 | PATCH `/api/accounts/B` | `{ isArchived: true }` | 404 |
| A32 | PATCH `/api/accounts/abc` | `{ isArchived: true }` | 500 → D1a, `Account not found` |
| C01 | POST `/api/categories` | `{ name: "Parity Pets", color: "#112233", icon: "Dog" }` | 201 |
| C02 | POST `/api/categories` | `{ name: "  PARITY pets ", color: "#112233", icon: "Dog" }` | 400 |
| C03 | POST `/api/categories` | `{ name: "x", color: "red", icon: "Dog" }` | 400 |
| C04 | GET `/api/categories` | | 200 |
| T01 | POST `/api/transactions` (save `tPay`) | `{ amount: 3000, date: d(-20), description: "Parity paycheck", accountId: "{checking}", type: "credit", categoryTags: ["salary"] }` | 201 |
| T02 | POST (save `tGroc`) | `{ amount: 120.55, date: d(-19), description: "  Parity groceries ", accountId: "{checking}", type: "debit", categoryTags: ["spending"], notes: "  weekly shop " }` | 201 |
| T03 | POST (save `tSub`) | `{ amount: 60, date: d(-18), description: "Parity subscription", accountId: "{card}", type: "debit", categoryTags: ["subscriptions"] }` | 201 |
| T04 | POST | `{ amount: 25, date: d(-17), description: "Parity refund", accountId: "{card}", type: "credit", categoryTags: ["other"] }` | 201 |
| T05 | POST (save `tSav`) | `{ amount: 500, date: d(-16), description: "Parity to savings", accountId: "{checking}", toAccountId: "{savings}", type: "transfer", categoryTags: ["transfer"] }` | 201 |
| T06 | POST (save `tPayoff`) | `{ amount: 10000, date: d(-15), description: "Parity card payoff", accountId: "{checking}", toAccountId: "{card}", type: "transfer", categoryTags: ["credit", "transfer"] }` (capped at what is owed) | 201 |
| T07 | POST (save `tAdv`) | `{ amount: 5000, date: d(-14), description: "Parity cash advance", accountId: "{card}", toAccountId: "{checking}", type: "transfer", categoryTags: ["transfer"] }` (capped by the credit limit) | 201 |
| T08 | POST (save `tLoan`) | `{ amount: 200, date: d(-13), description: "Parity loan payment", accountId: "{checking}", toAccountId: "{loan}", type: "transfer", categoryTags: ["loans", "transfer"] }` | 201 |
| T09 | POST (save `tTom`) | `{ amount: 10, date: d(1), description: "Parity tomorrow", accountId: "{checking}", type: "debit", categoryTags: ["spending"] }` | 201 |
| T10 | POST (save `tFuture`) | `{ amount: 75, date: d(5), description: "Parity future bill", accountId: "{checking}", type: "debit", categoryTags: ["bills"] }` | 201 |
| T11 | POST | `{ amount: 50, date: d(6), description: "Parity future transfer", accountId: "{checking}", toAccountId: "{savings}", type: "transfer", categoryTags: ["transfer"] }` | 201 |
| T12 | POST (save `salary`) | `{ amount: 2100, date: d(-28), description: "Parity Salary", accountId: "{checking}", type: "credit", isRecurring: true, recurrenceRule: { frequency: "biweekly", startDate: d(-28) }, categoryTags: ["salary"] }` | 201 |
| T13 | POST (save `rent`) | `{ amount: 1450, date: som(-2), description: "Parity Rent", accountId: "{checking}", type: "debit", isRecurring: true, recurrenceRule: { frequency: "monthly", startDate: som(-2), dayOfMonth: 1 }, categoryTags: ["bills"] }` | 201 |
| T14 | POST (save `rent2`) | `{ amount: 1650, date: som(4), description: "Parity Rent (new lease)", accountId: "{checking}", type: "debit", isRecurring: true, recurrenceRule: { frequency: "monthly", startDate: som(4), endDate: som(16), dayOfMonth: 1 }, categoryTags: ["bills"] }` | 201 |
| T15 | POST | `{ amount: 20, date: dom(-3, 25), description: "Parity semi-monthly", accountId: "{checking}", type: "debit", isRecurring: true, recurrenceRule: { frequency: "semi_monthly", startDate: dom(-3, 25) }, categoryTags: ["other"] }` | 201 |
| T16 | POST | `{ amount: 80, date: dom(-3, 20), description: "Parity auto-save", accountId: "{checking}", toAccountId: "{savings}", type: "transfer", isRecurring: true, recurrenceRule: { frequency: "weekly", interval: 2, startDate: dom(-3, 20), endDate: "" }, categoryTags: ["transfer"] }` | 201 |
| T17 | POST | valid tx body with `type: "transfer"` and no `toAccountId` | 400 |
| T18 | POST | valid tx body with `type: "transfer", toAccountId: "{checking}"` | 400 |
| T19 | POST | valid tx body with `type: "transfer", toAccountId: B` | 400 |
| T20 | POST | valid tx body with `amount: 0` | 400 |
| T21 | POST | RAW | 500 → D1c, `Validation failed` |
| T22 | POST | valid tx body with `accountId: "abc"` | 500 |
| T23–T32 | GET `/api/transactions` with: (none); `?page=2&limit=5`; `?accountId={checking}&sort=date&order=asc&limit=100`; `?type=transfer&limit=100`; `?category=salary`; `?isRecurring=true`; `?isRecurring=false&limit=100`; `?search=PARITY%20f`; `?startDate=<d(-19)>&endDate=<d(-14)>&sort=date&order=asc`; `?sort=amount&order=asc&limit=100` | | 200 |
| T33 | GET `/api/transactions?accountId=abc` | | 500 |
| T34 | GET `/api/transactions/{tGroc}` | | 200 |
| T35 | GET `/api/transactions/B` | | 404 |
| T36 | GET `/api/transactions/abc` | | 500 → D1a, `Transaction not found` |
| T37 | PUT `/api/transactions/{tGroc}` | `{ amount: 130.25, date: d(-19), description: "Parity groceries (edited)", accountId: "{checking}", type: "debit", categoryTags: ["spending"] }` | 200 |
| T38 | PUT `/api/transactions/{tSub}` | T03's body with `date: d(7)` | 200 |
| T39 | PUT `/api/transactions/{tSub}` | T03's body | 200 |
| T40 | PUT `/api/transactions/{tSav}` | `{ amount: 500, date: d(-16), description: "Parity to savings", accountId: "{checking}", type: "debit", categoryTags: ["transfer"] }` | 200 |
| T41 | PUT `/api/transactions/{tTom}` | `{ amount: 10, date: d(1), description: "Parity tomorrow", accountId: "{checking}", type: "debit", isRecurring: true, recurrenceRule: { frequency: "weekly", startDate: d(1), dayOfWeek: 3 }, categoryTags: ["spending"] }` | 200 |
| T42 | PUT `/api/transactions/{tLoan}` | T08's body with `toAccountId: B` | 400 |
| T43 | GET `/api/accounts` | | 200 |
| T44 | PUT `/api/transactions/{tPay}` | T01's body with `amount: -5` | 400 |
| T45 | PUT `/api/transactions/B` | valid tx body | 404 |
| T46 | PUT `/api/transactions/abc` | valid tx body | 500 → D1a, `Transaction not found` |
| T47 | PUT `/api/transactions/{tPay}` | RAW | 500 → D1c, `Validation failed` |
| T48, T49, T50 | DELETE `/api/transactions/{tGroc}`, `{tAdv}`, `{tFuture}` | | 200 |
| T51 | DELETE `/api/transactions/B` | | 404 |
| T52 | DELETE `/api/transactions/abc` | | 500 → D1a, `Transaction not found` |
| T53 | POST `/api/transactions` | `{ amount: 100, date: d(-3), description: "Parity card charge", accountId: "{card}", type: "debit", categoryTags: ["spending"] }` | 201 |
| T54 | GET `/api/accounts` | | 200 |
| T55 | GET `/api/transactions?limit=100&sort=date&order=asc` | | 200 |
| P01 | GET `/api/accounts/{card}/payment-plan` | | 200 |
| P02 | GET `/api/accounts/{checking}/payment-plan` | | 400 |
| P03 | GET `/api/accounts/B/payment-plan` | | 404 |
| P04 | GET `/api/accounts/abc/payment-plan` | | 500 → D1a, `Account not found` |
| P05 | POST `/api/accounts/{card}/payment-plan` (save `cardPay` from `data.payment.transactionId`) | `{ fromAccountId: "{checking}", dayOfMonth: 15, startDate: dom(-3, 15), firstAmount: 45 }` | 200 |
| P06 | GET `/api/accounts` (catch-up payments post here: 45 + 45 + 10, capped at the 100 owed) | | 200 |
| P07 | POST `/api/accounts/{card}/payment-plan` | P05's body | 409 |
| P08 | POST `/api/accounts/{loan}/payment-plan` | `{ fromAccountId: "{card}", dayOfMonth: 5, startDate: d(10), firstAmount: 250 }` | 400 |
| P09 | POST `/api/accounts/{loan}/payment-plan` | `{ fromAccountId: "", dayOfMonth: 5, startDate: d(10), firstAmount: 250 }` | 400 |
| P10 | POST `/api/accounts/{loan}/payment-plan` | RAW | 500 → D1c |
| P11 | POST `/api/accounts/{loan}/payment-plan` (save `loanPay`) | `{ fromAccountId: "{checking}", dayOfMonth: 5, startDate: dom(-3, 5), firstAmount: 250 }` (backdated: its catch-up payments post at P12) | 200 |
| P12 | PUT `/api/accounts/{loan}/payment-plan` | `{ subLoans: [{ name: " Sub A ", balance: 12000, apr: 5.5 }, { name: "Sub B", balance: 8000, apr: 7 }] }` | 200 |
| P13 | PUT same | `{ rap: { enabled: true, autoSchedule: true, recertDate: "07-01", dependents: 1 } }` | 200 |
| P14 | PUT same | `{ schedule: [{ effectiveDate: dom(-3, 5), amount: 250 }, { effectiveDate: dom(6, 5), amount: 300 }] }` | 200 |
| P14b | GET `/api/transactions/{loanPay}` | | 200 |
| P15 | PUT same | P14's body again | 200 |
| P16 | GET `/api/transactions/{loanPay}` (its `updatedAt` marker must be `<same>`: P15 wrote nothing) | | 200 |
| P17 | PUT `/api/accounts/{card}/payment-plan` | `{ rap: { enabled: true, autoSchedule: true, recertDate: "07-01", dependents: 0 } }` | 400 |
| P18 | PUT same | `{ schedule: [{ effectiveDate: dom(-3, 15), amount: 55 }], rap: { enabled: true, autoSchedule: true, recertDate: "07-01", dependents: 0 } }` | 400 |
| P19 | GET `/api/transactions/{cardPay}` | | 200 |
| P20 | PUT `/api/accounts/{car}/payment-plan` | `{ schedule: [{ effectiveDate: d(10), amount: 100.5 }] }` | 409 |
| P21 | PUT `/api/accounts/{loan}/payment-plan` | `{ schedule: [{ effectiveDate: d(10), amount: 1 }, { effectiveDate: d(10), amount: 2 }] }` | 400 |
| F01 | GET `/api/finance-profile` | | 200 |
| F02 | PUT `/api/finance-profile` | `PROFILE` with `salarySteps: []` | 400 |
| F03 | PUT | `PROFILE` with `salaryTransactionId: B` | 409 |
| F04 | PUT | `PROFILE` with `rentTransactionId: B` | 409 |
| F05 | PUT | `PROFILE` | 200 |
| F05b, F05c | GET `/api/transactions/{salary}`, `/api/transactions/{rent}` | | 200 |
| F06 | PUT | `PROFILE` again | 200 |
| F07, F08 | GET `/api/transactions/{salary}`, `/api/transactions/{rent}` (both `updatedAt` markers must be `<same>`: F06 wrote nothing) | | 200 |
| F09 | GET `/api/accounts/{loan}/payment-plan` | | 200 |
| F10 | GET `/api/finance-profile` | | 200 |
| F11 | POST `/api/finance-profile/merge-rent` | `{ keepId: "{rent}", mergeId: "{rent2}" }` | 200 |
| F12 | POST same | `{ keepId: "{rent}", mergeId: "{rent}" }` | 400 |
| F13 | POST same | `{ keepId: "{rent}", mergeId: B }` | 404 |
| F14 | POST same | `{ keepId: "{rent}", mergeId: "{tPay}" }` | 404 |
| F15 | POST same | RAW | 500 → D1c, `keepId and mergeId must be two different transactions` |
| F16 | GET `/api/transactions/{rent}` | | 200 |
| F17 | PUT `/api/finance-profile` | `PROFILE` with `rentTransactionId: null` | 200 |
| F18 | GET `/api/transactions/{rent}` | | 200 |
| F19 | PUT `/api/finance-profile` | `PROFILE` with `rentSteps: []` | 200 |
| F20 | PUT `/api/finance-profile` | RAW | 500 → D1c |
| R01 | GET `/api/projections` | | 400 |
| R02 | GET `/api/projections?startDate=<som(0)>&endDate=<eom(0)>&granularity=daily` | | 200 |
| R03 | GET `…?startDate=<som(0)>&endDate=<eom(6)>&granularity=monthly` | | 200 |
| R04 | GET `…?startDate=<som(2)>&endDate=<eom(4)>&granularity=weekly` | | 200 |
| R05, R06 | GET `…?startDate=<d(-30)>&endDate=<d(60)>&accountId={checking}`, then `{savings}` | | 200 |
| R07 | GET `…?startDate=1900-01-01&endDate=2100-01-01` | | 400 |
| R08 | GET `…?startDate=<som(0)>&endDate=<eom(0)>&accountId=abc` | | 500 |
| R09 | GET `…?startDate=garbage&endDate=<eom(0)>` | | 400 (`Invalid time value`: `queryStart` falls back to today, then the engine throws `RangeError`) |
| R10 | POST `/api/projections` | `{ startDate: som(0), endDate: eom(3), granularity: "weekly", sandbox: { added: [{ id: "sandbox-1", data: { amount: 999, date: d(12), description: "Parity what-if", accountId: "{checking}", type: "debit", categoryTags: ["spending"] } }], edited: { "{salary}": T12's body with amount: 2500 }, removed: ["{tPay}"], profile: null } }` | 200 |
| R11 | POST | `{ startDate: som(0), endDate: eom(3), sandbox: { profile: PROFILE with salarySteps[0].annualGross: 99000 } }` | 200 |
| R12 | POST | `{}` | 400 |
| R13 | POST | RAW | 500 → D1c, `Invalid projection request` |
| R14–R17 | GET `/api/summary?view=monthly&date=<T>`, `view=weekly`, `view=annual`, `view=bogus` | | 200 |
| R18 | GET `/api/summary?view=monthly&date=garbage` | | 400 |
| R19, R20 | GET `/api/summary?view=monthly&date=<T>&accountId={checking}`, then `{savings}` | | 200 |
| R21 | GET `/api/summary?view=monthly&date=<T>T12:00:00.000Z` | | 200 |
| R22 | GET `/api/summary` | | 200 |
| R23 | GET `/api/summary?accountId=abc` | | 500 |
| Z01 | DELETE `/api/accounts/{cash}` | | 403 |
| Z02 | DELETE `/api/accounts/B` | | 404 |
| Z03 | DELETE `/api/accounts/abc` | | 500 → D1a, `Account not found` |
| Z04 | DELETE `/api/transactions/{loanPay}` | | 200 |
| Z05 | GET `/api/accounts/{loan}/payment-plan` | | 200 |
| Z06 | DELETE `/api/accounts/{card}/payment-plan` | | 200 |
| Z07 | GET `/api/accounts/{card}/payment-plan` | | 200 |
| Z08 | DELETE `/api/accounts/{savings}` | | 200 |
| Z09 | GET `/api/accounts?includeArchived=true` (source of `finalBalances`: account name → `balance`) | | 200 |
| Z10 | GET `/api/transactions?limit=100&sort=date&order=asc` | | 200 |
| Z11 | GET `/api/finance-profile` | | 200 |
| Z12 | GET `/api/categories` | | 200 |

`PROFILE` = `{ filingStatus: "single", hoursPerWeek: 40, nycResident: true, raiseRate: 0.03, salaryTransactionId: "{salary}", rentTransactionId: "{rent}", salarySteps: [{ effectiveDate: som(-14), annualGross: 85000 }, { effectiveDate: som(3), annualGross: 92000 }], retirementSteps: [{ effectiveDate: som(-14), percent: 0.06 }], healthSteps: [{ effectiveDate: som(-14), perPaycheck: 85 }], rentSteps: [{ effectiveDate: som(-2), monthly: 1450 }, { effectiveDate: som(2), monthly: 1525 }], whatIfSalaries: [{ label: "  Stretch ", annualGross: 120000 }, { annualGross: 70000 }] }`.

- [ ] **Step 1: Write the failing tests** in `src/lib/finance/api/parity-normalize.test.ts` (imports are relative: `../../../../scripts/finance-parity/normalize` and `…/scenario`).

```ts
const A = "a".repeat(24), B = "b".repeat(24), C = "c".repeat(24);

test("normalizer: aliases ids, sorts keys, drops createdAt and __v, marks updatedAt", () => {
  const n = createNormalizer(() => ({ checking: A }));
  assert.equal(
    JSON.stringify(n({ name: "x", _id: A, __v: 0, createdAt: "c", updatedAt: "2026-01-01T10:00:00.000Z", linked: B, when: "2026-01-01T00:00:00.000Z" })),
    '{"_id":"<checking>","linked":"<id:1>","name":"x","updatedAt":"<new>","when":"2026-01-01T00:00:00.000Z"}',
  );
  assert.deepEqual(n({ _id: A, updatedAt: "2026-01-01T10:00:00.000Z" }), { _id: "<checking>", updatedAt: "<same>" });
  assert.deepEqual(n({ _id: A, updatedAt: "2026-01-01T10:00:05.000Z" }), { _id: "<checking>", updatedAt: "<changed>" });
  assert.deepEqual(n({ date: "2026-01-01T10:00:05.123Z", balances: { [C]: 5, [B]: 1 } }), { balances: { "<id:1>": 1, "<id:2>": 5 }, date: "<instant>" });
  assert.deepEqual(n({ updatedAt: "x", a: 1 }), { a: 1 });
});

test("normalizer: dataVersion keeps counts and balances, marks each timestamp", () => {
  const n = createNormalizer(() => ({ checking: A, savings: B }));
  assert.deepEqual(n({ dataVersion: `3|1000|0|${B}:500:20,${A}:100:10` }), { dataVersion: "3|<new>|<new>|<checking>:100:<new>,<savings>:500:<new>" });
  assert.deepEqual(n({ dataVersion: `3|1000|0|${A}:100:10,${B}:700:25` }), { dataVersion: "3|<same>|<same>|<checking>:100:<same>,<savings>:700:<changed>" });
});

test("substitute fills {name} in strings and in object keys", () => {
  assert.deepEqual(substitute({ path: "/x/{a}", edited: { "{a}": { id: "{a}" } }, n: 1 }, { a: A }), { path: `/x/${A}`, edited: { [A]: { id: A } }, n: 1 });
});

test("compareTranscripts: equal passes; an allowed step compares status and error only; anything else is reported", () => {
  const steps = [
    { id: "S1", method: "GET", path: "/a", expect: 200 },
    { id: "S2", method: "GET", path: "/a/abc", expect: 500, allow: { rule: "D1a", status: 404, error: "Account not found" } },
  ] as Step[];
  const meta = { capturedAt: "", localDate: "", timeZone: "", commit: "" };
  const golden = { meta, finalBalances: { Cash: 0 }, steps: [{ id: "S1", request: "GET /a", status: 200, body: [1] }, { id: "S2", request: "GET /a/abc", status: 500, body: { error: "Failed to fetch account" } }] };
  const after = { meta, finalBalances: { Cash: 0 }, steps: [golden.steps[0], { id: "S2", request: "GET /a/abc", status: 404, body: { error: "Account not found" } }] };
  assert.deepEqual(compareTranscripts(golden, after, steps), []);
  assert.equal(compareTranscripts(golden, golden, steps).length, 1); // S2 did not change to the allowed result
  assert.equal(compareTranscripts(golden, { ...after, finalBalances: { Cash: 1 } }, steps).length, 1);
  assert.equal(compareTranscripts(golden, { ...after, steps: [{ ...golden.steps[0], body: [2] }, after.steps[1]] }, steps).length, 1);
});

test("scenario: unique step ids, relative dates, distinct amounts and dates among created transactions", () => {
  const steps = buildScenario("2026-11-17");
  assert.equal(new Set(steps.map((s) => s.id)).size, steps.length);
  assert.equal(steps.length, 170);
  const created = steps.filter((s) => s.method === "POST" && s.path === "/api/transactions" && s.expect === 201).map((s) => s.body as { amount: number; date: string });
  assert.equal(new Set(created.map((b) => b.amount)).size, created.length);
  assert.equal(new Set(created.map((b) => b.date)).size, created.length);
  assert.equal((steps.find((s) => s.id === "T09")!.body as { date: string }).date, "2026-11-18");
  assert.equal((steps.find((s) => s.id === "T13")!.body as { date: string }).date, "2026-09-01");
  assert.equal(steps.filter((s) => s.allow?.rule === "D1a").length, 8);
  assert.equal(steps.filter((s) => s.allow?.rule === "D1c").length, 8);
  assert.deepEqual(buildScenario("2026-11-17"), buildScenario("2026-11-17"));
});

test("scenario: recurring transactions from the checking account are created in descending stored-date order", () => {
  for (const today of ["2026-11-17", "2026-12-01", "2027-01-31", "2027-03-15"]) {
    const steps = buildScenario(today);
    const stored = (id: string) => {
      const b = steps.find((s) => s.id === id)!.body as { date?: string; startDate?: string };
      return b.date ?? b.startDate!;
    };
    const dates = ["T09", "T12", "T13", "T15", "T16", "P05", "P11"].map(stored);
    assert.deepEqual(dates, [...dates].sort().reverse(), today);
    assert.equal(new Set(dates).size, dates.length, today);
  }
});

test("order check: a day whose same-kind entries are in creation order but not stored-date-descending order is reported", () => {
  const created = [{ _id: "x", date: "2026-08-01T00:00:00.000Z" }, { _id: "y", date: "2026-09-01T00:00:00.000Z" }];
  const day = (ids: string[]) => ({ date: "2026-12-01", transactions: ids.map((id) => ({ sourceTransactionId: id, isRecurring: true })) });
  assert.equal(dayOrderConflicts([day(["x", "y"])], created).length, 1);
  assert.deepEqual(dayOrderConflicts([day(["y"]), day(["x"])], created), []);
  assert.deepEqual(dayOrderConflicts([day(["y", "x"])], [created[1], created[0]]), []);
});
```

- [ ] **Step 2: Run** `npm test` — the new file fails (modules missing).
- [ ] **Step 3: Implement** `scenario.ts`, `normalize.ts`, `run.ts`, `reset-db.mjs`. `run.ts` sleeps nowhere; it sends each step in order, saves ids, normalizes, and for `capture` writes `{ meta, steps, finalBalances }` with two-space indentation and a trailing newline. `meta.capturedAt` is the instant the run started, `meta.localDate` the `today` it passed to `buildScenario`, `meta.timeZone` is `process.env.TZ` (must be `America/New_York`, else abort), `meta.commit` is the output of `git rev-parse HEAD`.
- [ ] **Step 4: Run** `npm test`, `npx tsc --noEmit`, `npx eslint scripts/finance-parity src/lib/finance/api` — clean.
- [ ] **Step 5: Capture the golden from the unchanged code.** With no server on 3032: `node scripts/finance-parity/reset-db.mjs`; start the parity server (Global Constraints); `… run.ts capture --base http://localhost:3032 --out scripts/finance-parity/golden/transcript.json`; then, without resetting, run `… run.ts capture` once more into a scratch file and confirm it is refused by the empty-dataset guard. Reset, restart the server, capture a second time into a scratch file and confirm `compareTranscripts` of the two captures (ignoring `allow`: pass an empty step list) reports no differences — this proves the transcript is deterministic. Stop the server. If any `expect` mismatched, stop and report which step and what came back.
- [ ] **Step 6: Confirm five facts in the captured transcript** and quote them in the task report; if any differs, stop and report, because later tasks rely on them: (1) R09 is 400 `{ "error": "Invalid time value" }`; (2) the `updatedAt` markers in P16, F07 and F08 are `<same>`; (3) the keys of `details` in T17's body are `["message", "name"]`; (4) T41's `recurrenceRule` has `interval: 1`, `endDate: null`, `daysOfMonth: []`; (5) C02 is 400 `Category already exists`.
- [ ] **Step 7: Commit** `test(finance): parity scenario and golden transcript from the unconverted routes`, then `git tag finance-parity-base`.

---

### Task 2: Dotted paths and `$and` in the query evaluator (D4)

Model tier: standard.

**Files:**
- Modify: `src/lib/data/query.ts`
- Test: `src/lib/data/query.test.ts` (replace the test "dotted paths fail loudly in filters and updates")

**Interfaces:**
- Consumes: existing `matches`, `applyUpdate`, `sortDocs`.
- Produces (same exported names and signatures; new behavior):
  - A key containing `.` in a filter, a sort, or `$set` / `$unset` / `$inc` / `$setOnInsert` is a path through nested plain objects.
  - Reading: a missing, `null` or non-object intermediate yields `undefined` (so `null` equality and `$exists: false` match, comparisons do not). An array at an intermediate position throws `Error("Dotted path crosses an array: <key>")`.
  - Writing: `$set`, `$inc`, `$setOnInsert` create missing intermediate objects; an intermediate that exists and is not a plain object (including `null`) throws `Error("Cannot create field in <key>")`; an array throws the array error. `$unset` removes the leaf and is a no-op when an intermediate is missing. The input document is never mutated.
  - `$and: Filter[]` is accepted wherever `$or` is; a non-array throws `Error("$and needs an array")`.
  - Nothing changes in `mongo-store.ts`: MongoDB supports all of this natively.
  - Not extended, because nothing in Finance or the converted modules uses them: a dotted key in an upsert filter's equality fields, in `distinct`, in `select`, or in a collection's `unique` list is still treated as a literal top-level key.

- [ ] **Step 1: Write the failing tests.**

```ts
test("dotted paths in filters reach into nested objects", () => {
  const doc = { rule: { start: "2026-01-01T00:00:00.000Z", end: null }, rap: { enabled: true } };
  assert.equal(matches(doc, { "rule.start": { $lte: new Date("2026-06-01") } }), true);
  assert.equal(matches(doc, { "rule.end": null }), true);
  assert.equal(matches(doc, { "rule.end": { $exists: false } }), false);
  assert.equal(matches(doc, { "rule.missing": { $exists: false } }), true);
  assert.equal(matches({}, { "rule.end": null }), true);
  assert.equal(matches({}, { "rule.end": { $gte: "2026" } }), false);
  assert.equal(matches({ rule: null }, { "rule.end": { $exists: false } }), true);
  assert.equal(matches({ rule: 5 }, { "rule.end": null }), true);
  assert.equal(matches(doc, { "rap.enabled": true }), true);
  assert.equal(matches({ rap: { enabled: false } }, { "rap.enabled": true }), false);
  assert.equal(matches(doc, { $or: [{ "rule.end": { $gte: "2027" } }, { "rule.end": null }] }), true);
});

test("$and requires every branch, at the top level and nested with $or", () => {
  const doc = { a: 1, b: 2 };
  assert.equal(matches(doc, { $and: [{ a: 1 }, { b: 2 }] }), true);
  assert.equal(matches(doc, { $and: [{ a: 1 }, { b: 3 }] }), false);
  assert.equal(matches(doc, { $and: [{ $or: [{ a: 9 }, { b: 2 }] }, { a: 1 }] }), true);
  assert.equal(matches(doc, { $or: [{ $and: [{ a: 1 }, { b: 3 }] }, { b: 2 }] }), true);
  assert.throws(() => matches(doc, { $and: { a: 1 } }), /\$and needs an array/);
});

test("dotted $set / $unset / $inc write into nested objects without touching siblings or the input", () => {
  const doc = { rule: { start: "a", end: "b" }, n: { count: 1 } };
  assert.deepEqual(applyUpdate(doc, { $set: { "rule.end": null } }), { rule: { start: "a", end: null }, n: { count: 1 } });
  assert.deepEqual(applyUpdate(doc, { $unset: { "rule.end": 1 } }), { rule: { start: "a" }, n: { count: 1 } });
  assert.deepEqual(applyUpdate(doc, { $inc: { "n.count": 2, "n.other": 5 } }), { rule: { start: "a", end: "b" }, n: { count: 3, other: 5 } });
  assert.deepEqual(applyUpdate({}, { $set: { "a.b.c": 1 } }), { a: { b: { c: 1 } } });
  assert.deepEqual(applyUpdate({}, { $setOnInsert: { "a.b": 1 } }, true), { a: { b: 1 } });
  assert.deepEqual(applyUpdate({}, { $unset: { "a.b": 1 } }), {});
  assert.deepEqual(doc, { rule: { start: "a", end: "b" }, n: { count: 1 } });
  assert.throws(() => applyUpdate({ a: 5 }, { $set: { "a.b": 1 } }), /Cannot create field in a\.b/);
  assert.throws(() => applyUpdate({ a: null }, { $set: { "a.b": 1 } }), /Cannot create field in a\.b/);
});

test("a dotted path through an array throws, in filters and updates", () => {
  assert.throws(() => matches({ steps: [{ a: 1 }] }, { "steps.a": 1 }), /Dotted path crosses an array: steps\.a/);
  assert.throws(() => matches({ steps: [] }, { $or: [{ a: 9 }, { "steps.a": 1 }] }), /Dotted path crosses an array: steps\.a/);
  assert.equal(matches({ a: 1 }, { "steps.a": { $exists: false } }), true);
  assert.throws(() => applyUpdate({ steps: [{ a: 1 }] }, { $set: { "steps.0.a": 2 } }), /Dotted path crosses an array: steps\.0\.a/);
});

test("sort follows dotted paths", () => {
  assert.deepEqual(sortDocs([{ r: { d: "b" } }, { r: { d: "a" } }, {}], { "r.d": 1 }), [{}, { r: { d: "a" } }, { r: { d: "b" } }]);
});
```

The array check depends on the document: it fires only when the document being tested has an array on the path (last assertion of the array test).

- [ ] **Step 2: Run** `npm test` — the new tests fail.
- [ ] **Step 3: Implement.** Remove `assertFlat` / `assertFilterFlat`.
- [ ] **Step 4: Run** `npm test`, `npx tsc --noEmit`, `npx eslint src/lib/data` — clean; the Links and Future handler tests still pass.
- [ ] **Step 5: Commit** `feat(data): dotted paths through nested objects and $and in the query evaluator`

---

### Task 3: A clock in the handler context (D9)

Model tier: mechanical.

**Files:**
- Modify: `src/lib/data/api.ts`, `src/lib/data/dispatch.ts`, `src/lib/data/serve.ts`
- Test: `src/lib/data/dispatch.test.ts`

**Interfaces:**
- Produces:
  - `HandlerContext` gains `now: Date` (required).
  - `dispatch(routes: RouteDef[], store: Store, method: string, url: string, body?: unknown, now: Date = new Date()): Promise<ApiResult>` passes `now` to the handler.
  - `serve` passes `now: new Date()`, created once per request immediately before the handler runs.
  - `src/lib/data/local.ts` is unchanged (it uses the default).

- [ ] **Step 1: Write the failing test.**

```ts
test("dispatch hands the handler the clock it was given, and the current time by default", async () => {
  const routes: RouteDef[] = [{ method: "GET", path: "/api/now", handler: async ({ now }) => ok(now.toISOString()) }];
  const store = new BrowserStore(memoryStorage());
  const fixed = new Date("2026-11-17T15:00:00.000Z");
  assert.deepEqual(await dispatch(routes, store, "GET", "/api/now", undefined, fixed), { status: 200, body: "2026-11-17T15:00:00.000Z" });
  const before = Date.now();
  const body = (await dispatch(routes, store, "GET", "/api/now")).body as string;
  assert.ok(Date.parse(body) >= before && Date.parse(body) <= Date.now());
});
```

- [ ] **Step 2: Run** `npm test` — fails to compile (`now` is not on the context).
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test`, `npx tsc --noEmit`, `npx eslint src/lib/data` — clean.
- [ ] **Step 5: Commit** `feat(data): pass a clock to route handlers`

---

### Task 4: Store updates that leave `updatedAt` alone; `skip` passed through

Model tier: standard.

**Files:**
- Modify: `src/lib/data/store.ts`, `src/lib/data/browser-store.ts`, `src/lib/data/mongo-store.ts`
- Test: `src/lib/data/browser-store.test.ts`, `src/lib/data/mongo-store.test.ts`

**Interfaces:**
- Produces:
  - `Collection<T>.updateById(id: string, update: Update, options?: { timestamps?: boolean }): Promise<T | null>`. With `{ timestamps: false }` the update is applied and the stored `updatedAt` is left exactly as it was; omitted or `true` behaves as today. No other method gains the option.
  - Browser store: with `timestamps: false`, `updateById` keeps the document's `updatedAt` (and `_id`, `createdAt` as always); unique checks and the storage write are unchanged.
  - Mongo store: `export function updateByIdOptions(options?: { timestamps?: boolean }): { returnDocument: "after"; runValidators: true; timestamps?: false }`, passed to `findByIdAndUpdate`. `timestamps: false` is Mongoose's documented per-query switch (`node_modules/mongoose/lib/query.js`, `findOneAndUpdate` options: "If set to `false` and schema-level timestamps are enabled, skip timestamps for this update"; stored on the query at `query.js:1767`). The key is present only when `false` was asked for.
  - Mongo store: `export function passesSkip(skip: number | undefined): boolean` — `skip !== undefined && skip !== 0`; `list` calls `query.skip(options.skip)` when it is true. Today `if (options.skip)` drops `NaN`, which the unconverted transactions route passes to MongoDB for `?page=abc`; negative values already pass.
- Why this exists: a Mongoose `save()` that only persists schema defaults onto an old document writes them without changing `updatedAt` (`lib/helpers/timestamps/setDocumentTimestamps.js`: `updatedAt` is set only when `doc.isNew || doc.$isModified()`, and default-state paths are not modifications). Task 6's `saveAccount` / `saveTransaction` need the same.

- [ ] **Step 1: Write the failing tests.** In `browser-store.test.ts`:

```ts
test("updateById with timestamps: false changes the document and leaves updatedAt alone", async () => {
  const store = new BrowserStore(memoryStorage());
  const links = store.collection<BaseDoc & { name: string; n?: number }>("links");
  const made = await links.insert({ name: "a" });
  await new Promise((r) => setTimeout(r, 5));
  const quiet = await links.updateById(made._id, { $set: { n: 1 } }, { timestamps: false });
  assert.deepEqual([quiet!.n, quiet!.updatedAt, quiet!.createdAt], [1, made.updatedAt, made.createdAt]);
  assert.equal((await links.findById(made._id))!.updatedAt, made.updatedAt);
  const loud = await links.updateById(made._id, { $set: { n: 2 } });
  assert.ok(loud!.updatedAt > made.updatedAt);
  assert.equal(await links.updateById("a".repeat(24), { $set: { n: 3 } }, { timestamps: false }), null);
});
```

In `mongo-store.test.ts` (no database is opened; these are the values handed to Mongoose):

```ts
test("updateById options: validators always on, timestamps off only on request", () => {
  assert.deepEqual(updateByIdOptions(), { returnDocument: "after", runValidators: true });
  assert.deepEqual(updateByIdOptions({ timestamps: true }), { returnDocument: "after", runValidators: true });
  assert.deepEqual(updateByIdOptions({ timestamps: false }), { returnDocument: "after", runValidators: true, timestamps: false });
});

test("skip reaches MongoDB for every number except 0", () => {
  assert.deepEqual([undefined, 0, 20, -20, NaN].map(passesSkip), [false, false, true, true, true]);
});
```

- [ ] **Step 2: Run** `npm test` — the new tests fail.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test`, `npx tsc --noEmit`, `npx eslint src/lib/data` — clean.
- [ ] **Step 5: Commit** `feat(data): updateById can leave updatedAt alone; pass skip through to MongoDB`

---

### Task 5: Date helpers and ISO-string dates in the pure libraries (D3)

Model tier: standard.

**Files:**
- Modify: `src/lib/finance/dates.ts`, `src/lib/finance/projection-engine.ts`
- Test: `src/lib/finance/dates.test.ts` (new), `src/lib/finance/projection-string-dates.test.ts` (new)

**Interfaces:**
- Produces, in `src/lib/finance/dates.ts`:
  - `asDate(value: Date | string): Date` — the same `Date` object when given one, else `new Date(value)`.
  - `toIso(value: Date | string): string` — what Mongoose's date cast stores, as an ISO string. A `Date` is used as is; a string for which `Number(value)` is a number and is `>= 275761` or `< -271820` is read as milliseconds; any other string goes through `new Date(value)`. An invalid date (including `""`) throws `new Error("Invalid date: " + value)` — a plain `Error`, never a `RangeError`, because the projections and summary handlers turn `RangeError` into a 400 and today these inputs are a Mongoose cast error (500).
  - `filterDate(value: string): string` — for a date that goes into a **filter** (query-string bounds), where today's code builds `new Date(value)` itself: `const d = new Date(value); if (Number.isNaN(d.getTime())) throw new Error("Invalid date: " + value); return d.toISOString();`. A plain `Error` (500), as the Mongoose cast of an Invalid Date is today. Unlike `toIso` it does not read numeric strings as milliseconds. `toIso` is only for values that are stored. Doc comment on `toIso`: Mongoose casts `""` to `null`, and every Finance field that can receive `""` is then refused as required (500), so throwing gives the same result; `buildRule` handles the one optional date (`endDate`) before calling it.
  - `localDateStr(now: Date): string` — `format(now, "yyyy-MM-dd")`. `localTodayStr()` stays exported and becomes `localDateStr(new Date())`.
  - `startOfTomorrow(now: Date): Date` — a copy of `now` with `setHours(0, 0, 0, 0)` then `setDate(getDate() + 1)` (local time, as the three route files compute it today).
- Produces, in `src/lib/finance/projection-engine.ts`:
  - `export interface EngineAccount` and `export interface EngineTransaction`: structural types replacing `IAccount` / `ITransaction` (delete both `import type … from "@/models/…"` lines). Ids are `{ toString(): string }`; `EngineTransaction.date`, `recurrenceRule.startDate` are `Date | string`; `recurrenceRule.endDate` is `Date | string | null | undefined`; `amountSchedule` is `AmountStep[] | undefined`. Declare exactly the properties the engine reads (the compiler lists them once the model types are gone), with the types the models declare.
  - `ProjectionInput.accounts: EngineAccount[]`, `.transactions: EngineTransaction[]`. `buildProjection`'s signature and results are otherwise unchanged.
- Call sites that change (the only places a fetched date is used as a `Date` object; verified against the inventory §5 list):
  - `src/lib/finance/projection-engine.ts:109` → `startDate: asDate(rule.startDate).toISOString()`
  - `src/lib/finance/projection-engine.ts:110` → `endDate: rule.endDate ? asDate(rule.endDate).toISOString() : null`
  - `payment-plan.ts:111-112` and `:212-213`, and `projections/route.ts:38,41`, are rewritten the same way when their logic moves (Tasks 9 and 11); the old files are not edited.
  - `recurrence.ts`, `posting.ts`, `rap.ts`, `amount-schedule.ts`, `projection-sandbox.ts` already accept both through `toDateStr` / `normalizeDate`: no change.

- [ ] **Step 1: Write the failing tests.** `src/lib/finance/dates.test.ts` (`npm test` runs in `America/New_York`):

```ts
test("toIso stores what Mongoose's date cast stores", () => {
  assert.equal(toIso("2026-11-01"), "2026-11-01T00:00:00.000Z");
  assert.equal(toIso("2026-11-01T12:34:56.000Z"), "2026-11-01T12:34:56.000Z");
  assert.equal(toIso(new Date("2026-11-01")), "2026-11-01T00:00:00.000Z");
  assert.equal(toIso("2026"), "2026-01-01T00:00:00.000Z");
  assert.equal(toIso("1767225600000"), "2026-01-01T00:00:00.000Z");
  for (const bad of ["garbage", "", " "]) {
    assert.throws(() => toIso(bad), (e: Error) => /Invalid date/.test(e.message) && !(e instanceof RangeError));
  }
});

test("filterDate is new Date(s).toISOString() with a plain Error for an invalid date", () => {
  assert.equal(filterDate("2026-11-01"), "2026-11-01T00:00:00.000Z");
  for (const bad of ["garbage", "1garbage", "1767225600000", ""]) {
    assert.throws(() => filterDate(bad), (e: Error) => /Invalid date/.test(e.message) && !(e instanceof RangeError));
  }
});

test("asDate passes Dates through and parses strings", () => {
  const d = new Date("2026-11-01T00:00:00.000Z");
  assert.equal(asDate(d), d);
  assert.equal(asDate("2026-11-01T00:00:00.000Z").getTime(), d.getTime());
});

test("localDateStr and startOfTomorrow use the local calendar day of the given clock", () => {
  assert.equal(localDateStr(new Date("2026-11-17T15:00:00.000Z")), "2026-11-17");
  assert.equal(localDateStr(new Date("2026-11-17T03:00:00.000Z")), "2026-11-16");
  assert.equal(startOfTomorrow(new Date("2026-11-17T15:00:00.000Z")).toISOString(), "2026-11-18T05:00:00.000Z");
  const now = new Date("2026-11-17T15:00:00.000Z");
  startOfTomorrow(now);
  assert.equal(now.toISOString(), "2026-11-17T15:00:00.000Z");
});
```

`src/lib/finance/projection-string-dates.test.ts` (characterization: the engine gives the same result for stored-as-string documents as for `Date` documents):

```ts
const id = (s: string) => ({ toString: () => s });
const accounts = [{ _id: id("bank"), type: "bank", balance: 500_000, isArchived: false }, { _id: id("card"), type: "credit_card", balance: 20_000, isArchived: false }];
const txs = (date: (s: string) => Date | string) => [
  { _id: id("once"), amount: 1_000, date: date("2026-11-10"), description: "once", accountId: id("bank"), type: "debit", isRecurring: false, categoryTags: ["spending"], balanceApplied: true },
  { _id: id("rent"), amount: 150_000, date: date("2026-09-01"), description: "rent", accountId: id("bank"), type: "debit", isRecurring: true, categoryTags: ["bills"], balanceApplied: false,
    recurrenceRule: { frequency: "monthly", interval: 1, startDate: date("2026-09-01"), endDate: date("2027-06-01"), dayOfMonth: 1, daysOfMonth: [] },
    amountSchedule: [{ effectiveDate: date("2026-09-01"), amount: 150_000 }, { effectiveDate: date("2027-01-01"), amount: 160_000 }] },
  { _id: id("pay"), amount: 5_000, date: date("2026-10-15"), description: "pay", accountId: id("bank"), toAccountId: id("card"), type: "transfer", isRecurring: true, categoryTags: ["credit", "transfer"], balanceApplied: false,
    recurrenceRule: { frequency: "monthly", interval: 1, startDate: date("2026-10-15"), endDate: null, dayOfMonth: 15, daysOfMonth: [] } },
];
const run = (date: (s: string) => Date | string) =>
  buildProjection({ accounts: accounts as never, transactions: txs(date) as never, startDate: new Date("2026-11-01"), endDate: new Date("2027-03-31"), granularity: "monthly", today: "2026-11-17" });

test("buildProjection gives the same result for ISO-string dates as for Date objects", () => {
  const withDates = run((s) => new Date(s));
  assert.ok(withDates.timeline.length > 0 && withDates.timeline.some((d) => d.transactions.length > 0));
  assert.deepEqual(run((s) => new Date(s).toISOString()), withDates);
});
```

- [ ] **Step 2: Run** `npm test` — `dates.test.ts` fails (missing exports); the string-dates test fails with a `TypeError` at `rule.startDate.toISOString`.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test` (all fifteen existing Finance test files pass unchanged), `npx tsc --noEmit`, `npx eslint src/lib/finance` — clean. Confirm `grep -n "@/models" src/lib/finance/projection-engine.ts` prints nothing.
- [ ] **Step 5: Commit** `feat(finance): date helpers and ISO-string dates in the projection engine`

---

### Task 6: Finance collections, document shapes and save semantics (D5, D6, D7)

Model tier: most capable (this file decides what every later task stores and returns).

**Files:**
- Modify: `src/lib/data/store.ts` — add to `COLLECTIONS`: `accounts: { unique: [] }`, `transactions: { unique: [] }`, `financeCategories: { unique: ["name"] }`, `financeProfile: { unique: [] }`
- Modify: `src/lib/data/mongo-store.ts` — add to `MODELS`: `accounts → Account`, `transactions → Transaction`, `financeCategories → Category`, `financeProfile → FinanceProfile` (from `src/models/finance/`)
- Create: `src/lib/finance/api/docs.ts`, `src/lib/finance/api/test-helpers.ts`
- Test: `src/lib/finance/api/docs.test.ts`; update `src/lib/data/store.test.ts` if it enumerates collection names

**Interfaces:**
- Consumes: `Store`, `Collection`, `BaseDoc` (`src/lib/data/store.ts`); `updateById`'s `{ timestamps: false }` option (Task 4); `Update` (`src/lib/data/query.ts`); `isId` (`src/lib/data/api.ts`); `toIso`, `toDateStr` (`src/lib/finance/dates.ts`); `DEFAULT_PROFILE` (`src/lib/finance/finance-profile.ts`); `Account`, `Category`, `RecurrenceFrequency`, `TransactionType`, `FinanceProfileData` types.
- Produces, in `docs.ts`:

```ts
export type AccountDoc = Account;            // src/types/finance/account.ts
export type CategoryDoc = Category;          // src/types/finance/category.ts
export interface StoredRule { frequency: RecurrenceFrequency; interval: number; startDate: string; endDate: string | null; dayOfWeek?: number; dayOfMonth?: number; daysOfMonth: number[] }
export interface TransactionDoc extends BaseDoc {
  amount: number; date: string; description: string; accountId: string; toAccountId?: string; type: TransactionType;
  isRecurring: boolean; recurrenceRule?: StoredRule; amountSchedule?: { effectiveDate: string; amount: number; source?: "rap" }[];
  postedThrough?: string | null; categoryTags: string[]; notes?: string; balanceApplied: boolean;
}
export interface ProfileDoc extends BaseDoc {
  filingStatus: FinanceProfileData["filingStatus"]; hoursPerWeek: number; nycResident: boolean; raiseRate: number;
  salaryTransactionId: string | null; rentTransactionId: string | null;
  salarySteps: { effectiveDate: string; annualGross: number }[]; retirementSteps: { effectiveDate: string; percent: number }[];
  healthSteps: { effectiveDate: string; perPaycheck: number }[]; rentSteps: { effectiveDate: string; monthly: number }[];
  whatIfSalaries: { label?: string; annualGross: number }[];
}
export const accounts: (store: Store) => Collection<AccountDoc>;          // "accounts"
export const transactions: (store: Store) => Collection<TransactionDoc>;  // "transactions"
export const categories: (store: Store) => Collection<CategoryDoc>;       // "financeCategories"
export const profiles: (store: Store) => Collection<ProfileDoc>;          // "financeProfile"

export function shapeAccount(raw: AccountDoc): AccountDoc;
export function shapeTransaction(raw: TransactionDoc): TransactionDoc;
export function shapeCategory(raw: CategoryDoc): CategoryDoc;
export function profileFromDoc(doc: ProfileDoc | null): FinanceProfileData;                 // dates yyyy-MM-dd, ids string | null
export function profileToDoc(p: FinanceProfileData): Omit<ProfileDoc, keyof BaseDoc>;       // dates via toIso, ids `|| null`, labels trimmed
export function loadProfile(store: Store): Promise<FinanceProfileData>;                     // profileFromDoc(await profiles(store).findOne({}))

export function buildRule(rule: { frequency: RecurrenceFrequency; interval?: number; startDate: string; endDate?: string | null; dayOfWeek?: number; dayOfMonth?: number; daysOfMonth?: number[] }): StoredRule;
export function requiredText(value: string, field: string): string;   // trimmed; throws Error(`${field} is required`) when empty after trimming
export function assertId(value: string): void;                         // throws Error("Invalid id") unless isId(value)

export function accountDefaults(raw: Record<string, unknown>): Record<string, unknown>;
export function transactionDefaults(raw: Record<string, unknown>): Record<string, unknown>;
export function saveUpdate(current: Record<string, unknown>, defaults: Record<string, unknown>, changes: Record<string, unknown>): { $set: Record<string, unknown>; touch: boolean } | null;
export function saveAccount(store: Store, raw: AccountDoc, changes: Record<string, unknown>): Promise<void>;
export function saveTransaction(store: Store, raw: TransactionDoc, changes: Record<string, unknown>): Promise<void>;
export function ensureCashAccount(store: Store): Promise<void>;
```

- `shape*` return a new object: the raw document plus the "fills when missing" values from the collections table; a field that is present (even `false`, `0`, `[]`) is never overwritten; `recurrenceRule` / `rap` are only touched when present. `buildRule` and `profileToDoc` never emit a key whose value is `undefined`. `buildRule`'s `endDate` is `null` for `undefined`, `null` and `""` (Mongoose casts `""` to `null`).
- `saveUpdate` reproduces what Mongoose 9 `save()` writes (verified against `node_modules/mongoose/lib/document.js` `$__shouldModify` / `$__dirty` and `lib/helpers/timestamps/setDocumentTimestamps.js`). `current` is the stored document **after `shape*`** (Mongoose compares against the hydrated value, defaults filled, including `recurrenceRule.endDate: null`); `changes` maps a field or dotted path to its new value; `defaults` maps a field or dotted path to a non-null schema default the stored document lacks (`accountDefaults(raw)` / `transactionDefaults(raw)`, computed from the unshaped document). Result:
  - (1) the `changes` entries whose value differs from the value at that path in `current`. Equality is deep and ignores object key order (sort keys before comparing); array order matters; a missing value differs from everything, `null` included.
  - (2) every `defaults` entry, except one whose path starts with `<key>.` for a `<key>` that (1) sets as a whole.
  - `null` when (1) and (2) are both empty: nothing is written.
  - otherwise `{ $set: { ...(1), ...(2) }, touch }` with `touch = (1) is non-empty`. When only defaults are written Mongoose leaves `updatedAt` alone, so `touch` is `false`.
- `accountDefaults(raw)` returns, for paths missing from `raw`: `balance: 0`, `currency: "USD"`, `isCash: false`, `isArchived: false`, and when `raw.rap` is an object: `"rap.enabled": false`, `"rap.autoSchedule": true`, `"rap.recertDate": "07-01"`, `"rap.dependents": 0`. `transactionDefaults(raw)`: `isRecurring: false`, `categoryTags: []`, `balanceApplied: true`, and when `raw.recurrenceRule` is an object: `"recurrenceRule.interval": 1`, `"recurrenceRule.daysOfMonth": []` (`endDate: null` is not persisted: Mongoose skips `null` defaults).
- `saveAccount` / `saveTransaction`: `const u = saveUpdate(<shape>(raw), <defaults>(raw), changes); if (u) await <collection>.updateById(raw._id, { $set: u.$set }, u.touch ? undefined : { timestamps: false });` (`timestamps: false` is the Task 4 option).
- `ensureCashAccount`: as in the rewrite table (S1). It never writes when a Cash account exists.
- Produces, in `test-helpers.ts`: `export function countingStore(): { store: BrowserStore; writes: (name: CollectionName) => number }` — a `BrowserStore` over `memoryStorage()` whose `setItem` calls are counted per collection key (`ts:data:<name>`).

- [ ] **Step 1: Write the failing tests** in `docs.test.ts`.

```ts
const base = { _id: "a".repeat(24), createdAt: "c", updatedAt: "u" };

test("shape fills the defaults Mongoose hydration fills, and nothing else", () => {
  assert.deepEqual(shapeAccount({ ...base, name: "Old", type: "bank" } as AccountDoc), { ...base, name: "Old", type: "bank", balance: 0, currency: "USD", isCash: false, isArchived: false });
  const full = { ...base, name: "L", type: "debt", balance: 5, currency: "EUR", isCash: false, isArchived: true, rap: { enabled: true } } as unknown as AccountDoc;
  assert.deepEqual(shapeAccount(full), { ...full, rap: { enabled: true, autoSchedule: true, recertDate: "07-01", dependents: 0 } });
  const tx = { ...base, amount: 1, date: "d", description: "x", accountId: "b".repeat(24), type: "debit" } as TransactionDoc;
  assert.deepEqual(shapeTransaction(tx), { ...tx, isRecurring: false, categoryTags: [], balanceApplied: true });
  assert.deepEqual(shapeTransaction({ ...tx, recurrenceRule: { frequency: "monthly", startDate: "s" } } as TransactionDoc).recurrenceRule, { frequency: "monthly", startDate: "s", interval: 1, endDate: null, daysOfMonth: [] });
  assert.equal(shapeTransaction({ ...tx, balanceApplied: false }).balanceApplied, false);
  assert.equal("recurrenceRule" in shapeTransaction(tx), false);
  assert.equal(shapeCategory({ ...base, name: "n", color: "#000000", icon: "i" } as CategoryDoc).isDefault, false);
});

test("profileFromDoc and profileToDoc convert dates, ids and labels", () => {
  assert.deepEqual(profileFromDoc(null), DEFAULT_PROFILE);
  assert.deepEqual(
    profileFromDoc({ ...base, salarySteps: [{ effectiveDate: "2026-01-01T00:00:00.000Z", annualGross: 1 }], whatIfSalaries: [{ label: "", annualGross: 2 }, { label: "A", annualGross: 3 }] } as ProfileDoc),
    { ...DEFAULT_PROFILE, salarySteps: [{ effectiveDate: "2026-01-01", annualGross: 1 }], whatIfSalaries: [{ annualGross: 2 }, { label: "A", annualGross: 3 }] },
  );
  assert.deepEqual(
    profileToDoc({ ...DEFAULT_PROFILE, salaryTransactionId: "", rentSteps: [{ effectiveDate: "2026-02-01", monthly: 5 }], whatIfSalaries: [{ label: "  x ", annualGross: 1 }, { annualGross: 2 }] }),
    { ...DEFAULT_PROFILE, salaryTransactionId: null, rentSteps: [{ effectiveDate: "2026-02-01T00:00:00.000Z", monthly: 5 }], whatIfSalaries: [{ label: "x", annualGross: 1 }, { annualGross: 2 }] },
  );
});

test("buildRule writes the schema defaults and full ISO dates, and no undefined keys", () => {
  assert.deepEqual(buildRule({ frequency: "monthly", startDate: "2026-11-01", endDate: "", dayOfMonth: 1 }), { frequency: "monthly", interval: 1, startDate: "2026-11-01T00:00:00.000Z", endDate: null, dayOfMonth: 1, daysOfMonth: [] });
  assert.deepEqual(buildRule({ frequency: "weekly", interval: 2, startDate: "2026-11-01", endDate: "2027-01-01", dayOfWeek: 3, daysOfMonth: [1, 15] }), { frequency: "weekly", interval: 2, startDate: "2026-11-01T00:00:00.000Z", endDate: "2027-01-01T00:00:00.000Z", dayOfWeek: 3, daysOfMonth: [1, 15] });
  assert.throws(() => buildRule({ frequency: "daily", startDate: "" }), /Invalid date/);
});

test("requiredText trims and refuses empty; assertId refuses anything but 24 lowercase hex", () => {
  assert.equal(requiredText("  a b ", "name"), "a b");
  assert.throws(() => requiredText("   ", "name"), /name is required/);
  assert.doesNotThrow(() => assertId("a".repeat(24)));
  for (const bad of ["abc", "", "A".repeat(24)]) assert.throws(() => assertId(bad), /Invalid id/);
});

test("saveUpdate writes only what save() would", () => {
  const RAP = { enabled: true, autoSchedule: true, recertDate: "07-01", dependents: 0 };
  const current = { amount: 100, recurrenceRule: { startDate: "a", endDate: null }, amountSchedule: [{ effectiveDate: "a", amount: 1 }], rap: RAP };
  // equal values (object keys in any order) and nothing missing: no write
  assert.equal(saveUpdate(current, {}, { amount: 100, amountSchedule: [{ amount: 1, effectiveDate: "a" }], "recurrenceRule.endDate": null, rap: { dependents: 0, recertDate: "07-01", autoSchedule: true, enabled: true } }), null);
  // only the changed values; array order is a difference
  assert.deepEqual(saveUpdate(current, {}, { amount: 200, "recurrenceRule.endDate": "b", "recurrenceRule.startDate": "a" }), { $set: { amount: 200, "recurrenceRule.endDate": "b" }, touch: true });
  assert.deepEqual(saveUpdate({ list: [1, 2] }, {}, { list: [2, 1] }), { $set: { list: [2, 1] }, touch: true });
  // only missing defaults: written, updatedAt must not move
  assert.deepEqual(saveUpdate(current, { balanceApplied: true, "recurrenceRule.interval": 1 }, { amount: 100 }), { $set: { balanceApplied: true, "recurrenceRule.interval": 1 }, touch: false });
  // a change plus defaults; a default under a key that is set as a whole is dropped
  const rap = { ...RAP, enabled: false };
  assert.deepEqual(saveUpdate({ rap: RAP }, { "rap.dependents": 0, isCash: false }, { rap }), { $set: { rap, isCash: false }, touch: true });
  // missing is not null
  assert.deepEqual(saveUpdate({}, {}, { paymentTransactionId: "x", note: null }), { $set: { paymentTransactionId: "x", note: null }, touch: true });
});

test("a legacy transaction saved with no change gets its defaults stored without moving updatedAt; null onto a missing endDate is not a change", async () => {
  const { store } = countingStore();
  const legacy = await transactions(store).insert({ amount: 100, date: "2026-11-01T00:00:00.000Z", description: "x", accountId: "b".repeat(24), type: "debit",
    recurrenceRule: { frequency: "monthly", startDate: "2026-11-01T00:00:00.000Z" } } as never);
  await new Promise((r) => setTimeout(r, 5));
  await saveTransaction(store, legacy, { amount: 100, "recurrenceRule.endDate": null });
  const { _id, createdAt, updatedAt, ...after } = (await transactions(store).findById(legacy._id))!;
  assert.deepEqual(after, { amount: 100, date: "2026-11-01T00:00:00.000Z", description: "x", accountId: "b".repeat(24), type: "debit", isRecurring: false, categoryTags: [], balanceApplied: true,
    recurrenceRule: { frequency: "monthly", startDate: "2026-11-01T00:00:00.000Z", interval: 1, daysOfMonth: [] } });
  assert.equal(updatedAt, legacy.updatedAt);
  await saveTransaction(store, { ...legacy, ...after } as TransactionDoc, { amount: 150 });
  assert.ok((await transactions(store).findById(legacy._id))!.updatedAt > legacy.updatedAt);
});

test("accountDefaults and transactionDefaults list only what the stored document lacks", () => {
  assert.deepEqual(accountDefaults({ name: "a", type: "bank" }), { balance: 0, currency: "USD", isCash: false, isArchived: false });
  assert.deepEqual(accountDefaults({ balance: 1, currency: "USD", isCash: false, isArchived: false, rap: { enabled: true } }), { "rap.autoSchedule": true, "rap.recertDate": "07-01", "rap.dependents": 0 });
  assert.deepEqual(transactionDefaults({ recurrenceRule: { frequency: "monthly", startDate: "s" } }), { isRecurring: false, categoryTags: [], balanceApplied: true, "recurrenceRule.interval": 1, "recurrenceRule.daysOfMonth": [] });
  assert.deepEqual(transactionDefaults({ isRecurring: true, categoryTags: ["a"], balanceApplied: false }), {});
});

test("ensureCashAccount inserts Cash once and never writes again", async () => {
  const { store, writes } = countingStore();
  await ensureCashAccount(store);
  await ensureCashAccount(store);
  const all = await accounts(store).find();
  assert.deepEqual(all.map(({ _id, createdAt, updatedAt, ...a }) => a), [{ name: "Cash", type: "bank", isCash: true, balance: 0, currency: "USD", isArchived: false }]);
  assert.equal(writes("accounts"), 1);
});

test("saveTransaction skips the write when nothing changed, and uses a dotted path for a nested change", async () => {
  const { store, writes } = countingStore();
  const tx = await transactions(store).insert({ amount: 100, date: "2026-11-01T00:00:00.000Z", description: "x", accountId: "b".repeat(24), type: "debit", isRecurring: true, categoryTags: [], balanceApplied: false,
    recurrenceRule: { frequency: "monthly", interval: 1, startDate: "2026-11-01T00:00:00.000Z", endDate: null, daysOfMonth: [] } });
  await saveTransaction(store, tx, { amount: 100 });
  assert.equal(writes("transactions"), 1);
  await saveTransaction(store, tx, { "recurrenceRule.endDate": "2027-01-01T00:00:00.000Z" });
  assert.equal(writes("transactions"), 2);
  assert.deepEqual((await transactions(store).findById(tx._id))!.recurrenceRule, { frequency: "monthly", interval: 1, startDate: "2026-11-01T00:00:00.000Z", endDate: "2027-01-01T00:00:00.000Z", daysOfMonth: [] });
});
```

- [ ] **Step 2: Run** `npm test` — fails (module missing).
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test`, `npx tsc --noEmit`, `npx eslint src/lib/finance/api src/lib/data` — clean (`browser-safe-imports.test.ts` still passes: `docs.ts` imports no model).
- [ ] **Step 5: Commit** `feat(finance): store collections, document shapes and save semantics`

---

### Task 7: Due-payment posting and account handlers (R1–R6)

Model tier: most capable.

**Files:**
- Create: `src/lib/finance/api/post-payments.ts`, `src/lib/finance/api/account-handlers.ts`, `src/lib/finance/api/routes.ts`
- Modify: `src/lib/finance/api/test-helpers.ts` (add `setup`), `src/lib/data/all-routes.ts` (append `...financeRoutes`)
- Test: `src/lib/finance/api/account-handlers.test.ts`

**Interfaces:**
- Consumes: Task 6 (`accounts`, `transactions`, `shapeAccount`, `shapeTransaction`, `requiredText`, `assertId`, `ensureCashAccount`), Task 5 (`toIso`, `toDateStr`, `localDateStr`, `startOfTomorrow`), Task 3 (`ctx.now`), `dueOccurrences` (`src/lib/finance/posting.ts`), `planFieldsToDb` (`src/lib/finance/account-plan-fields.ts`), `accountSchema`, `accountArchiveSchema`, `ok`, `fail`, `Handler`, `RouteDef`, `ConflictError`.
- Produces:
  - `post-payments.ts`: `export async function postDuePayments(store: Store, now: Date): Promise<void>` — the body of `src/lib/finance/post-payments.ts` with `today = localDateStr(now)` and the calls P1–P5 from the rewrite table, in the same order.
  - `account-handlers.ts`: `listAccounts`, `createAccount`, `getAccount`, `updateAccount`, `archiveAccount`, `deleteAccount: Handler`.
  - `routes.ts`: `export const financeRoutes: RouteDef[]` holding R1–R6 for now, each handler wrapped with `withCash`; this file also defines `noConflict` (used from Task 8). Both wrappers are module-private.
  - `test-helpers.ts`: `export const NOW = new Date("2026-11-17T15:00:00.000Z")` (10:00 on 17 Nov in New York) and `export function setup(): { store: BrowserStore; writes: (name: CollectionName) => number; call: (method: string, url: string, body?: unknown) => Promise<ApiResult>; setNow: (now: Date) => void }` — `call` is `dispatch(financeRoutes, store, method, url, body, now)` with `now` starting at `NOW`.
- Handler rules beyond the route table:
  - Order within each handler is the order of the old route file (inventory §6 items 4–8). In `updateAccount` the body's `type` is read only for the Cash account, as today's short-circuit does: `if (existing.isCash && body !== undefined && (body as { type?: unknown }).type && (body as { type?: unknown }).type !== "bank") return fail(400, "Cannot change the type of the Cash account")`. So an unparseable body (`undefined`) skips the guard and fails validation with 400; a JSON `null` body throws for the Cash account (500, as today) and is a 400 for any other account (as today).
  - `createAccount`: `requiredText(name, "name")`; `notes` trimmed when present; `assertId(linkedAccountId)` when present, before the insert. The response is the inserted account, shaped (not re-read after the disbursement).
  - `updateAccount`: `assertId(linkedAccountId)` when present, and `requiredText`, immediately before the update.
  - `listAccounts` applies pending transactions exactly as `accounts/route.ts:28-83` does, using the A1–A7 rewrites.

- [ ] **Step 1: Write the failing tests** in `account-handlers.test.ts` (here and in Tasks 8–11, add `as const` or a cast where TypeScript widens a literal such as `type: "debit"` in a directly inserted document; the values are what matter). Shared helpers at the top:

```ts
let t = setup();
test.beforeEach(() => { t = setup(); });
const acct = async (body: object) => (await t.call("POST", "/api/accounts", body)).body as AccountDoc;
const getAcct = async (id: string) => (await t.call("GET", `/api/accounts/${id}`)).body as AccountDoc;
const balances = async () => Object.fromEntries((await accounts(t.store).find({ isCash: { $ne: true } })).map((a) => [a.name, a.balance]));
const tx = () => transactions(t.store);
const strip = <T extends BaseDoc>({ _id, createdAt, updatedAt, ...rest }: T) => rest;
```

```ts
test("Cash exists once and is protected", async () => {
  const list = (await t.call("GET", "/api/accounts")).body as AccountDoc[];
  assert.deepEqual(list.map(strip), [{ name: "Cash", type: "bank", isCash: true, balance: 0, currency: "USD", isArchived: false }]);
  await t.call("GET", "/api/accounts");
  assert.equal(await accounts(t.store).count(), 1);
  const id = list[0]._id;
  assert.deepEqual(await t.call("PUT", `/api/accounts/${id}`, { name: "Cash", type: "debt", balance: 0 }), { status: 400, body: { error: "Cannot change the type of the Cash account" } });
  assert.deepEqual(await t.call("PATCH", `/api/accounts/${id}`, { isArchived: true }), { status: 403, body: { error: "The Cash account cannot be archived" } });
  assert.deepEqual(await t.call("DELETE", `/api/accounts/${id}`), { status: 403, body: { error: "The Cash account cannot be deleted" } });
});

test("create: dollars become cents, percent a fraction, defaults stored, text trimmed, depositFunds never stored", async () => {
  const res = await t.call("POST", "/api/accounts", { name: "  Card ", type: "credit_card", balance: 400.5, creditLimit: 1000, apr: 25, minimumPayment: 35, notes: " n ", depositFunds: true });
  assert.equal(res.status, 201);
  assert.deepEqual(strip(res.body as AccountDoc), { name: "Card", type: "credit_card", balance: 40050, creditLimit: 100000, apr: 0.25, minimumPayment: 3500, notes: "n", currency: "USD", isCash: false, isArchived: false });
  assert.deepEqual(await accounts(t.store).findById((res.body as AccountDoc)._id), res.body);
});

test("an account stored without defaulted fields is returned with them", async () => {
  const old = await accounts(t.store).insert({ name: "Old", type: "bank" } as never);
  assert.deepEqual(strip(await getAcct(old._id)), { name: "Old", type: "bank", balance: 0, currency: "USD", isCash: false, isArchived: false });
  assert.ok(((await t.call("GET", "/api/accounts")).body as AccountDoc[]).some((a) => a.name === "Old" && a.isArchived === false));
});

test("loan disbursement credits the linked bank and records an applied transfer dated now", async () => {
  const bank = await acct({ name: "Bank", type: "bank", balance: 100 });
  const loan = await acct({ name: "Car", type: "debt", balance: 8000, isLoan: true, linkedAccountId: bank._id, depositFunds: true });
  assert.deepEqual(await balances(), { Bank: 810000, Car: 800000 });
  assert.deepEqual((await tx().find()).map(strip), [{ accountId: loan._id, toAccountId: bank._id, type: "transfer", amount: 800000, description: "Loan disbursement from Car", categoryTags: ["transfer"], date: NOW.toISOString(), isRecurring: false, balanceApplied: true }]);
  await acct({ name: "Linked only", type: "debt", balance: 10, isLoan: true, linkedAccountId: bank._id });
  assert.equal(await tx().count(), 1);
});

test("current behavior: a loan whose linked account is missing is created, then answered with 400", async () => {
  const res = await t.call("POST", "/api/accounts", { name: "Orphan", type: "debt", balance: 50, isLoan: true, linkedAccountId: "a".repeat(24), depositFunds: true });
  assert.deepEqual(res, { status: 400, body: { error: "Linked account not found for loan disbursement" } });
  assert.equal(await accounts(t.store).count({ name: "Orphan" }), 1);
  assert.deepEqual(await t.call("POST", "/api/accounts", { name: "Bad", type: "debt", balance: 1, linkedAccountId: "abc" }), { status: 500, body: { error: "Failed to create account" } });
  assert.equal(await accounts(t.store).count({ name: "Bad" }), 0);
});

test("update: omitted fields are kept, apr and minimumPayment null are removed, depositFunds is never stored", async () => {
  const a = await acct({ name: "Card", type: "credit_card", balance: 400, creditLimit: 1000, apr: 25, minimumPayment: 35, notes: "keep me" });
  const res = await t.call("PUT", `/api/accounts/${a._id}`, { name: "Card 2", type: "credit_card", balance: 410, apr: null, minimumPayment: 40, depositFunds: true });
  assert.equal(res.status, 200);
  assert.deepEqual(strip(res.body as AccountDoc), { name: "Card 2", type: "credit_card", balance: 41000, creditLimit: 100000, minimumPayment: 4000, notes: "keep me", currency: "USD", isCash: false, isArchived: false });
  assert.equal("depositFunds" in (await accounts(t.store).findById(a._id))!, false);
});

test("archive hides from the default list; delete removes the account and transactions on either side", async () => {
  const a = await acct({ name: "A", type: "bank", balance: 0 });
  const b = await acct({ name: "B", type: "bank", balance: 0 });
  const row = { amount: 100, date: "2026-11-01T00:00:00.000Z", description: "t", type: "debit" as const, isRecurring: false, categoryTags: [], balanceApplied: true };
  await tx().insert({ ...row, accountId: a._id });
  await tx().insert({ ...row, accountId: b._id, toAccountId: a._id, type: "transfer" });
  await tx().insert({ ...row, accountId: b._id });
  const names = async (qs: string) => ((await t.call("GET", `/api/accounts${qs}`)).body as AccountDoc[]).map((x) => x.name).sort();
  assert.equal(((await t.call("PATCH", `/api/accounts/${a._id}`, { isArchived: true })).body as AccountDoc).isArchived, true);
  assert.deepEqual(await names(""), ["B", "Cash"]);
  assert.deepEqual(await names("?includeArchived=true"), ["A", "B", "Cash"]);
  assert.deepEqual(await names("?type=debt&includeArchived=true"), []);
  assert.deepEqual(await t.call("DELETE", `/api/accounts/${a._id}`), { status: 200, body: { message: "Account and associated transactions deleted" } });
  assert.deepEqual((await tx().find()).map((x) => [x.accountId, x.toAccountId]), [[b._id, undefined]]);
  assert.deepEqual(await balances(), { B: 0 });
});

test("validation is 400 with flatten details; unknown and malformed ids are 404; an unparseable body is 400", async () => {
  const bad = await t.call("POST", "/api/accounts", { name: "", type: "bank", balance: 1 });
  assert.equal(bad.status, 400);
  assert.equal((bad.body as { error: string }).error, "Validation failed");
  assert.deepEqual(Object.keys((bad.body as { details: object }).details).sort(), ["fieldErrors", "formErrors"]);
  const valid = { name: "x", type: "bank", balance: 0 };
  for (const id of ["abc", "a".repeat(24)]) {
    for (const [method, body] of [["GET", undefined], ["PUT", valid], ["PATCH", { isArchived: true }], ["DELETE", undefined]] as const) {
      assert.deepEqual(await t.call(method, `/api/accounts/${id}`, body), { status: 404, body: { error: "Account not found" } });
    }
  }
  const a = await acct(valid);
  assert.equal((await t.call("PUT", `/api/accounts/${a._id}`, undefined)).status, 400);
  assert.equal((await t.call("PUT", `/api/accounts/${a._id}`, null)).status, 400);
  const cash = (await accounts(t.store).findOne({ isCash: true }))!;
  assert.deepEqual(await t.call("PUT", `/api/accounts/${cash._id}`, null), { status: 500, body: { error: "Failed to update account" } });
  assert.equal((await t.call("PUT", `/api/accounts/${cash._id}`, undefined)).status, 400);
  assert.equal((await t.call("PATCH", `/api/accounts/${a._id}`, { isArchived: "yes" })).status, 400);
  assert.deepEqual(await t.call("POST", "/api/accounts", { name: "   ", type: "bank", balance: 0 }), { status: 500, body: { error: "Failed to create account" } });
});

test("a future transaction is applied once when its day arrives, and never twice", async () => {
  const bank = await acct({ name: "Bank", type: "bank", balance: 100 });
  const card = await acct({ name: "Card", type: "credit_card", balance: 50 });
  const pending = { description: "p", isRecurring: false, categoryTags: [], balanceApplied: false, date: "2026-11-19T00:00:00.000Z" };
  await tx().insert({ ...pending, amount: 2500, type: "debit", accountId: bank._id });
  await tx().insert({ ...pending, amount: 1000, type: "transfer", accountId: bank._id, toAccountId: card._id });
  await tx().insert({ ...pending, amount: 0, type: "debit", accountId: bank._id });
  await tx().insert({ ...pending, amount: 700, type: "debit", accountId: bank._id, isRecurring: true });
  await tx().insert({ ...pending, amount: 300, type: "credit", accountId: card._id });
  await t.call("GET", "/api/accounts");
  assert.deepEqual(await balances(), { Bank: 10000, Card: 5000 });
  t.setNow(new Date("2026-11-19T15:00:00.000Z"));
  await t.call("GET", "/api/accounts");
  await t.call("GET", "/api/accounts");
  assert.deepEqual(await balances(), { Bank: 6500, Card: 3700 });
  assert.deepEqual((await tx().find({ balanceApplied: false })).map((x) => x.amount), [700]);
});

test("due plan payments post once, capped at what is owed, and nothing moves once nothing is owed", async () => {
  const bank = await acct({ name: "Bank", type: "bank", balance: 1000 });
  const card = await acct({ name: "Card", type: "credit_card", balance: 120 });
  const pay = await tx().insert({ amount: 5000, date: "2026-09-15T00:00:00.000Z", description: "Card payment", accountId: bank._id, toAccountId: card._id, type: "transfer", isRecurring: true,
    recurrenceRule: { frequency: "monthly", interval: 1, startDate: "2026-09-15T00:00:00.000Z", endDate: null, dayOfMonth: 15, daysOfMonth: [] }, categoryTags: ["credit", "transfer"], balanceApplied: false });
  await accounts(t.store).updateById(card._id, { $set: { paymentTransactionId: pay._id } });
  await t.call("GET", "/api/accounts");
  await t.call("GET", "/api/accounts");
  assert.deepEqual(await balances(), { Bank: 88000, Card: 0 }); // 15 Sep, 15 Oct, 15 Nov: 50 + 50 + 20
  assert.equal((await tx().findById(pay._id))!.postedThrough, "2026-11-15T00:00:00.000Z");
  t.setNow(new Date("2026-12-16T15:00:00.000Z"));
  await t.call("GET", `/api/accounts/${card._id}`);
  assert.deepEqual(await balances(), { Bank: 88000, Card: 0 });
  // current behavior: the December payment is marked posted although nothing was owed
  assert.equal((await tx().findById(pay._id))!.postedThrough, "2026-12-15T00:00:00.000Z");
});

test("payments are not posted for an archived account, and a second request with nothing due writes nothing", async () => {
  const bank = await acct({ name: "Bank", type: "bank", balance: 1000 });
  const card = await acct({ name: "Card", type: "credit_card", balance: 120 });
  const pay = await tx().insert({ amount: 5000, date: "2026-09-15T00:00:00.000Z", description: "p", accountId: bank._id, toAccountId: card._id, type: "transfer", isRecurring: true,
    recurrenceRule: { frequency: "monthly", interval: 1, startDate: "2026-09-15T00:00:00.000Z", endDate: null, dayOfMonth: 15, daysOfMonth: [] }, categoryTags: [], balanceApplied: false });
  await accounts(t.store).updateById(card._id, { $set: { paymentTransactionId: pay._id, isArchived: true } });
  await t.call("GET", "/api/accounts?includeArchived=true");
  assert.deepEqual(await balances(), { Bank: 100000, Card: 12000 });
  assert.equal("postedThrough" in (await tx().findById(pay._id))!, false);
  await accounts(t.store).updateById(card._id, { $set: { isArchived: false } });
  await t.call("GET", "/api/accounts");
  const [accountWrites, txWrites] = [t.writes("accounts"), t.writes("transactions")];
  await t.call("GET", "/api/accounts");
  assert.deepEqual([t.writes("accounts"), t.writes("transactions")], [accountWrites, txWrites]);
});
```

- [ ] **Step 2: Run** `npm test` — fails (modules missing).
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test`, `npx tsc --noEmit`, `npx eslint src/lib/finance/api src/lib/data` — clean.
- [ ] **Step 5: Commit** `feat(finance): account handlers and due-payment posting over the store`

---

### Task 8: Transaction and category handlers (R11–R17)

Model tier: most capable.

**Files:**
- Create: `src/lib/finance/api/transaction-handlers.ts`, `src/lib/finance/api/category-handlers.ts`
- Modify: `src/lib/finance/api/routes.ts` (add R11–R17)
- Test: `src/lib/finance/api/transaction-handlers.test.ts`, `src/lib/finance/api/category-handlers.test.ts`

**Interfaces:**
- Consumes: Tasks 3–7; `transactionSchema`, `categorySchema`; `DEFAULT_CATEGORIES`.
- Produces: `listTransactions`, `createTransaction`, `getTransaction`, `updateTransaction`, `deleteTransaction: Handler`; `listCategories`, `createCategory: Handler`.
- Rules beyond the route table and the rewrite table:
  - Copy the arithmetic of `transactions/route.ts` and `transactions/[transactionId]/route.ts` exactly (caps at `:115-137` and `:125-143`, signs in inventory §3d). "Future" is `new Date(validated.date) >= startOfTomorrow(now)`.
  - Validation errors: catch an error whose `name === "ZodError"` and return `fail(400, "Validation failed", JSON.parse(JSON.stringify(error)))` (the same JSON today's `NextResponse.json` sends; a plain object in browser mode).
  - `createTransaction`: directly after parsing, `assertId(accountId)` and, when present, `assertId(toAccountId)`. Dates are converted (`toIso`, `buildRule`) when the insert document is built.
  - `updateTransaction`: `assertId(accountId)` goes **after** the reversal block and before the new effect. `assertId(toAccountId)` (when present) goes at that same point only when `type === "transfer" && !isRecurring` (the only case in which today's code looks the destination up there); in every other case it runs where the final `$set` is built, together with `toIso` / `buildRule` / `requiredText` — after the new effect has been applied, which is where today's cast fails.
  - `listTransactions`: `page = parseInt(page || "1", 10)`, `limit = parseInt(limit || "20", 10)` as today; date bounds through `filterDate`; `assertId(accountId)` when given; if `skip < 0` throw `new Error("Invalid skip")` (MongoDB refuses a negative skip); `find` and `count` run in parallel; `totalPages = Math.ceil(total / limit)`. `isRecurring` is `=== "true"` whenever the parameter is non-empty. `search` is passed as `{ $regex: search, $options: "i" }` unescaped.
  - `createCategory` and `listCategories` are registered as `withCash(noConflict(handler))`.

- [ ] **Step 1: Write the failing tests.** `transaction-handlers.test.ts`, helpers as in Task 7 plus:

```ts
let bank: AccountDoc, card: AccountDoc, loan: AccountDoc;
test.beforeEach(async () => {
  t = setup();
  bank = await acct({ name: "Bank", type: "bank", balance: 1000 });
  card = await acct({ name: "Card", type: "credit_card", balance: 200, creditLimit: 500 });
  loan = await acct({ name: "Loan", type: "debt", balance: 300 });
});
const body = (over: object = {}) => ({ amount: 10, date: "2026-11-10", description: "t", accountId: bank._id, type: "debit", ...over });
const post = async (over: object = {}) => (await t.call("POST", "/api/transactions", body(over))).body as TransactionDoc;
```

```ts
test("balance signs and caps: bank, credit card and debt move the right way", async () => {
  await post();                                                                        // debit bank 10
  await post({ type: "credit", amount: 25 });                                          // credit bank 25
  await post({ accountId: card._id, amount: 40 });                                     // charge card 40
  await post({ accountId: card._id, type: "credit", amount: 15 });                     // refund card 15
  assert.deepEqual(await balances(), { Bank: 101500, Card: 22500, Loan: 30000 });
  const transfer = (from: AccountDoc, to: AccountDoc, amount: number) => post({ type: "transfer", accountId: from._id, toAccountId: to._id, amount });
  const stored = [
    await transfer(bank, card, 50),      // pays 50
    await transfer(bank, card, 9999),    // capped at the 175 still owed
    await transfer(bank, card, 5),       // nothing owed: 0
    await transfer(card, bank, 600),     // capped at the 500 credit limit
    await transfer(card, bank, 1),       // no credit left: 0
    await transfer(bank, loan, 100),
  ].map((x) => [x.amount, x.balanceApplied]);
  assert.deepEqual(stored, [[5000, true], [17500, true], [0, true], [50000, true], [0, true], [10000, true]]);
  assert.deepEqual(await balances(), { Bank: 119000, Card: 50000, Loan: 20000 });
});

test("edit and delete reverse exactly", async () => {
  const debit = await post();
  assert.equal((await t.call("PUT", `/api/transactions/${debit._id}`, body({ type: "credit", amount: 30 }))).status, 200);
  assert.deepEqual(await balances(), { Bank: 103000, Card: 20000, Loan: 30000 });
  await t.call("DELETE", `/api/transactions/${debit._id}`);
  const move = await post({ type: "transfer", toAccountId: card._id, amount: 50 });
  assert.deepEqual(await balances(), { Bank: 95000, Card: 15000, Loan: 30000 });
  await t.call("PUT", `/api/transactions/${move._id}`, body({ type: "transfer", toAccountId: card._id, amount: 20 }));
  assert.deepEqual(await balances(), { Bank: 98000, Card: 18000, Loan: 30000 });
  const charge = await post({ accountId: card._id, amount: 40 });
  assert.deepEqual(await t.call("DELETE", `/api/transactions/${move._id}`), { status: 200, body: { message: "Transaction deleted successfully" } });
  await t.call("DELETE", `/api/transactions/${charge._id}`);
  assert.deepEqual(await balances(), { Bank: 100000, Card: 20000, Loan: 30000 });
  assert.equal(await tx().count(), 0);
});

test("future and recurring transactions are not applied; an edit moves a transaction between states", async () => {
  const future = await post({ date: "2026-11-19" });
  const recurring = await post({ isRecurring: true, recurrenceRule: { frequency: "monthly", startDate: "2026-11-01", dayOfMonth: 1 } });
  assert.deepEqual([future.balanceApplied, recurring.balanceApplied, (await balances()).Bank], [false, false, 100000]);
  await t.call("PUT", `/api/transactions/${future._id}`, body());
  assert.equal((await balances()).Bank, 99000);
  await t.call("PUT", `/api/transactions/${future._id}`, body({ date: "2026-11-19" }));
  assert.equal((await balances()).Bank, 100000);
  await t.call("DELETE", `/api/transactions/${future._id}`);
  await t.call("DELETE", `/api/transactions/${recurring._id}`);
  assert.equal((await balances()).Bank, 100000);
});

test("current behavior: west of UTC a transaction dated tomorrow is applied today", async () => {
  assert.equal((await post({ date: "2026-11-18" })).balanceApplied, true);
  assert.equal((await balances()).Bank, 99000);
});

test("dates are stored as instants; rules get their defaults; list range filters are inclusive", async () => {
  const made = await t.call("POST", "/api/transactions", body({ date: "2026-11-01", description: "  first ", notes: " n ", categoryTags: [" a "] }));
  assert.equal(made.status, 201);
  assert.deepEqual(strip(made.body as TransactionDoc), { amount: 1000, date: "2026-11-01T00:00:00.000Z", description: "first", accountId: bank._id, type: "debit", isRecurring: false, categoryTags: ["a"], notes: "n", balanceApplied: true });
  await post({ date: "2026-11-05", amount: 11 });
  await post({ date: "2026-11-10", amount: 12 });
  const rule = (await post({ amount: 13, isRecurring: true, recurrenceRule: { frequency: "monthly", startDate: "2026-11-02", endDate: "", dayOfMonth: 2 } })).recurrenceRule;
  assert.deepEqual(rule, { frequency: "monthly", interval: 1, startDate: "2026-11-02T00:00:00.000Z", endDate: null, dayOfMonth: 2, daysOfMonth: [] });
  const list = (await t.call("GET", "/api/transactions?startDate=2026-11-01&endDate=2026-11-05&sort=date&order=asc&isRecurring=false")).body as { data: TransactionDoc[] };
  assert.deepEqual(list.data.map((x) => x.date), ["2026-11-01T00:00:00.000Z", "2026-11-05T00:00:00.000Z"]);
});

test("list: paging, filters, and the response shape", async () => {
  for (const [amount, over] of [[1, {}], [2, { categoryTags: ["salary"], type: "credit" }], [3, { description: "Coffee SHOP" }], [4, { type: "transfer", toAccountId: loan._id }], [5, { accountId: loan._id }]] as const) {
    await post({ amount, date: `2026-11-0${amount}`, ...over });
  }
  const get = async (qs: string) => (await t.call("GET", `/api/transactions${qs}`)).body as { data: TransactionDoc[]; pagination: object };
  const page = await get("?limit=2&page=2&sort=amount&order=asc");
  assert.deepEqual(page.data.map((x) => x.amount), [300, 400]);
  assert.deepEqual(page.pagination, { page: 2, limit: 2, total: 5, totalPages: 3 });
  assert.deepEqual((await get("")).data.map((x) => x.amount), [500, 400, 300, 200, 100]);
  assert.deepEqual((await get(`?accountId=${loan._id}&sort=amount&order=asc`)).data.map((x) => x.amount), [400, 500]);
  assert.deepEqual((await get("?category=salary")).data.map((x) => x.amount), [200]);
  assert.deepEqual((await get("?type=transfer")).data.map((x) => x.amount), [400]);
  assert.deepEqual((await get("?search=coffee")).data.map((x) => x.amount), [300]);
  assert.deepEqual((await get("?isRecurring=true")).data, []);
  assert.deepEqual(await t.call("GET", "/api/transactions?accountId=abc"), { status: 500, body: { error: "Failed to fetch transactions" } });
  assert.deepEqual(await t.call("GET", "/api/transactions?page=0"), { status: 500, body: { error: "Failed to fetch transactions" } });
  for (const bad of ["1767225600000", "garbage"]) {
    assert.deepEqual(await t.call("GET", `/api/transactions?startDate=${bad}`), { status: 500, body: { error: "Failed to fetch transactions" } });
  }
});

test("update keeps fields the body leaves out; current behavior: a transfer changed to a debit keeps toAccountId", async () => {
  const move = await post({ type: "transfer", toAccountId: card._id, amount: 50, notes: "keep" });
  const res = await t.call("PUT", `/api/transactions/${move._id}`, body({ amount: 5 }));
  const updated = res.body as TransactionDoc;
  assert.deepEqual([res.status, updated.type, updated.toAccountId, updated.notes, updated.amount], [200, "debit", card._id, "keep", 500]);
  assert.deepEqual(await balances(), { Bank: 99500, Card: 20000, Loan: 30000 });
  assert.deepEqual(await t.call("GET", `/api/transactions/${move._id}`), { status: 200, body: updated });
});

test("current behavior: an edit refused for a missing account leaves the old effect reversed", async () => {
  const move = await post({ type: "transfer", toAccountId: card._id, amount: 50 });
  const res = await t.call("PUT", `/api/transactions/${move._id}`, body({ type: "transfer", toAccountId: "a".repeat(24), amount: 50 }));
  assert.deepEqual(res, { status: 400, body: { error: "Source or destination account not found" } });
  assert.deepEqual(await balances(), { Bank: 100000, Card: 20000, Loan: 30000 });
  const still = (await tx().findById(move._id))!;
  assert.deepEqual([still.amount, still.balanceApplied, still.toAccountId], [5000, true, card._id]);
});

test("current behavior: a debit edit carrying a malformed toAccountId fails after the new effect is applied", async () => {
  const debit = await post();                                                   // bank 99000
  const res = await t.call("PUT", `/api/transactions/${debit._id}`, body({ amount: 30, toAccountId: "abc" }));
  assert.deepEqual(res, { status: 500, body: { error: "Failed to update transaction" } });
  assert.equal((await balances()).Bank, 97000);                                 // old effect reversed, new one applied
  assert.equal((await tx().findById(debit._id))!.amount, 1000);                 // the document itself was not updated
  const move = await t.call("PUT", `/api/transactions/${debit._id}`, body({ type: "transfer", toAccountId: "abc" }));
  assert.deepEqual(move, { status: 500, body: { error: "Failed to update transaction" } });
  assert.equal((await balances()).Bank, 98000);                                 // reversed again; a transfer fails before its new effect
});

test("a legacy transaction without balanceApplied is treated as applied", async () => {
  const old = await tx().insert({ amount: 1000, date: "2026-10-01T00:00:00.000Z", description: "old", accountId: bank._id, type: "debit" } as never);
  await t.call("DELETE", `/api/transactions/${old._id}`);
  assert.equal((await balances()).Bank, 101000);
});

test("deleting a plan's payment transfer unlinks the plan", async () => {
  const pay = await post({ type: "transfer", toAccountId: card._id, amount: 20, isRecurring: true, recurrenceRule: { frequency: "monthly", startDate: "2026-12-15", dayOfMonth: 15 } });
  await accounts(t.store).updateById(card._id, { $set: { paymentTransactionId: pay._id } });
  await t.call("DELETE", `/api/transactions/${pay._id}`);
  assert.equal("paymentTransactionId" in (await accounts(t.store).findById(card._id))!, false);
});

test("errors: validation 400 with plain-JSON details, missing accounts 400, ids 404 or 500 as today", async () => {
  const bad = await t.call("POST", "/api/transactions", body({ amount: 0 }));
  assert.equal(bad.status, 400);
  assert.equal((bad.body as { error: string }).error, "Validation failed");
  assert.deepEqual(JSON.parse(JSON.stringify(bad.body)), bad.body);
  assert.equal((await t.call("POST", "/api/transactions", undefined)).status, 400);
  assert.equal((await t.call("POST", "/api/transactions", body({ type: "transfer" }))).status, 400);
  assert.deepEqual(await t.call("POST", "/api/transactions", body({ type: "transfer", toAccountId: "a".repeat(24), isRecurring: true, recurrenceRule: { frequency: "daily", startDate: "2026-11-01" } })), { status: 400, body: { error: "Source or destination account not found" } });
  assert.deepEqual(await t.call("POST", "/api/transactions", body({ accountId: "abc" })), { status: 500, body: { error: "Failed to create transaction" } });
  assert.deepEqual(await t.call("POST", "/api/transactions", body({ date: "garbage" })), { status: 500, body: { error: "Failed to create transaction" } });
  assert.equal(await tx().count(), 0);
  for (const id of ["abc", "a".repeat(24)]) {
    for (const [method, sent] of [["GET", undefined], ["PUT", body()], ["DELETE", undefined]] as const) {
      assert.deepEqual(await t.call(method, `/api/transactions/${id}`, sent), { status: 404, body: { error: "Transaction not found" } });
    }
  }
  const made = await post();
  assert.equal((await t.call("PUT", `/api/transactions/${made._id}`, body({ amount: -1 }))).status, 400);
});
```

`category-handlers.test.ts`:

```ts
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
  const conflicted: Store = { collection: (name) => name === "financeCategories"
    ? ({ ...categories(t.store), findOne: async () => null, insert: async () => { throw new ConflictError("financeCategories", "name"); } } as never)
    : t.store.collection(name) };
  assert.deepEqual(await dispatch(financeRoutes, conflicted, "POST", "/api/categories", { name: "x", color: "#112233", icon: "Dog" }), { status: 500, body: { error: "Failed to create category" } });
});
```

In the conflict test, build the stand-in collection so its other methods delegate to the real one (spread does not copy class methods; wrap each method explicitly or use a `Proxy`).

- [ ] **Step 2: Run** `npm test` — fails (modules missing).
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test`, `npx tsc --noEmit`, `npx eslint src/lib/finance/api` — clean.
- [ ] **Step 5: Commit** `feat(finance): transaction and category handlers over the store`

---

### Task 9: Payment plans (R7–R10)

Model tier: most capable.

**Files:**
- Create: `src/lib/finance/api/payment-plan.ts`, `src/lib/finance/api/payment-plan-handlers.ts`
- Modify: `src/lib/finance/api/routes.ts` (add R7–R10)
- Test: `src/lib/finance/api/payment-plan-handlers.test.ts`

**Interfaces:**
- Consumes: Tasks 5–7 (`loadProfile`, `saveAccount`, `saveTransaction`, `postDuePayments`, `asDate`, `toIso`, `localDateStr`, `assertId`); the pure libraries `recurrence`, `amount-schedule`, `interest`, `payoff`, `rap`, `rap-merge`, `tax-calculator`; `paymentPlanSetupSchema`, `paymentPlanUpdateSchema`.
- Produces, in `payment-plan.ts` (each is the function of the same name in `src/lib/finance/payment-plan.ts` with `store` first and `now` last, `localTodayStr()` replaced by `localDateStr(now)`, and the rewrites PP1–PP15):

```ts
export class PaymentPlanError extends Error { status: number; constructor(message: string, status: number) }   // field declared and assigned explicitly: no parameter property
export interface PaymentPlanDTO { /* unchanged */ }
export function describeCadence(rule: Pick<StoredRule, "frequency" | "interval" | "dayOfWeek" | "dayOfMonth"> | null | undefined): string;
export function getPaymentPlan(store: Store, accountId: string, now: Date): Promise<PaymentPlanDTO>;
export function setupPayments(store: Store, accountId: string, input: { fromAccountId: string; dayOfMonth: number; startDate: string; firstAmount: number }, now: Date): Promise<void>;
export function updatePaymentPlan(store: Store, accountId: string, input: { schedule?: { effectiveDate: string; amount: number }[]; subLoans?: { name: string; balance: number; apr: number }[]; rap?: { enabled: boolean; autoSchedule: boolean; recertDate: string; dependents: number } }, now: Date): Promise<void>;
export function unlinkPaymentPlan(store: Store, accountId: string): Promise<void>;
export function regenerateRapSchedule(store: Store, accountId: string, now: Date): Promise<void>;
export function regenerateAllRapSchedules(store: Store, now: Date): Promise<void>;
```

  - `loadAccount` (private) throws `PaymentPlanError("Account not found", 404)` for a malformed id as well as a missing account.
  - `setupPayments`: `assertId(input.fromAccountId)` immediately before the PP10 read.
  - Rule dates passed to `expandRecurrence` / `paydaysInYear`: `asDate(rule.startDate).toISOString()` and `rule.endDate ? asDate(rule.endDate).toISOString() : null` (old lines `:111-112`, `:212-213`).
  - Each function keeps a raw (unshaped) copy of every document it later passes to `saveAccount` / `saveTransaction`, and uses the shaped copy for logic.
- Produces, in `payment-plan-handlers.ts`: `getPlan`, `setupPlan`, `updatePlan`, `unlinkPlan: Handler`. Each: `await postDuePayments(store, now)`; (POST/PUT) `safeParse`, on failure `fail(400, issues[0]?.message ?? "Validation failed")`; the library call; `ok({ data: await getPaymentPlan(store, params.accountId, now) })`. A `PaymentPlanError` thrown anywhere in the handler becomes `fail(error.status, error.message)`; any other error is rethrown.

- [ ] **Step 1: Write the failing tests.** Helpers as in Task 8's `beforeEach` (bank 1000, card 200 with `apr: 25`, loan 300), plus `const plan = (id: string) => \`/api/accounts/${id}/payment-plan\`` and `const dto = async (id: string) => ((await t.call("GET", plan(id))).body as { data: PaymentPlanDTO }).data`.

```ts
const setupBody = () => ({ fromAccountId: bank._id, dayOfMonth: 15, startDate: "2026-12-15", firstAmount: 50 });
const RAP = { enabled: true, autoSchedule: false, recertDate: "07-01", dependents: 2 };

test("no plan: the DTO is empty", async () => {
  assert.deepEqual(await dto(card._id), { accountId: card._id, apr: 25, blendedApr: null, minimumPayment: null, subLoans: [], rap: null, payment: null, schedule: [], nextRap: null, payoff: null });
});

test("setup creates the monthly transfer, links it, and reports it", async () => {
  const res = await t.call("POST", plan(card._id), setupBody());
  assert.equal(res.status, 200);
  const data = (res.body as { data: PaymentPlanDTO }).data;
  const stored = (await tx().find())[0];
  assert.deepEqual(strip(stored), { amount: 5000, date: "2026-12-15T00:00:00.000Z", description: "Card payment", accountId: bank._id, toAccountId: card._id, type: "transfer", isRecurring: true,
    recurrenceRule: { frequency: "monthly", interval: 1, startDate: "2026-12-15T00:00:00.000Z", endDate: null, dayOfMonth: 15, daysOfMonth: [] },
    categoryTags: ["credit", "transfer"], balanceApplied: false, amountSchedule: [{ effectiveDate: "2026-12-15T00:00:00.000Z", amount: 5000 }] });
  assert.deepEqual(data.payment, { transactionId: stored._id, fromAccountId: bank._id, fromAccountName: "Bank", dayOfMonth: 15, frequency: "monthly", cadence: "monthly on the 15th" });
  assert.deepEqual(data.schedule, [{ effectiveDate: "2026-12-15", amount: 50 }]);
  assert.ok(data.payoff !== null);
  assert.equal((await accounts(t.store).findById(card._id))!.paymentTransactionId, stored._id);
  assert.deepEqual(await balances(), { Bank: 100000, Card: 20000, Loan: 30000 });
  await t.call("POST", plan(loan._id), { ...setupBody(), firstAmount: 25 });
  assert.deepEqual((await tx().find({ toAccountId: loan._id }))[0].categoryTags, ["loans", "transfer"]);
});

test("update: schedule, sub-loans and RAP settings", async () => {
  await t.call("POST", plan(loan._id), setupBody());
  const payId = (await dto(loan._id)).payment!.transactionId;
  const a = (await t.call("PUT", plan(loan._id), { schedule: [{ effectiveDate: "2026-12-15", amount: 60 }, { effectiveDate: "2027-03-15", amount: 80 }] })).body as { data: PaymentPlanDTO };
  assert.deepEqual(a.data.schedule, [{ effectiveDate: "2026-12-15", amount: 60 }, { effectiveDate: "2027-03-15", amount: 80 }]);
  assert.equal((await tx().findById(payId))!.amount, 6000);
  const b = (await t.call("PUT", plan(loan._id), { subLoans: [{ name: " A ", balance: 100, apr: 5 }, { name: "B", balance: 300, apr: 9 }] })).body as { data: PaymentPlanDTO };
  assert.deepEqual([b.data.subLoans, b.data.blendedApr], [[{ name: "A", balance: 100, apr: 5 }, { name: "B", balance: 300, apr: 9 }], 8]);
  assert.deepEqual((await accounts(t.store).findById(loan._id))!.subLoans, [{ name: "A", balance: 10000, apr: 0.05 }, { name: "B", balance: 30000, apr: 0.09 }]);
  const c = (await t.call("PUT", plan(loan._id), { rap: RAP })).body as { data: PaymentPlanDTO };
  assert.deepEqual([c.data.rap, c.data.nextRap], [RAP, null]);
});

test("reading the plan and repeating an identical update writes nothing", async () => {
  await t.call("POST", plan(loan._id), setupBody());
  const update = { schedule: [{ effectiveDate: "2026-12-15", amount: 60 }], subLoans: [{ name: "A", balance: 100, apr: 5 }], rap: RAP };
  await t.call("PUT", plan(loan._id), update);
  const before = [t.writes("accounts"), t.writes("transactions")];
  assert.equal((await t.call("PUT", plan(loan._id), update)).status, 200);
  await dto(loan._id);
  assert.deepEqual([t.writes("accounts"), t.writes("transactions")], before);
});

test("unlink deletes the transfer and the link, and reverses nothing", async () => {
  await t.call("POST", plan(card._id), setupBody());
  const res = await t.call("DELETE", plan(card._id));
  assert.deepEqual([res.status, (res.body as { data: PaymentPlanDTO }).data.payment, (res.body as { data: PaymentPlanDTO }).data.schedule], [200, null, []]);
  assert.equal(await tx().count(), 0);
  assert.equal("paymentTransactionId" in (await accounts(t.store).findById(card._id))!, false);
  assert.deepEqual(await balances(), { Bank: 100000, Card: 20000, Loan: 30000 });
});

test("errors carry today's messages and statuses", async () => {
  const err = (status: number, error: string) => ({ status, body: { error } });
  assert.deepEqual(await t.call("GET", plan(bank._id)), err(400, "Payment plans are for credit cards and debt accounts"));
  for (const id of ["abc", "a".repeat(24)]) assert.deepEqual(await t.call("GET", plan(id)), err(404, "Account not found"));
  assert.deepEqual(await t.call("POST", plan(card._id), { ...setupBody(), fromAccountId: "" }), err(400, "Choose the account payments come from"));
  assert.equal((await t.call("POST", plan(card._id), undefined)).status, 400);
  assert.deepEqual(await t.call("POST", plan(card._id), { ...setupBody(), fromAccountId: loan._id }), err(400, "Payments must come from an active bank account"));
  assert.deepEqual(await t.call("POST", plan(card._id), { ...setupBody(), fromAccountId: "abc" }), err(500, "Failed to update payment plan"));
  assert.deepEqual(await t.call("PUT", plan(card._id), { schedule: [{ effectiveDate: "2026-12-15", amount: 1 }] }), err(409, "No payment linked — set up payments"));
  await t.call("POST", plan(card._id), setupBody());
  assert.deepEqual(await t.call("POST", plan(card._id), setupBody()), err(409, "Payments are already set up for this account — unlink them first"));
  assert.deepEqual(await t.call("PUT", plan(card._id), { schedule: [{ effectiveDate: "2026-12-15", amount: 1 }, { effectiveDate: "2026-12-15", amount: 2 }] }), err(400, "Duplicate date in payment changes"));
  assert.deepEqual(await t.call("PUT", plan(card._id), { rap: RAP }), err(400, "RAP applies to debt accounts only"));
});

test("current behavior: a refused RAP change still writes the schedule sent with it", async () => {
  await t.call("POST", plan(card._id), setupBody());
  assert.equal((await t.call("PUT", plan(card._id), { schedule: [{ effectiveDate: "2026-12-15", amount: 75 }], rap: RAP })).status, 400);
  assert.deepEqual((await tx().find())[0].amountSchedule, [{ effectiveDate: "2026-12-15T00:00:00.000Z", amount: 7500 }]);
});

test("the plan routes post due payments first", async () => {
  await t.call("POST", plan(card._id), { ...setupBody(), startDate: "2026-10-15" });
  await dto(card._id);
  assert.deepEqual(await balances(), { Bank: 90000, Card: 10000, Loan: 30000 }); // 15 Oct and 15 Nov
});
```

- [ ] **Step 2: Run** `npm test` — fails (modules missing).
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test`, `npx tsc --noEmit`, `npx eslint src/lib/finance/api` — clean.
- [ ] **Step 5: Commit** `feat(finance): payment plans over the store`

---

### Task 10: Datasheet profile and merge-rent (R21–R23)

Model tier: most capable.

**Files:**
- Create: `src/lib/finance/api/profile.ts`, `src/lib/finance/api/profile-handlers.ts`
- Modify: `src/lib/finance/api/routes.ts` (add R21–R23)
- Test: `src/lib/finance/api/profile-handlers.test.ts`

**Interfaces:**
- Consumes: Task 6 (`loadProfile`, `profileToDoc`, `profiles`, `saveTransaction`, `assertId`), Task 9 (`regenerateAllRapSchedules`), `buildSalarySchedule`, `buildRentSchedule`, `amountOn`, `getPeriodsPerYear`, `profileFromDollars`, `profileToDollars`, `financeProfileSchema`.
- Produces, in `profile.ts`:
  - `export class LinkedTransactionMissingError extends Error { kind: "Salary" | "Rent"; constructor(kind: "Salary" | "Rent") }` (field declared and assigned explicitly: no parameter property) — message `` `Linked ${kind} transaction not found — pick one` ``.
  - `export async function saveProfileAndApply(store: Store, p: FinanceProfileData, now: Date): Promise<{ salary: boolean; rent: boolean }>` — the body of today's function in today's order (inventory §6 item 13) with rewrites AP1–AP7; `regenerateAllRapSchedules(store, now)` is a static import.
- Produces, in `profile-handlers.ts`: `getProfile`, `saveProfile`, `mergeRent: Handler`. `mergeRent` keeps today's order: schema check, `assertId(keepId)` and `assertId(mergeId)`, both reads (shaped for logic, `keep` also kept raw), `loadProfile`, build `rentSteps`, M2, M3, `saveProfileAndApply`, `loadProfile`. A `LinkedTransactionMissingError` becomes `fail(409, error.message)` in `saveProfile` and `mergeRent`.

- [ ] **Step 1: Write the failing tests.** Helpers as before (bank 1000). `const PROFILE = { filingStatus: "single", hoursPerWeek: 40, nycResident: false, raiseRate: 0.03, salarySteps: [{ effectiveDate: "2025-01-01", annualGross: 80000 }], retirementSteps: [], healthSteps: [], rentSteps: [], whatIfSalaries: [] };` `const recurring = (over: object) => post({ isRecurring: true, ...over })` where `post` is Task 8's helper.

```ts
test("no profile yet: the defaults, in dollars", async () => {
  assert.deepEqual(await t.call("GET", "/api/finance-profile"), { status: 200, body: { data: { filingStatus: "single", hoursPerWeek: 40, nycResident: false, raiseRate: 0.03, salaryTransactionId: null, rentTransactionId: null, salarySteps: [], retirementSteps: [], healthSteps: [], rentSteps: [], whatIfSalaries: [] } } });
});

test("validation and missing links leave nothing saved", async () => {
  const bad = await t.call("PUT", "/api/finance-profile", { ...PROFILE, salarySteps: [] });
  assert.deepEqual([bad.status, (bad.body as { error: string }).error, Object.keys((bad.body as { details: object }).details).sort()], [400, "Add at least one salary", ["fieldErrors", "formErrors"]]);
  assert.equal((await t.call("PUT", "/api/finance-profile", undefined)).status, 400);
  assert.deepEqual(await t.call("PUT", "/api/finance-profile", { ...PROFILE, salaryTransactionId: "a".repeat(24) }), { status: 409, body: { error: "Linked Salary transaction not found — pick one" } });
  assert.deepEqual(await t.call("PUT", "/api/finance-profile", { ...PROFILE, rentTransactionId: "a".repeat(24) }), { status: 409, body: { error: "Linked Rent transaction not found — pick one" } });
  assert.deepEqual(await t.call("PUT", "/api/finance-profile", { ...PROFILE, rentTransactionId: "abc" }), { status: 500, body: { error: "Failed to save profile" } });
  assert.equal(await profiles(t.store).count(), 0);
});

test("saving writes the rent schedule, moves the rent start, and keeps one profile document", async () => {
  const rent = await recurring({ amount: 1500, date: "2026-09-01", description: "Rent", recurrenceRule: { frequency: "monthly", startDate: "2026-09-01", dayOfMonth: 1 } });
  const body = { ...PROFILE, rentTransactionId: rent._id, rentSteps: [{ effectiveDate: "2027-01-01", monthly: 1600 }, { effectiveDate: "2026-08-01", monthly: 1500 }], whatIfSalaries: [{ label: " Stretch ", annualGross: 120000 }] };
  const res = await t.call("PUT", "/api/finance-profile", body);
  assert.deepEqual([res.status, (res.body as { updated: object }).updated], [200, { salary: false, rent: true }]);
  assert.deepEqual((res.body as { data: FinanceProfileData }).data, { ...body, salaryTransactionId: null, whatIfSalaries: [{ label: "Stretch", annualGross: 120000 }] });
  const stored = (await tx().findById(rent._id))!;
  assert.deepEqual(stored.amountSchedule, [{ effectiveDate: "2026-08-01T00:00:00.000Z", amount: 150000 }, { effectiveDate: "2027-01-01T00:00:00.000Z", amount: 160000 }]);
  assert.deepEqual([stored.amount, stored.date, stored.recurrenceRule], [150000, "2026-08-01T00:00:00.000Z", { frequency: "monthly", interval: 1, startDate: "2026-08-01T00:00:00.000Z", endDate: null, dayOfMonth: 1, daysOfMonth: [] }]);
  await t.call("PUT", "/api/finance-profile", body);
  assert.equal(await profiles(t.store).count(), 1);
  assert.equal((await profiles(t.store).findOne({}))!.rentSteps[0].effectiveDate, "2027-01-01T00:00:00.000Z");
});

test("a second identical save writes nothing to transactions; unlinking clears the schedule and keeps the amount", async () => {
  const salary = await recurring({ amount: 2000, type: "credit", date: "2026-10-02", description: "Salary", recurrenceRule: { frequency: "biweekly", startDate: "2026-10-02" } });
  const body = { ...PROFILE, salaryTransactionId: salary._id };
  const first = await t.call("PUT", "/api/finance-profile", body);
  assert.deepEqual((first.body as { updated: object }).updated, { salary: true, rent: false });
  const stored = (await tx().findById(salary._id))!;
  assert.ok(stored.amountSchedule!.length >= 1 && stored.amountSchedule!.every((s) => s.effectiveDate.endsWith("T00:00:00.000Z") && Number.isInteger(s.amount) && s.amount > 0));
  assert.equal(stored.amount, amountOn(stored.amountSchedule![0].amount, stored.amountSchedule, "2026-11-17"));
  const writes = t.writes("transactions");
  await t.call("PUT", "/api/finance-profile", body);
  assert.equal(t.writes("transactions"), writes);
  await t.call("PUT", "/api/finance-profile", { ...PROFILE, salaryTransactionId: null });
  const cleared = (await tx().findById(salary._id))!;
  assert.deepEqual(["amountSchedule" in cleared, cleared.amount], [false, stored.amount]);
});

test("merge-rent folds the second rent in as a dated step, extends the first, and deletes the second", async () => {
  const keep = await recurring({ amount: 1500, date: "2026-09-01", description: "Rent", recurrenceRule: { frequency: "monthly", startDate: "2026-09-01", dayOfMonth: 1 } });
  const merge = await recurring({ amount: 1650, date: "2027-01-01", description: "Rent 2", recurrenceRule: { frequency: "monthly", startDate: "2027-01-01", endDate: "2027-12-01", dayOfMonth: 1 } });
  const res = await t.call("POST", "/api/finance-profile/merge-rent", { keepId: keep._id, mergeId: merge._id });
  assert.deepEqual([res.status, (res.body as { updated: object }).updated], [200, { salary: false, rent: true }]);
  const data = (res.body as { data: FinanceProfileData }).data;
  assert.deepEqual([data.rentTransactionId, data.rentSteps], [keep._id, [{ effectiveDate: "2026-09-01", monthly: 1500 }, { effectiveDate: "2027-01-01", monthly: 1650 }]]);
  assert.equal(await tx().findById(merge._id), null);
  const stored = (await tx().findById(keep._id))!;
  assert.deepEqual([stored.recurrenceRule!.endDate, stored.amountSchedule!.map((s) => s.amount)], ["2027-12-01T00:00:00.000Z", [150000, 165000]]);
});

test("merge-rent errors", async () => {
  const keep = await recurring({ recurrenceRule: { frequency: "monthly", startDate: "2026-09-01" } });
  const once = await post({ date: "2026-11-02" });
  const same = { status: 400, body: { error: "keepId and mergeId must be two different transactions" } };
  assert.deepEqual(await t.call("POST", "/api/finance-profile/merge-rent", { keepId: keep._id, mergeId: keep._id }), same);
  assert.deepEqual(await t.call("POST", "/api/finance-profile/merge-rent", undefined), same);
  for (const mergeId of ["a".repeat(24), once._id]) {
    assert.deepEqual(await t.call("POST", "/api/finance-profile/merge-rent", { keepId: keep._id, mergeId }), { status: 404, body: { error: "Both transactions must exist and be recurring" } });
  }
  assert.deepEqual(await t.call("POST", "/api/finance-profile/merge-rent", { keepId: keep._id, mergeId: "abc" }), { status: 500, body: { error: "Failed to merge rent" } });
});
```

- [ ] **Step 2: Run** `npm test` — fails (modules missing).
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test`, `npx tsc --noEmit`, `npx eslint src/lib/finance/api` — clean.
- [ ] **Step 5: Commit** `feat(finance): Datasheet profile and merge-rent over the store`

---

### Task 11: Projections and summary (R18–R20)

Model tier: standard.

**Files:**
- Create: `src/lib/finance/api/projection-handlers.ts`
- Modify: `src/lib/finance/api/routes.ts` (add R18–R20; the table is now complete: 23 routes)
- Test: `src/lib/finance/api/projection-handlers.test.ts`

**Interfaces:**
- Consumes: Tasks 5–7; `buildProjection`; `applySandbox`, `applySandboxProfile`, `sandboxSchema`; `profileFromDollars`; the date helpers in `dates.ts`.
- Produces: `getProjection`, `postProjection`, `getSummary: Handler`.
- Port `projections/route.ts` and `summary/route.ts` line for line, changing only:
  - database reads → PR1–PR6, SU1, SU2 from the rewrite table;
  - `localTodayStr()` → `localDateStr(now)` (three places in projections, one in summary), and pass `today: localDateStr(now)` to every `buildProjection` call;
  - filter dates: `filterDate` from `dates.ts` for `queryStart`, `endDate` and the summary bounds. An unparseable filter date is a 500, as the Mongoose cast is today (`?startDate=1garbage` sorts before today, so it reaches the filter). R09 (`startDate=garbage`) is a 400 for an unrelated reason: `"garbage"` sorts after today, so the filter uses today, and the engine then throws `RangeError`;
  - `assertId(accountId)` when `accountId` is given: in `getProjection` on the non-sandbox path immediately before the transaction query; in `getSummary` immediately before the transaction query; never in `postProjection` (the sandbox path sends no id to the database);
  - `dataVersion` keeps its exact format: `` `${count}|${latestMs}|${profileMs}|${accounts.map((a) => `${a._id}:${a.balance}:${ms(a.updatedAt)}`).sort().join(",")}` `` with milliseconds from `asDate(x).getTime()` and `0` when absent;
  - error mapping: `RangeError` → `fail(400, error.message)`; an error whose `name === "ZodError"` in `postProjection` → `fail(400, "Invalid projection request", JSON.parse(JSON.stringify(error.issues)))`; anything else rethrown;
  - `getProjection` runs `postDuePayments` before the `startDate and endDate are required` check, as today.

- [ ] **Step 1: Write the failing tests.** Helpers as in Task 8 (bank 1000) plus `const savings = await acct({ name: "Savings", type: "bank", balance: 0 })` in `beforeEach`.

```ts
const proj = async (qs: string) => (await t.call("GET", `/api/projections${qs}`)).body as { data: ProjectionResult; dataVersion: string };
const NOV = "?startDate=2026-11-01&endDate=2026-11-30";
const on = (r: { data: ProjectionResult }, date: string) => r.data.timeline.find((d) => d.date === date)!.transactions.map((x) => [x.description, x.amount, x.isProjected]);

test("projection: past transactions shown, recurring ones projected, balances carried forward", async () => {
  await post({ amount: 100, description: "shoes", categoryTags: ["spending"] });                                           // 10 Nov, applied
  await post({ amount: 500, type: "credit", description: "pay", isRecurring: true, recurrenceRule: { frequency: "monthly", startDate: "2026-11-20", dayOfMonth: 20 } });
  await post({ amount: 7, description: "ended", isRecurring: true, recurrenceRule: { frequency: "daily", startDate: "2026-01-01", endDate: "2026-10-31" } });
  const r = await proj(NOV);
  assert.equal(r.data.timeline.length, 30);
  assert.deepEqual(on(r, "2026-11-10"), [["shoes", 10000, false]]);
  assert.deepEqual(on(r, "2026-11-20"), [["pay", 50000, true]]);
  assert.equal(r.data.timeline.flatMap((d) => d.transactions).some((x) => x.description === "ended"), false);
  assert.equal(r.data.summary.endBalances[bank._id], 140000);
  assert.equal((await proj(`${NOV}&granularity=monthly`)).data.timeline.length, 1);
});

test("the account filter includes transfers into the account", async () => {
  await post({ amount: 50, type: "transfer", toAccountId: savings._id, description: "move" });
  await post({ amount: 9, description: "other" });
  const r = await proj(`${NOV}&accountId=${savings._id}`);
  assert.deepEqual(r.data.timeline.flatMap((d) => d.transactions).map((x) => x.description), ["move"]);
});

test("dataVersion is stable while nothing changes and moves when data does", async () => {
  const a = (await proj(NOV)).dataVersion;
  assert.match(a, /^0\|0\|0\|[0-9a-f]{24}:\d+:\d+(,[0-9a-f]{24}:-?\d+:\d+)*$/);
  assert.equal((await proj(NOV)).dataVersion, a);
  await post();
  const b = (await proj(NOV)).dataVersion;
  assert.ok(b !== a && b.startsWith("1|"));
});

test("projection errors", async () => {
  assert.deepEqual(await t.call("GET", "/api/projections?startDate=2026-11-01"), { status: 400, body: { error: "startDate and endDate are required" } });
  assert.deepEqual(await t.call("GET", "/api/projections?startDate=1900-01-01&endDate=2100-01-01"), { status: 400, body: { error: "Projection window exceeds 36600 days" } });
  assert.deepEqual(await t.call("GET", `/api/projections${NOV}&accountId=abc`), { status: 500, body: { error: "Failed to generate projections" } });
  assert.deepEqual(await t.call("GET", "/api/projections?startDate=1garbage&endDate=2026-12-31"), { status: 500, body: { error: "Failed to generate projections" } });
  assert.deepEqual(await t.call("GET", "/api/projections?startDate=garbage&endDate=2026-12-31"), { status: 400, body: { error: "Invalid time value" } });
  const bad = await t.call("POST", "/api/projections", {});
  assert.deepEqual([bad.status, (bad.body as { error: string }).error, Array.isArray((bad.body as { details: unknown }).details)], [400, "Invalid projection request", true]);
  assert.equal((await t.call("POST", "/api/projections", undefined)).status, 400);
});

test("a sandbox projection applies what-if changes and saves nothing", async () => {
  const real = await post({ amount: 100, description: "shoes" });
  const writes = [t.writes("accounts"), t.writes("transactions")];
  const res = await t.call("POST", "/api/projections", { startDate: "2026-11-01", endDate: "2026-11-30", sandbox: {
    added: [{ id: "s1", data: { amount: 42, date: "2026-11-25", description: "what-if", accountId: bank._id, type: "debit" } }], removed: [real._id] } });
  assert.equal(res.status, 200);
  const all = (res.body as { data: ProjectionResult }).data.timeline.flatMap((d) => d.transactions).map((x) => [x.description, x.amount]);
  assert.deepEqual(all, [["what-if", 4200]]);
  assert.deepEqual([t.writes("accounts"), t.writes("transactions")], writes);
});

const summary = async (qs: string) => (await t.call("GET", `/api/summary${qs}`)).body as { data: SummaryResult };

test("summary: periods, days or months, totals and category breakdown", async () => {
  await post({ amount: 100, description: "shoes", categoryTags: ["spending"] });
  const month = (await summary("?view=monthly&date=2026-11-17")).data;
  assert.deepEqual([month.view, month.period, month.days!.length, month.months], ["monthly", { start: "2026-11-01", end: "2026-11-30", label: "November 2026" }, 30, undefined]);
  assert.deepEqual([month.totals.expenses, month.categoryBreakdown], [10000, [{ category: "spending", amount: 10000, percentage: 1 }]]);
  assert.deepEqual((await summary("?view=weekly&date=2026-11-17")).data.period, { start: "2026-11-15", end: "2026-11-21", label: "Week of Nov 15, 2026" });
  const year = (await summary("?view=annual&date=2026-11-17")).data;
  assert.deepEqual([year.period, year.months!.length, year.days], [{ start: "2026-01-01", end: "2026-12-31", label: "2026" }, 12, undefined]);
  assert.deepEqual((await summary("")).data.period.start, "2026-11-01"); // defaults: monthly, today from the clock
  assert.deepEqual(await t.call("GET", "/api/summary?date=garbage"), { status: 400, body: { error: "Invalid time value" } });
  assert.deepEqual(await t.call("GET", "/api/summary?accountId=abc"), { status: 500, body: { error: "Failed to generate summary" } });
});

test("current behavior: the summary account filter misses transfers into the account", async () => {
  await post({ amount: 50, type: "transfer", toAccountId: savings._id });
  const days = (await summary(`?view=monthly&date=2026-11-17&accountId=${savings._id}`)).data.days!;
  assert.equal(days.flatMap((d) => d.transactions).length, 0);
});

test("current behavior: an unknown view uses the year's bounds with daily entries", async () => {
  const odd = (await summary("?view=bogus&date=2026-11-17")).data;
  assert.deepEqual([odd.view, odd.period.start, odd.period.end, odd.days!.length], ["bogus", "2026-01-01", "2026-12-31", 365]);
});
```

- [ ] **Step 2: Run** `npm test` — fails (module missing).
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test`, `npx tsc --noEmit`, `npx eslint src/lib/finance/api` — clean. Confirm `grep -rn "new Date()\|Date.now()\|localTodayStr" src/lib/finance/api --include="*.ts" | grep -v "\.test\.ts"` prints nothing.
- [ ] **Step 5: Commit** `feat(finance): projection and summary handlers over the store`

---

### Task 12: In-process replay of the golden transcript (D10)

Model tier: most capable (resolving mismatches needs judgment about which side is wrong; the golden never is).

**Files:**
- Create: `src/lib/finance/api/parity.test.ts`

**Interfaces:**
- Consumes: `buildScenario`, `Step` (`scripts/finance-parity/scenario.ts`); `createNormalizer`, `compareTranscripts`, `substitute`, `Transcript` (`scripts/finance-parity/normalize.ts`); `scripts/finance-parity/golden/transcript.json` (read with `readFileSync` relative to `process.cwd()`); `financeRoutes`; `dispatch`; `BrowserStore`, `memoryStorage`.
- Produces: one test, `the handlers reproduce the golden transcript on a browser store`.

How the replay runs:
1. Read the golden. Assert `process.env.TZ === golden.meta.timeZone`.
2. `const now = new Date(golden.meta.capturedAt)`; `const steps = buildScenario(golden.meta.localDate)`; assert `localDateStr(now) === golden.meta.localDate`.
3. Fresh `BrowserStore(memoryStorage())`. For each step in order: substitute saved ids; `await dispatch(financeRoutes, store, step.method, path, step.rawBody !== undefined ? undefined : body, now)`; JSON-round-trip the result body (drops `undefined`, turns `Infinity` into `null`, as HTTP does); record the `save`; run the N7 order checks (for the third one, read `transactions(store).find({}, { sort: { createdAt: 1 } })` before a projections or summary step); normalize; then `await new Promise((r) => setTimeout(r, 2))` so that documents written by different requests never share a `createdAt` / `updatedAt` millisecond (the stores sort and compare on them).
4. Build `finalBalances` from step Z09 and assert `compareTranscripts(golden, actual, steps)` is `[]`, printing the differences in the assertion message.

- [ ] **Step 1: Write the test** as described. Use `assert.deepEqual(differences, [], differences.join("\n"))`.
- [ ] **Step 2: Run** `npm test`. Work through every difference. The rule for each: the golden is what the unconverted code did, so change the handler (or `docs.ts`) until it agrees; never edit the golden, the normalizer or the scenario to make a difference disappear. A difference that cannot be removed without breaking a decision or a handler test from Tasks 6–11 is reported to the lead with the step id and both bodies; do not continue past it.
- [ ] **Step 3: Run** `npm test`, `npx tsc --noEmit`, `npx eslint src/lib/finance/api scripts/finance-parity` — clean. The whole suite stays under one minute (the replay sleeps about 2 ms × 170 steps).
- [ ] **Step 4: Commit** `test(finance): replay the golden transcript against the store handlers`

---

### Task 13: Finance routes on the adapter

Model tier: standard.

**Files:**
- Modify (each becomes `serve()` exports only, e.g. `export const GET = serve("GET", "/api/accounts/:accountId");`): `src/app/api/accounts/route.ts` (GET, POST), `accounts/[accountId]/route.ts` (GET, PUT, PATCH, DELETE), `accounts/[accountId]/payment-plan/route.ts` (GET, POST, PUT, DELETE), `transactions/route.ts` (GET, POST), `transactions/[transactionId]/route.ts` (GET, PUT, DELETE), `categories/route.ts` (GET, POST), `projections/route.ts` (GET, POST), `summary/route.ts` (GET), `finance-profile/route.ts` (GET, PUT), `finance-profile/merge-rent/route.ts` (POST)
- Modify: `src/lib/db.ts` — move `runSeeds` in from `src/lib/finance/seed.ts` unchanged (import `Account` from `@/models/finance/Account`; drop the import of `@/lib/finance/seed`)
- Delete: `src/lib/finance/seed.ts`, `src/lib/finance/post-payments.ts`, `src/lib/finance/payment-plan.ts`, `src/lib/finance/apply-profile.ts`
- Modify: `eslint.config.mjs` — `const CONVERTED_MODULES = ["links", "future", "finance"];`

**Interfaces:**
- Consumes: `serve(method, path)`; `financeRoutes` in `allRoutes` (Task 7).
- Produces: nothing new. `routes-match-files.test.ts` now checks 23 more exports.

- [ ] **Step 1: Replace the ten route files, move the seed, delete the four library files, update ESLint.**
- [ ] **Step 2: Run** `npm test`, `npx tsc --noEmit`, `npx eslint` (whole project) — clean. `grep -rn "@/models" src/lib/finance` prints nothing.
- [ ] **Step 3: HTTP parity against the golden.** `node scripts/finance-parity/reset-db.mjs`; start the parity server; `… run.ts check --base http://localhost:3032`; stop the server. Expected output: no differences. Record the command output in the task report.
  - **If today's date differs from `meta.localDate` in the committed golden** (the usual case), `check` refuses to compare. Produce a same-day baseline from the unconverted code, without the network:
    1. `BASE=/private/tmp/claude-501/-Users-danmuck--claude-spares-spare-v5ZS5m/659dd1e0-be77-4fef-ab7b-c2b0b40257ef/scratchpad/finance-wt-base`; from the worktree run `git worktree add "$BASE" finance-parity-base`.
    2. `cp -cR node_modules "$BASE/node_modules"` (an APFS clone: a real directory, no download; a symlink does not work with Next 16's bundler).
    3. `node scripts/finance-parity/reset-db.mjs`; in `$BASE` start the old code: `TZ=America/New_York NEXT_DIST_DIR=.next-parity-base MONGODB_URI=mongodb://localhost:27017/tracker_parity npx next dev -p 3033`.
    4. From the worktree: `… run.ts capture --base http://localhost:3033 --out "$BASE/golden.today.json"`; stop that server.
    5. `node scripts/finance-parity/reset-db.mjs`; start the converted code from the worktree on 3032; `… run.ts check --base http://localhost:3032 --golden "$BASE/golden.today.json"`; stop it.
    6. `git worktree remove --force "$BASE"`.
    The committed golden is not replaced: the in-process test (Task 12) keeps using it with its recorded clock. If any of these commands cannot run, stop and ask the lead.
- [ ] **Step 4: Confirm the adapter's other paths by hand on the parity server** (same database, after the check): `GET /api/accounts/abc` → 404 `{"error":"Account not found"}`; `POST /api/transactions` with body `{` → 400. Stop the server.
- [ ] **Step 5: Commit** `feat(finance): serve Finance routes through the store adapter`

**Lead checkpoint (D11), not an implementer step.** After this commit the session lead, using a server started from the worktree on a port in 3031–3036, captures the GET responses listed under "Real-data capture" from the converted code and compares them with the capture from `finance-parity-base`. Tasks 14 and 15 do not start until the lead reports the comparison clean; the branch reaches the owner's checkout only by the lead's merge after that.

---

### Task 14: Finance hooks on the request helper (D12)

Model tier: mechanical.

**Files:**
- Modify: `src/hooks/finance/use-accounts.ts`, `use-transactions.ts`, `use-categories.ts`, `use-finance-profile.ts`, `use-payment-plan.ts`, `use-projections.ts`, `use-summary.ts`, `src/components/finance/projection-transactions.tsx`
- Test: `src/hooks/finance/no-direct-fetch.test.ts`

**Interfaces:**
- Consumes: `fetcher(url)` and `send<T>(url, method, body?)` from `src/hooks/request.ts`.
- Produces: no change to any exported name, parameter list, SWR key, or how a response is unwrapped:

| File | Change |
|---|---|
| `use-accounts.ts` | delete the local `fetcher`; `useSWR(key, fetcher)` with the shared one; `createAccount` → `send("/api/accounts", "POST", { ...data, balance: data.balance, creditLimit: data.creditLimit })`; `updateAccount` → `send(\`/api/accounts/${id}\`, "PUT", …same body)`; `deleteAccount` → `send(url, "DELETE")`; `setAccountArchived` → `send(url, "PATCH", { isArchived })`. Still `(data \|\| []) as Account[]` and `data as Account`. |
| `use-transactions.ts` | shared `fetcher`; `createTransaction` / `updateTransaction` / `deleteTransaction` → `send`. `useTransaction` still reads `data?.data` (known bug, unchanged). |
| `use-categories.ts`, `use-summary.ts` | shared `fetcher` only. |
| `use-finance-profile.ts` | shared `fetcher`; delete the local `send`; `saveFinanceProfile` → `send<{ data: FinanceProfileData; updated: { salary: boolean; rent: boolean } }>("/api/finance-profile", "PUT", profileToDollars(profile))`; `mergeRent` likewise with `"POST"`. |
| `use-payment-plan.ts` | shared `fetcher`; the local `send(accountId, method, body)` keeps its name and signature and calls the shared one (import it under another name): `const json = await request<{ data: PaymentPlan }>(planKey(accountId), method, body); await refreshAfterWrite(accountId, json.data); return json.data;`. `isError` stays `!!error \|\| !!data?.error`. |
| `use-projections.ts` | shared `fetcher`; `sandboxFetcher = ([url, body]: [string, string]) => send(url, "POST", JSON.parse(body))`. Keys unchanged (`"/api/projections?…"` and `["/api/projections", <json string>]`). |
| `projection-transactions.tsx` | line 93: `const tx = (await fetcher(\`/api/transactions/${id}\`)) as Transaction; if (!tx?._id) throw new Error();` inside the existing `try`. |

Thrown error messages come from the shared helper: the response's `error` string when there is one, else `Request failed: <status>` (change (b)).

- [ ] **Step 1: Write the failing test.**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(join(dir, e.name)) : /\.tsx?$/.test(e.name) && !e.name.endsWith(".test.ts") ? [join(dir, e.name)] : [],
  );
}

test("Finance client code reaches data only through the request helper", () => {
  const roots = ["src/hooks/finance", "src/components/finance", "src/app/(app)/finance", "src/components/dashboard"].map((d) => join(process.cwd(), ...d.split("/")));
  const all = roots.flatMap(files);
  assert.ok(all.length > 20);
  const offenders = all.filter((f) => /(^|[^.\w])fetch\(/.test(readFileSync(f, "utf8")));
  assert.deepEqual(offenders, []);
  for (const hook of files(roots[0]).filter((f) => /use-(accounts|transactions|categories|finance-profile|payment-plan|projections|summary)\.ts$/.test(f))) {
    assert.match(readFileSync(hook, "utf8"), /from "@\/hooks\/request"/, hook);
  }
});
```

- [ ] **Step 2: Run** `npm test` — the new test fails, listing the seven hook files and the component.
- [ ] **Step 3: Implement** the table.
- [ ] **Step 4: Run** `npm test`, `npx tsc --noEmit`, `npx eslint src/hooks/finance src/components/finance` — clean. Start the scratch server (Global Constraints) and request the HTML only, e.g. `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3031/finance`, for `/finance`, `/finance/accounts`, `/finance/transactions`, `/finance/projections`, `/finance/datasheet` and `/`: each prints 200 and the server log shows no compile error. Do not open the pages in a browser. Stop the server.
- [ ] **Step 5: Commit** `refactor(finance): hooks use the shared request helper`

---

### Task 15: Sample data and browser mode (D13)

Model tier: standard.

**Files:**
- Create: `src/lib/demo/finance.ts`
- Modify: `src/lib/demo/index.ts` (load Finance sample data too), `src/lib/demo/demo.test.ts`, `src/lib/modules.ts` (`browserData: true` for `finance`), `CLAUDE.md`

**Interfaces:**
- Consumes: `dispatch`, `unwrap` (`src/lib/data/dispatch.ts`); `financeRoutes`; `accounts`, `transactions`, `categories`, `profiles` (`docs.ts`); `AccountFormData`, `TransactionFormData`, `FinanceProfileData` types; `date-fns` `addDays`, `format`, `startOfMonth`, `addMonths`, `startOfYear`.
- Produces:
  - `financeSample(today: Date): { accounts: (AccountFormData & { key: string })[]; transactions: (Omit<TransactionFormData, "accountId" | "toAccountId" | "date"> & { key?: string; account: string; toAccount?: string; date: string })[]; profile: Omit<FinanceProfileData, "salaryTransactionId" | "rentTransactionId"> }` — request bodies in the API's units (dollars, percent, `yyyy-MM-dd`), with `account` / `toAccount` naming an account `key`. Contents, all obviously fictional:

    | Accounts (`key`: body) |
    |---|
    | `checking`: `{ name: "Everyday Checking (sample)", type: "bank", balance: 3200 }` |
    | `savings`: `{ name: "Rainy Day Savings (sample)", type: "bank", balance: 12500 }` |
    | `card`: `{ name: "Example Rewards Card", type: "credit_card", balance: 480, creditLimit: 4000, apr: 21.99, minimumPayment: 35 }` |
    | `loan`: `{ name: "Example Auto Loan", type: "debt", balance: 9800, isLoan: true, apr: 6.9, minimumPayment: 245 }` |

    One-off transactions, in this order (`date` = `today` plus the offset in days):

    | offset | type | account → toAccount | amount | description | categoryTags |
    |---|---|---|---|---|---|
    | −27 | debit | checking | 86.40 | Groceries at Example Mart | spending |
    | −24 | debit | card | 14.99 | StreamFlix (sample) | subscriptions |
    | −21 | debit | checking | 120.00 | Electric bill (sample) | bills |
    | −18 | credit | checking | 250.00 | Year-end bonus (sample) | bonus |
    | −15 | debit | card | 62.30 | Dinner at Sample Bistro | spending |
    | −12 | transfer | checking → savings | 300.00 | Move to savings | transfer |
    | −9 | debit | checking | 45.00 | Phone bill (sample) | bills |
    | −6 | transfer | checking → card | 200.00 | Card payment | credit, transfer |
    | −4 | debit | card | 38.75 | Example Hardware | other |
    | −2 | debit | checking | 64.10 | Groceries at Example Mart | spending |
    | +3 | debit | checking | 55.00 | Internet bill (sample) | bills |
    | +8 | transfer | checking → loan | 245.00 | Auto loan payment | loans, transfer |

    Recurring: `key: "salary"` — credit, checking, 2150, "Salary (sample)", `["salary"]`, `date` and `recurrenceRule.startDate` = `today − 56 days`, `{ frequency: "biweekly" }`; `key: "rent"` — debit, checking, 1450, "Rent (sample)", `["bills"]`, `date` and `startDate` = the first day of the month three months before `today`'s month, `{ frequency: "monthly", dayOfMonth: 1 }`.

    Profile (dollars): `filingStatus: "single"`, `hoursPerWeek: 40`, `nycResident: false`, `raiseRate: 0.03`, `salarySteps: [{ effectiveDate: <1 Jan of last year>, annualGross: 78000 }]`, `retirementSteps: [{ effectiveDate: <same>, percent: 0.05 }]`, `healthSteps: [{ effectiveDate: <same>, perPaycheck: 90 }]`, `rentSteps: [{ effectiveDate: <the rent start date>, monthly: 1450 }]`, `whatIfSalaries: [{ label: "Promotion (sample)", annualGross: 90000 }]`.
  - `loadSampleData(store: Store, today: Date = new Date()): Promise<void>` — still loads Links and Future, and now Finance: clear `transactions`, `accounts`, `financeCategories`, `financeProfile`; then send the sample through the real handlers with `today` as the clock, using a local `request = async (method, url, body?) => unwrap(await dispatch(financeRoutes, store, method, url, body, today))`: `GET /api/categories` (seeds the defaults and the Cash account), `POST /api/accounts` for each account in order, `POST /api/transactions` for each one-off in order then the two recurring ones, `PUT /api/finance-profile` with the profile plus `salaryTransactionId` / `rentTransactionId` set to the two created ids.
  - `availableModules("browser")` now returns `finance`, `future`, `links`.

- [ ] **Step 1: Update and add tests** in `src/lib/demo/demo.test.ts`.

```ts
test("loadSampleData fills Finance through the real handlers, relative to today, and twice does not duplicate", async () => {
  const store = new BrowserStore(memoryStorage());
  const today = new Date(2026, 10, 17, 10);
  await loadSampleData(store, today);
  await loadSampleData(store, today);
  const accts = await store.collection<Account>("accounts").find();
  assert.deepEqual(Object.fromEntries(accts.map((a) => [a.name, a.balance])), {
    Cash: 0, "Everyday Checking (sample)": 263450, "Rainy Day Savings (sample)": 1280000, "Example Rewards Card": 39604, "Example Auto Loan": 980000 });
  assert.deepEqual(accts.map((a) => a.type).sort(), ["bank", "bank", "bank", "credit_card", "debt"]);
  const txs = await store.collection<TransactionDoc>("transactions").find({}, { sort: { date: 1 } });
  assert.equal(txs.length, 14);
  const oneOff = txs.filter((x) => !x.isRecurring);
  assert.deepEqual([oneOff.length, oneOff[0].date, oneOff[11].date], [12, "2026-10-21T00:00:00.000Z", "2026-11-25T00:00:00.000Z"]);
  assert.deepEqual(oneOff.filter((x) => !x.balanceApplied).map((x) => x.description), ["Internet bill (sample)", "Auto loan payment"]);
  const defaults = (await store.collection<Category>("financeCategories").find()).map((c) => c.name);
  assert.equal(defaults.length, 9);
  assert.ok(txs.every((x) => x.categoryTags.length > 0 && x.categoryTags.every((tag) => defaults.includes(tag))));
  assert.ok(new Set(oneOff.flatMap((x) => x.categoryTags)).size >= 7);
  const [salary, rent] = [txs.find((x) => x.description === "Salary (sample)")!, txs.find((x) => x.description === "Rent (sample)")!];
  assert.deepEqual([salary.date, rent.date, rent.amount], ["2026-09-22T00:00:00.000Z", "2026-08-01T00:00:00.000Z", 145000]);
  assert.ok(salary.amountSchedule!.length >= 1 && salary.amount > 100000 && salary.amount < 300000); // net pay per paycheck
  assert.equal(await store.collection("financeProfile").count(), 1);
});

test("the sample gives the dashboard, summary and projections something to show", async () => {
  const store = new BrowserStore(memoryStorage());
  const today = new Date(2026, 10, 17, 10);
  await loadSampleData(store, today);
  const get = (url: string) => dispatch(financeRoutes, store, "GET", url, undefined, today);
  const summary = (await get("/api/summary?view=monthly&date=2026-11-17")).body as { data: SummaryResult };
  assert.ok(summary.data.totals.income > 0 && summary.data.totals.expenses > 0 && summary.data.categoryBreakdown.length >= 3);
  const projection = await get("/api/projections?startDate=2026-11-01&endDate=2027-01-31&granularity=weekly");
  assert.equal(projection.status, 200);
  assert.ok((projection.body as { data: ProjectionResult }).data.timeline.length > 10);
  assert.equal(((await get("/api/accounts")).body as Account[]).length, 5);
});

test("sample bodies pass the module's own validation", () => {
  const sample = financeSample(new Date(2026, 10, 17, 10));
  for (const { key, ...data } of sample.accounts) assert.equal(accountSchema.safeParse(data).success, true, key);
  for (const { key, account, toAccount, ...data } of sample.transactions) {
    assert.equal(transactionSchema.safeParse({ ...data, accountId: "a".repeat(24), ...(toAccount ? { toAccountId: "b".repeat(24) } : {}) }).success, true, data.description);
    assert.ok(sample.accounts.some((a) => a.key === account));
  }
  assert.equal(financeProfileSchema.safeParse(sample.profile).success, true);
});
```

and change the existing `availableModules` assertion to `["finance", "future", "links"]`.

- [ ] **Step 2: Run** `npm test` — the new tests fail.
- [ ] **Step 3: Implement** the sample file, the loader change and the `browserData` flag. In `CLAUDE.md`: "Converted so far: Links, Future, Finance"; replace the "Seed" line with "the Cash account upsert lives in `src/lib/db.ts`; browser data creates it through `ensureCashAccount` in `src/lib/finance/api/docs.ts`"; add one line each for `scripts/finance-parity/` (what it proves and how to run `check`), for the `now` clock in `HandlerContext`, and for dotted paths / `$and` in the query evaluator.
- [ ] **Step 4: Run** `npm test`, `npx tsc --noEmit`, `npx eslint` — clean. Start the scratch server (Global Constraints) and, with `curl` only (no browser), confirm `/`, `/finance`, `/finance/projections` return 200 with no compile errors in the log. Stop the server.
- [ ] **Step 5: Commit** `feat(finance): sample data and browser data mode for the Finance module`

---

## Real-data capture (D11) — for the session lead

Run once against the code at tag `finance-parity-base` and once against the converted code (after Task 13), each on a fresh copy of the owner's data in a scratch database, on the same calendar day, with `TZ=America/New_York`, in exactly this order (the first request posts due payments and applies pending transactions, so order matters and the database must be re-copied between the two runs). `D` is the capture day as `yyyy-MM-dd`; `Y` its year.

1. `GET /api/accounts`
2. `GET /api/accounts?includeArchived=true`, then `?type=bank`, `?type=credit_card`, `?type=debt` (each also with `&includeArchived=true`)
3. For every account id from step 2: `GET /api/accounts/<id>`
4. For every account id: `GET /api/accounts/<id>/payment-plan` (bank accounts answer 400; record that too)
5. `GET /api/categories`
6. `GET /api/finance-profile`
7. `GET /api/transactions`, `?page=2`, `?limit=100000&sort=createdAt&order=asc`, `?isRecurring=true&limit=100000&sort=createdAt&order=asc`, `?isRecurring=false&limit=100000&sort=createdAt&order=asc`, `?type=transfer&limit=100000&sort=createdAt&order=asc`, `?startDate=<Y>-01-01&endDate=<Y>-12-31&limit=100000&sort=createdAt&order=asc`, `?search=a&limit=100000&sort=createdAt&order=asc`; for every account id `?accountId=<id>&limit=100000&sort=createdAt&order=asc`; for each of the nine default category names `?category=<name>&limit=100000&sort=createdAt&order=asc`
8. For every transaction id from the full list in step 7: `GET /api/transactions/<id>`
9. `GET /api/projections?startDate=<first of D's month>&endDate=<last of D's month>&granularity=daily`; `?startDate=<Y>-01-01&endDate=<Y>-12-31&granularity=monthly`; `?startDate=<D>&endDate=<D plus one year>&granularity=weekly`; `?startDate=<Y+1>-01-01&endDate=<Y+1>-06-30&granularity=daily` (starts in the future); `?startDate=<Y−1>-01-01&endDate=<Y−1>-12-31&granularity=monthly` (in the past); and the first of these again for every account id with `&accountId=<id>`
10. `GET /api/summary?view=monthly&date=<D>`, `?view=weekly&date=<D>`, `?view=annual&date=<D>`, `?view=monthly&date=<D minus one month>`, and `?view=monthly&date=<D>&accountId=<id>` for every account id
11. `POST /api/projections` with body `{ "startDate": "<first of D's month>", "endDate": "<last of D's month>", "sandbox": {} }` (saves nothing; any posting was already done by step 1)

Compare with keys sorted. Expected differences: none in any value except `updatedAt` on documents the capture itself wrote to (posted payments, applied pending transactions) and the timestamp parts of `dataVersion`. `scripts/finance-parity/normalize.ts` can be used for the comparison without rule N3. One thing to look for specifically: Mongoose hydration re-cast mistyped stored values (a `balance` or `amount` stored as a string, a `date` stored as a string) and `shape*` does not, so such a legacy value would now come back in its stored type in the hydrated-document routes (accounts, categories). Any such difference is reported to the owner, not patched in `shape*` without a ruling.

## Intended behavior changes (D1)

In My data mode:

- (a) A malformed id in the path returns 404 with the route's existing not-found body instead of 500 (`/api/accounts/:accountId` and its payment-plan routes: `Account not found`; `/api/transactions/:transactionId`: `Transaction not found`). Malformed ids in a body or query string still produce the route's 500.
- (b) Finance hooks throw on a non-OK response (through `src/hooks/request.ts`) instead of handing the error body to the page as data.
- (c) An unparseable JSON body returns 400 (the route's validation error) instead of 500.
- (d) In the demo build (`NEXT_PUBLIC_DEMO=1`) Finance routes return the adapter's 403 `The demo does not use a server database` instead of each route's 500 message.
- (e) `__v` is no longer incremented when a payment plan or the Datasheet rewrites `amountSchedule` or `subLoans` (the former `save()` sites). Nothing reads `__v`; the parity transcript ignores it.
- (f) Server log lines lose their route prefix (`GET /api/accounts error:` and similar); the adapter logs the error object alone. Category routes, which logged nothing, now log.
- (g) Each Finance request makes one extra read (`exists({ isCash: true })`) before the handler runs. It never writes when the Cash account exists.
- (h) Ids are recognized in lowercase hex only (`isId` in the shared layer). Mongoose also accepts uppercase hex, so an uppercase id in a path now returns 404 where it found the document, and in a body or query returns the route's 500 where it worked. The client never produces uppercase ids.
- (i) The former `account.save()` / `tx.save()` sites validated the whole document and failed (500) if it had vanished meanwhile; `updateById` validates only the paths it sets and does nothing for a missing document. Stored data that violates the schema, or a document deleted mid-request, gave a 500 before and gives a normal response now.

In Browser data mode the module is new, so everything is new; two things differ from My data by nature: "local time" is the browser's time zone, and the Cash account is created by the first Finance request rather than at connection time.

## Known bugs carried over (D2)

Reproduced on purpose so both stores behave like today's code. Each line names where it is pinned (a `current behavior:` handler test, or a golden step). A follow-up plan should decide each.

1. Editing a transaction reverses the old balance effect before checking the new transfer's accounts; a 400 leaves the reversal in place and the transaction marked applied. (Task 8 test; golden T42–T43)
   Fixed: an edit resolves and validates the new state (accounts exist, ids well-formed, a transfer has a destination) before reversing anything; a refused edit leaves balances and the transaction as they were (43a87d1, d07822d).
2. Changing a transfer to a debit or credit keeps the stale `toAccountId`; turning recurrence off keeps `recurrenceRule`. (Task 8 test; golden T40)
   Fixed: a transfer turned debit or credit loses `toAccountId`; turning recurrence off removes `recurrenceRule`. `amountSchedule` is kept when recurrence is turned off: the Datasheet or payment plan that wrote it still owns it (9717104).
3. Creating a loan with a missing linked account creates the account and then returns 400. (Task 7 test; golden A08)
   Fixed: the linked account is checked before anything is created; a missing one answers 400 and creates nothing (43a87d1).
4. "Future" detection compares UTC-midnight dates with local midnight: west of UTC a transaction dated tomorrow is applied today. (Task 8 test; golden T09)
   Fixed: "future" compares calendar days, the stored UTC day against the local day of now, in every time zone, on create, update and apply-pending (f9a5353). The dashboard's recent transactions use the same bound (130296a).
5. The summary's account filter fetches only transactions whose source is the account, so transfers into it are missing. (Task 11 test; golden R20)
   Fixed: the summary's account filter matches the account as source or destination; a transfer in counts as money in, a transfer out as money out (aaca2d3).
6. An unknown summary `view` uses the year's bounds with daily entries. (Task 11 test; golden R17)
   Fixed: an unknown `view` answers 400 `{ error: "Invalid view" }` before anything is written (aaca2d3).
7. Deleting an account or a transaction leaves dangling links: the Datasheet's Salary/Rent links (the next save answers 409), other accounts' `paymentTransactionId` pointing at a transfer deleted with an account, and `linkedAccountId`. (not reachable as a single assertion; golden Z04–Z08 shows the surviving state)
   Fixed: deleting a transaction or an account clears every link to it and to the transactions deleted with it (Datasheet Salary/Rent links, `paymentTransactionId`, `linkedAccountId`); removing a payment plan clears links to its transfer (9717104, e175a8f).
8. A semi-monthly rule created without `daysOfMonth` stores `[]` and produces no occurrences. (golden T15 and the projections that follow)
   Fixed: creating or updating a semi-monthly rule without (or with empty) `daysOfMonth` answers 400; rules already stored that way still read and project as before (aaca2d3).
9. Applying pending transactions has no claim: two overlapping `GET /api/accounts` requests can both apply the same transaction, and a failure between the balance write and the flag write re-applies it. (single-request behavior pinned by Task 7; the race itself is not testable here)
   Fixed: each pending transaction is claimed with a conditional update before its balance is applied, and the claim is released if the balance write fails (92c4b62). Every route that posts payments now runs the same catch-up, pending transactions first (27c926a).
10. `postDuePayments` advances `postedThrough` even when nothing is owed, and a failure after the claim loses those payments. (Task 7 test)
   Fixed: a due date with nothing owed is done: it pays nothing and `postedThrough` advances past it, so it never comes back as catch-up; a posting that fails after the claim restores the previous `postedThrough`. Pending transactions are applied before payments are posted, on every route that posts (92c4b62, 89722a9, 27c926a). A narrow window remains between two concurrent requests: the one that loses a pending charge's claim can post before the winner has applied it, so that due date may pay 0 and the charge waits for the next due date (nothing is applied or posted twice).
11. Updating a payment plan writes the schedule before the RAP account-type check, so a 400 leaves the schedule changed. (Task 9 test; golden P18–P19)
   Fixed: the RAP account-type check runs before the schedule is written; a 400 changes nothing (43a87d1).
12. Setting up payments is two writes: a failure after the transfer is created leaves an unlinked recurring transfer. (not testable without fault injection)
   Fixed: if linking the new transfer fails, the transfer is deleted and the original error is reported (43a87d1, d07822d).
13. Merge-rent ignores the merged transaction's own `amountSchedule` and clears no reference to the merged id. (golden F11–F16)
   Fixed: the merged transaction's own amounts become rent steps (its start, then its later schedule entries; the kept steps win on an equal date), and a Rent link to the merged id moves to the kept one. Only the Rent link moves: merge-rent refuses a Salary-linked or loan-payment transaction on either side with 400, before any write (9717104, e175a8f).
14. The loan-disbursement transaction's `date` is the current instant, not UTC midnight. (Task 7 test; golden A07)
   Fixed: the disbursement is dated UTC midnight of the local calendar day (f9a5353).
15. `useTransaction` reads `data.data` but the route returns the bare document; it has no callers. (unchanged by Task 14)
   Fixed: `useTransaction` is deleted (aaca2d3).
16. Two overlapping first `GET /api/categories` requests can both seed; the second fails on the unique index with 500. (Task 8 conflict test pins the 500)
   Fixed: a conflict on the seed insert is treated as already seeded; both overlapping first requests answer 200 with the same list (92c4b62).
17. `GET /api/transactions` does not validate its parameters: `page=0` is a 500; `limit=0` returns everything with `totalPages: null`. A non-numeric `page` or `limit` (`NaN`) is passed to MongoDB as today in My data mode (Task 4 keeps `skip: NaN` flowing through the Mongo store) but is not pinned and may answer differently in browser mode; `sort` on an array field (`?sort=categoryTags`) orders differently in the two stores. (Task 8 test for `page=0`)
   Fixed: `page` (integer ≥ 1), `limit` (integer 1–500), `sort` (the scalar fields the UI sorts by) and `order` (`asc`/`desc`) are validated; anything else answers 400; defaults are unchanged (aaca2d3).
18. Projections and the summary do not sort the transactions they fetch, and the engine keeps input order within a day (which drives caps and running totals). MongoDB may return an account-filtered query in index order, the browser store in insertion order, so two same-kind transactions on one day can be processed in a different order in the two modes. (the N7 order check keeps the parity scenario clear of it; not otherwise pinned)
   Fixed: transactions are sorted before the engine sees them. Day order: income first, then debits (card charges included), then transfers and credits on card/debt accounts (payments); ties by `createdAt`, then `_id` (aaca2d3, ebf62ad, d4021d2).

Browser-mode only, noted for the same follow-up: two tabs making their first Finance request at the same moment can each create a Cash account; and in browser mode the once-only claim on plan payments holds within one tab only.

Fixed: the browser store re-reads storage before each request, so Cash seeding and plan-payment claims see other tabs' writes (92c4b62). A narrow cross-tab window remains (two tabs between their re-read and their write); closing it needs Web Locks.
