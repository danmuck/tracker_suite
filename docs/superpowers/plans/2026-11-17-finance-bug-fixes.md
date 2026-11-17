# Finance Bug Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Fix the 18 Finance bugs that the browser-data conversion carried over unchanged, identically in both data sources.

**Architecture:** All fixes are in the store-agnostic handlers under `src/lib/finance/api/` (plus the projection engine input order and one hook). Each fix flips the `current behavior:` test that pins the bug, adds a test for the fixed behaviour, and re-records the golden transcript over HTTP on MongoDB; the in-process replay on the browser store must then match it, which proves the two stores still agree.

**Tech Stack:** Next.js 16, TypeScript, `node --test`, the `Store` interface in `src/lib/data/store.ts`, parity tooling in `scripts/finance-parity/`.

**Spec:** "Known bugs carried over (D2)" at the end of `docs/superpowers/plans/2026-11-17-browser-data-mode-finance.md` (bug numbers below refer to it), with the fixes the owner approved on 2026-11-17, restated per task here.

## Global Constraints

- Handlers must not import `mongoose`, `next/server` or `src/lib/db.ts`. Modules never import each other.
- Money is integer cents. Dates cross the store as ISO strings (`src/lib/finance/dates.ts`).
- A request that answers 4xx must leave stored data exactly as it was (validate everything before the first write).
- Behaviour must be the same in both stores. `batchUpdate` runs no validators: validate in handlers.
- Never touch the live database `test` or port 3030. Parity servers: `MONGODB_URI=mongodb://localhost:27017/tracker_parity NEXT_DIST_DIR=.next-parity npx next dev -p 3032` (ports 3031–3036 only), reset with `scripts/finance-parity/reset-db.mjs`. Stop servers you start.
- Golden re-record (every task that changes responses): capture over HTTP on MongoDB with `run.ts capture --out scripts/finance-parity/golden/transcript.json`, then `npm test` (in-process replay must match). The report lists every golden step whose response changed and why; a changed step not explained by the task's bugs is a defect. Where a bug has no scenario step that shows the fix, add one to `scenario.ts`.
- No behaviour change beyond the listed bugs. Error bodies follow the route's existing shape (`{ error: string }`, plus Zod details where the route already returns them).
- Commit per task, files staged by name, never `git add -A`, never push.

## Review Focus

- A 4xx after partial validation that still wrote something (check every early return sits before the first write).
- Fixes that hold on the browser store but not MongoDB or the reverse (conditional updates used as claims must use only supported filter operators).
- Same-day order: stable for equal keys in both stores; `createdAt` ties broken by `_id`.
- Link clearing on delete that misses a reference kind, or clears a link on a document that is itself being deleted.
- Existing stored data that the new validation would now reject on read (validation applies to writes and query parameters only).

---

### Task 1: Reads and validation (bugs 5, 6, 8, 15, 17, 18)

**Files:** `src/lib/finance/api/projection-handlers.ts`, `transaction-handlers.ts`, `src/lib/finance/validators.ts`, their tests, `src/hooks/finance/use-transactions.ts` (or wherever `useTransaction` lives), `scripts/finance-parity/scenario.ts`, golden.

- [ ] Bug 18: projections and the summary sort fetched transactions before the engine sees them: by date (existing day bucketing unchanged), then within a day credits first, then debits, then transfers; ties by `createdAt` ascending, then `_id` ascending. One pure exported comparator `sameDayOrder(a, b)` in `src/lib/finance/` with a unit test covering each tie level. Remove or relax the N7 scenario restriction only if the order is now fully determined; add a scenario day with a credit, a debit and a transfer created in the "wrong" order.
- [ ] Bug 5: the summary's account filter matches transactions where the account is the source OR the destination (`$or` on `accountId` / `toAccountId`); a transfer into the account counts as money in for that account's summary, out for a transfer from it. Flip the pinned test.
- [ ] Bug 6: an unknown summary `view` answers 400 `{ error: "Invalid view" }`. Flip the pinned test.
- [ ] Bug 8: creating or updating a recurring transaction with a semi-monthly rule and no (or empty) `daysOfMonth` answers 400 from the Zod schema. Stored rules already in that state still read and project as today.
- [ ] Bug 17: `GET /api/transactions` validates `page` (integer ≥ 1), `limit` (integer 1–500) and `sort` (one of the scalar fields the UI sorts by today; find them in the transactions table component) and `order` (`asc`/`desc`); anything else answers 400. Defaults unchanged when absent. Flip the `page=0` test.
- [ ] Bug 15: delete `useTransaction` (no callers; confirm with a search).
- [ ] Re-record golden, run `npm test`, `npx tsc --noEmit`, eslint on touched files, commit `fix(finance): deterministic same-day order, summary filter, query validation`.

### Task 2: Dates (bugs 4, 14)

**Files:** `transaction-handlers.ts`, `account-handlers.ts`, `src/lib/finance/dates.ts`, tests, golden.

- [ ] Bug 4: "is this transaction in the future" compares calendar days: the transaction's stored UTC date (`yyyy-MM-dd` of the ISO string) against the local calendar day of `ctx.now` (`localDateStr`). Dated today or earlier: applied; dated tomorrow or later: not applied, in every time zone. Use one helper for every place that makes this decision (create, update, apply-pending). Flip the pinned test and add east-of-UTC and west-of-UTC cases.
- [ ] Bug 14: the loan-disbursement transaction is dated UTC midnight of the local calendar day of `ctx.now`. Flip the pinned test.
- [ ] Re-record golden, tests, tsc, eslint, commit `fix(finance): calendar-day future check and disbursement date`.

### Task 3: Nothing written on a refused request (bugs 1, 3, 11, 12)

**Files:** `transaction-handlers.ts`, `account-handlers.ts`, `payment-plan.ts`, `payment-plan-handlers.ts`, tests, golden.

- [ ] Bug 1: editing a transaction resolves and validates the new state (accounts exist, ids well-formed, transfer has a destination) before reversing the old balance effect. Flip both pinned tests (`an edit refused…`, `a debit edit carrying a malformed toAccountId…`): after the 4xx/5xx, balances and the transaction equal their state before the request.
- [ ] Bug 3: creating a loan checks the linked account exists before creating anything. Flip the pinned test: 400 and no account created.
- [ ] Bug 11: updating a payment plan performs the RAP account-type check before writing the schedule. Flip the pinned test.
- [ ] Bug 12: payment setup: if the write that links the new transfer fails, delete the transfer just created and rethrow. Test with a store wrapper whose second write throws.
- [ ] Re-record golden, tests, tsc, eslint, commit `fix(finance): validate before writing; undo a half-finished payment setup`.

### Task 4: Stale and dangling data (bugs 2, 7, 13)

**Files:** `transaction-handlers.ts`, `account-handlers.ts`, `profile.ts`, `profile-handlers.ts`, tests, golden.

- [ ] Bug 2: an update that changes a transfer to a debit or credit unsets `toAccountId`; an update that turns `isRecurring` off unsets `recurrenceRule` (and `amountSchedule` only if it is meaningless without recurrence — check the engine; say which in the report). Flip the pinned test.
- [ ] Bug 7: deleting a transaction clears every reference to it: the Datasheet profile's Salary/Rent links and any account's `paymentTransactionId` (find all reference fields by searching the types; list them in the report). Deleting an account does the same for the transactions deleted with it, and unsets `linkedAccountId` on accounts that pointed at it. After this the next Datasheet save no longer answers 409 because of a deleted link. Tests for each reference kind.
- [ ] Bug 13: merge-rent keeps the merged transaction's `amountSchedule` entries (appended to the kept one's, ordered by date, kept one wins on an equal date), and rewrites references to the merged id (same reference kinds as bug 7) to the kept id. It also validates the link check before writing (flip `merge-rent writes the kept end date and deletes the merged rent before a failing link check`). Leave "accepts any two recurring transactions" as is.
- [ ] Re-record golden, tests, tsc, eslint, commit `fix(finance): clear stale fields and dangling links`.

### Task 5: Races (bugs 9, 10, 16, browser tabs)

**Files:** `account-handlers.ts`, `post-payments.ts`, `category-handlers.ts`, `docs.ts` (Cash), `src/lib/data/local.ts` / `browser-store.ts` if needed, tests, golden.

- [ ] Bug 9: applying a pending transaction claims it first with a conditional update (`updateOne({ _id, balanceApplied: false }, { $set: { balanceApplied: true } })`, proceed only if it matched), then applies the balance; if the balance write throws, release the claim. Test: two interleaved applies change the balance once.
- [ ] Bug 10: `postDuePayments` does not advance `postedThrough` past a period in which nothing was owed (flip the pinned assertion in `account-handlers.test.ts` ~line 134), and if posting fails after the claim, restores the previous `postedThrough`.
- [ ] Bug 16: category seeding treats a `ConflictError` on insert as "already seeded" and continues to the read. Flip the pinned conflict test: both overlapping first requests answer 200 with the same list.
- [ ] Browser tabs: before `ensureCashAccount` inserts in the browser store, and before a plan-payment claim, the store re-reads the collection from localStorage (other tabs' writes) — add a `refresh()` used by `localRequest` at the start of each queued request if the store does not already do so; if two Cash accounts are found on read, nothing is deleted (report only). Test with two `BrowserStore` instances over one fake storage.
- [ ] Re-record golden (expect few or no changes), tests, tsc, eslint, commit `fix(finance): claims for pending transactions and due payments, tolerant seeding, cross-tab reads`.

### Task 6: Proof on MongoDB

- [ ] On a fresh `tracker_parity`, `run.ts check` against the committed golden: all steps match. Run it twice.
- [ ] `npm test`, `npx tsc --noEmit`, `npm run lint` (no new errors beyond the 4 existing ones in untouched files).
- [ ] Update "Known bugs carried over (D2)" in the Finance conversion plan: mark each bug fixed with its commit.
