# Finance Datasheet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Finance → Datasheet page that computes real NY take-home pay from brackets and pushes dated net-pay and rent schedules into the Salary and Rent recurring transactions.

**Architecture:** There are three pure libraries, each unit-tested with `node:test`:
- the tax calculator
- the datasheet math (schedules, salary rows, 10-year table)
- an `amountSchedule` lookup in the projection engine

On top of those sit a singleton `FinanceProfile` Mongo document with a GET/PUT API (PUT writes the schedules onto the linked transactions), plus one page.

**Tech Stack:** Next.js 16 App Router, TypeScript, Mongoose, Zod, SWR, shadcn/ui, date-fns. Tests use Node 24's built-in `node:test` with `--experimental-strip-types` (no new dependencies).

**Spec:** `docs/superpowers/specs/2026-11-14-datasheet-design.md`

## Global Constraints
- Money is integer **cents** in the DB and in all lib functions; the UI shows dollars (`centsToDollars`/`dollarsToCents`).
- Dates are calendar dates: `yyyy-MM-dd` strings, or UTC-midnight `Date`s in Mongo. Use `src/lib/finance/dates.ts` (`toDateStr`, `fromDateStr`) and never use local-time `startOfDay`/`new Date(y,m,d)` for stored dates.
- Tax year **2026**. Every future year uses the same tables.
- 401(k) is a traditional pre-tax **% of gross**, which reduces federal and NY taxable wages but not FICA. Health is **cents per paycheck**, pre-tax for everything, including FICA.
- Annual = hourly × hoursPerWeek × 52. Monthly = annual / 12. Weekly = annual / 52.
- No new npm dependencies.

## Review Focus
1. **A step dated between paydays.** The first paycheck on or after the step date gets the new net; the one before keeps the old. (Task 2 test `picks schedule entry by occurrence date`.)
2. **The linked transaction was deleted.** PUT returns 409 and the page shows "Linked Salary transaction not found — pick one", not a 500. (Task 4 curl check.)
3. **No step in effect yet** (all steps dated in the future). The salary schedule starts at the earliest step; earlier occurrences use the transaction's base `amount`. (Task 3 test `schedule starts at earliest step`.)
4. **Duplicate step dates within one kind.** Zod rejects them with a 400 that names the kind. (Task 4 curl check.)
5. **Editing a scheduled transaction in the normal form.** The amount field is disabled with a "Managed by Datasheet" note, so a hand edit can't silently diverge. (Task 5 manual check.)

---

### Task 0: Commit the projection date fix and branch

- [ ] Create branch `feature/datasheet` from `dev`. Commit the already-verified date fix (`dates.ts`, `recurrence.ts`, `projection-engine.ts`, `summary/route.ts`, the display files) as `fix(finance): treat stored dates as calendar days in projections and reports`. Commit the spec and plan as `docs: datasheet design and plan`.

### Task 1: Test harness, 2026 tax tables, tax calculator

**Files:**
- Create: `scripts/ts-hooks.mjs` (a module resolve hook that maps `@/x` → `src/x` and extensionless relative specifiers → `.ts`), `scripts/register-ts.mjs` (calls `module.register`)
- Modify: `package.json`, adding `"test": "node --experimental-strip-types --no-warnings --import ./scripts/register-ts.mjs --test \"src/**/*.test.ts\""`
- Modify: `src/lib/finance/constants.ts` (tax tables)
- Modify: `src/lib/finance/tax-calculator.ts`
- Test: `src/lib/finance/tax-calculator.test.ts`

**Interfaces (Produces):**
```ts
export type FilingStatus = (typeof FILING_STATUSES)[number];
export interface PaycheckInput {
  annualGross: number;          // cents
  retirementPercent: number;    // 0.06
  healthPerPaycheck: number;    // cents
  periodsPerYear: number;
  filingStatus: FilingStatus;
  nycResident: boolean;
}
export interface PaycheckLines {
  gross: number; retirement: number; health: number;
  federal: number; socialSecurity: number; medicare: number;
  nyState: number; nyc: number; sdi: number; pfl: number;
  net: number;                  // all cents
}
export interface PaycheckBreakdown {
  annual: PaycheckLines; perPeriod: PaycheckLines;
  effectiveTaxRate: number;     // taxes / gross (annual)
  periodsPerYear: number;
}
export function calculatePaycheck(input: PaycheckInput): PaycheckBreakdown;
export function getPeriodsPerYear(frequency: string): number; // biweekly 26, weekly 52, semi_monthly 24, monthly 12
```
Remove the old `calculateSalary` (no callers).

**Constants (2026, dollars):** keep the tables in dollars and convert inside the calculator. Each bracket table is a list of `{ upTo, rate }` thresholds.
- Federal standard deduction: single 16,100; MFJ 32,200; MFS 16,100; HoH 24,150.
- Federal brackets (upper bounds for 10/12/22/24/32/35%, then 37%):
  - single: 12,400 / 50,400 / 105,700 / 201,775 / 256,225 / 640,600
  - MFJ: 24,800 / 100,800 / 211,400 / 403,550 / 512,450 / 768,700
  - MFS: 12,400 / 50,400 / 105,700 / 201,775 / 256,225 / 384,350
  - HoH: 17,700 / 67,450 / 105,700 / 201,750 / 256,200 / 640,600
- Social Security: 6.2% to 184,500. Medicare: 1.45%, plus 0.9% above 200,000 (all statuses; this is the employer withholding threshold).
- NY standard deduction: single/MFS 8,000; MFJ 16,050; HoH 11,200.
- NY brackets (rates 3.9 / 4.4 / 5.15 / 5.4 / 5.9 / 6.85 / 9.65 / 10.3 / 10.9%):
  - single/MFS upper bounds: 8,500 / 11,700 / 13,900 / 80,650 / 215,400 / 1,077,550 / 5,000,000 / 25,000,000
  - MFJ: 17,150 / 23,600 / 27,900 / 161,550 / 323,200 / 2,155,350 / 5,000,000 / 25,000,000
  - HoH: 12,800 / 17,650 / 20,900 / 107,650 / 269,300 / 1,616,450 / 5,000,000 / 25,000,000
- NYC (3.078 / 3.762 / 3.819 / 3.876%):
  - single/MFS: 12,000 / 25,000 / 50,000
  - MFJ: 21,600 / 45,000 / 90,000
  - HoH: 14,400 / 30,000 / 60,000
- NY SDI: 0.5% of wages, max $0.60/week, i.e. $31.20/yr. NY PFL: 0.432% of FICA wages, max $411.91/yr.

**Calculation (annual):**
- FICA wages = gross − health
- Income-tax wages = gross − health − retirement
- Federal = brackets(max(0, income-tax wages − federal SD))
- NY and NYC = brackets(max(0, income-tax wages − NY SD))
- SDI = min(0.005 × gross, 31.20)
- PFL = min(0.00432 × FICA wages, 411.91)

Per-period lines are `Math.round(annual / periods)` for each deduction. Per-period gross is `Math.round(annual gross / periods)`. Per-period net = per-period gross − the sum of per-period deductions (exact sum). Annual net is computed from the annual lines.

- [ ] **Step 1: Write the failing tests** in `tax-calculator.test.ts`:
  - `zero gross → all lines 0`
  - `62,400 single, 6% 401k, $85/check health, biweekly, no NYC`: assert annual retirement 374,400 cents and health 221,000. Assert annual federal = brackets on (62,400 − 2,210 − 3,744 − 16,100 = 40,346): 1,240 + 12% × 27,946 = **4,593.52** → 459,352 cents. Assert socialSecurity = 6.2% × 60,190 = 373,178 cents. Assert medicare = 1.45% × 60,190 = 87,276 cents (±1).
  - Also assert NY state = brackets on (56,446 − 8,000 = 48,446): 331.50 + 140.80 + 113.30 + 5.4% × 34,546 = **2,451.08** → 245,108 cents.
  - `per-period lines sum to per-period net`: gross − Σdeductions === net.
  - `NYC on adds city tax`: NYC = 369.36 + 489.06 + 3.819% × 23,446 = 1,753.82 → 175,382 cents (±1).
  - `SS capped at wage base` (gross 300,000): socialSecurity === 1,143,900 cents. `additional medicare above 200k` (gross 300,000, no deductions): medicare = 4,350 + 900 = 525,000 cents.
  - `SDI capped at 3,120 cents`. `PFL capped at 41,191 cents`.
- [ ] **Step 2:** Run `npm test`. Expected: FAIL (`calculatePaycheck` is not exported).
- [ ] **Step 3:** Add the hooks, the script, the constants, and implement `calculatePaycheck`.
- [ ] **Step 4:** Run `npm test`. Expected: all pass.
- [ ] **Step 5:** Commit: `feat(finance): 2026 federal/NY/NYC paycheck calculator with unit tests`.

### Task 2: `amountSchedule` on transactions and in the projection engine

**Files:**
- Modify: `src/models/finance/Transaction.ts`, adding `amountSchedule: [{ effectiveDate: Date (required), amount: Number (required, cents) }]` (subschema `_id: false`, default `[]`) to `ITransaction` and the schema.
- Modify: `src/types/finance/transaction.ts`, adding `amountSchedule?: { effectiveDate: string; amount: number }[]` to `Transaction`.
- Create: `src/lib/finance/amount-schedule.ts`
- Modify: `src/lib/finance/projection-engine.ts` (recurring expansion loop, ~line 82)
- Test: `src/lib/finance/amount-schedule.test.ts`

**Interfaces (Produces):**
```ts
export interface AmountStep { effectiveDate: Date | string; amount: number }
/** Amount in effect on dateStr: last step with toDateStr(effectiveDate) <= dateStr, else base. */
export function amountOn(base: number, schedule: AmountStep[] | undefined, dateStr: string): number;
```
The engine uses `amount: amountOn(t.amount, t.amountSchedule, dateStr)` for each recurring occurrence. One-time transactions are unchanged.

- [ ] **Step 1: Failing tests:**
  - `no schedule → base`
  - `picks schedule entry by occurrence date`: steps `[2026-10-02 → 100, 2027-03-05 → 200]`. Assert 2027-03-04 → 100, 2027-03-05 → 200, and 2026-10-01 → base. Unsorted input gives the same results.
  - `buildProjection applies schedule`: one bank account and a biweekly credit from 2026-10-02 with base 50 and schedule `[2026-10-02→100, 2026-10-30→300]`, window 2026-10-01..2026-11-14. The occurrences are 10-02:100, 10-16:100, 10-30:300, 11-13:300. Fake accounts/transactions are plain objects with `_id: { toString: () => "a1" }`.
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Implement and wire it into the engine.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** Commit: `feat(finance): dated amount schedules on recurring transactions`.

### Task 3: Datasheet math

**Files:**
- Create: `src/lib/finance/datasheet.ts`
- Create: `src/types/finance/datasheet.ts`
- Test: `src/lib/finance/datasheet.test.ts`

**Interfaces (Produces):**
```ts
// types/finance/datasheet.ts  (cents; dates "yyyy-MM-dd")
export interface SalaryStep { effectiveDate: string; annualGross: number }
export interface RetirementStep { effectiveDate: string; percent: number }
export interface HealthStep { effectiveDate: string; perPaycheck: number }
export interface RentStep { effectiveDate: string; monthly: number }
export interface WhatIfSalary { label?: string; annualGross: number }
export interface FinanceProfileData {
  filingStatus: FilingStatus; hoursPerWeek: number; nycResident: boolean; raiseRate: number;
  salaryTransactionId?: string | null; rentTransactionId?: string | null;
  salarySteps: SalaryStep[]; retirementSteps: RetirementStep[];
  healthSteps: HealthStep[]; rentSteps: RentStep[]; whatIfSalaries: WhatIfSalary[];
}
export interface SalaryRow {
  hourly: number; weeklyGross: number; monthlyGross: number; annualGross: number;
  weeklyNet: number; monthlyNet: number; annualNet: number; // cents
}

// lib/finance/datasheet.ts
export function stepOn<T extends { effectiveDate: string }>(steps: T[], dateStr: string): T | undefined;
export function buildSalarySchedule(p: FinanceProfileData, periodsPerYear: number): { effectiveDate: string; amount: number }[];
export function buildRentSchedule(p: FinanceProfileData): { effectiveDate: string; amount: number }[];
export function salaryRow(annualGross: number, p: FinanceProfileData, onDate: string, periodsPerYear: number): SalaryRow;
export function tenYearRows(startAnnualGross: number, p: FinanceProfileData, onDate: string, periodsPerYear: number, years?: number): SalaryRow[]; // index 0 = starting, 1..years compounded
export function hourlyToAnnual(hourlyCents: number, hoursPerWeek: number): number;
```
- `buildSalarySchedule`: walk the sorted union of all salary/retirement/health step dates that are on or after the earliest salary step. Compute `calculatePaycheck(...).perPeriod.net` using the steps in effect (a missing retirement or health step counts as 0), and drop entries whose amount equals the previous entry's.
- `salaryRow` net figures use `calculatePaycheck` annual net. weeklyNet = annualNet / 52 and monthlyNet = annualNet / 12, rounded.
- `tenYearRows`: row k gross = round(start × (1 + raiseRate)^k).

- [ ] **Step 1: Failing tests:**
  - `hourlyToAnnual(3000, 40) === 6_240_000`
  - `salaryRow gross columns match spreadsheet`: $30/hr at 40 h/week → weekly 120,000, monthly 520,000, annual 6,240,000.
  - `tenYearRows compounds 3%`: row 1 annual 6,427,200 and row 10 weekly gross within ±1 of 161,270 ($1,612.70, same as the spreadsheet), with row 10 annual within ±1 of 8,386,040. The spreadsheet's $90,311.18 is wrong: from year 2 on it computes annual as weekly × 56.
  - `schedule starts at earliest step`: steps all from 2027-01-01 → the first entry is 2027-01-01.
  - `401k step changes net`: salary step 2026-10-02 plus a retirement 6% → 8% step on 2027-06-04 gives two entries, and the second is smaller.
  - `identical consecutive nets are collapsed`.
  - `buildRentSchedule maps monthly`.
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** Commit: `feat(finance): datasheet schedule and salary-table math`.

### Task 4: FinanceProfile model and API

**Files:**
- Create: `src/models/finance/FinanceProfile.ts`. It mirrors `FinanceProfileData`, with dates stored as `Date` and the transaction ids as `ObjectId`, plus timestamps. Use the hot-reload delete pattern from `Transaction.ts`.
- Modify: `src/lib/finance/validators.ts`, adding `financeProfileSchema` (Zod):
  - money fields arrive in **dollars** and the route converts them to cents
  - percent is 0–1
  - raiseRate is 0–0.5
  - hoursPerWeek is 1–80
  - each step kind's `effectiveDate` values must be unique (superRefine message: `Duplicate date in <kind> changes`)
  - at least 1 salary step
- Create: `src/app/api/finance-profile/route.ts`
  - `GET` returns the profile, or defaults: single, 40 h, NYC off, 0.03, empty steps. Steps come back with dollars and `yyyy-MM-dd` dates.
  - `PUT` validates and upserts. If a linked id is set and the transaction is missing, it returns **409** `{ error: "Linked Salary transaction not found" }` (or Rent).
  - Then the Salary transaction gets `amountSchedule = buildSalarySchedule(...)` (periods from the transaction's `recurrenceRule.frequency` via `getPeriodsPerYear`) and `amount = amountOn(...)` for `localTodayStr()`, falling back to the first entry. Rent works the same way.
  - The response is `{ data: profile, updated: { salary: boolean, rent: boolean } }`.
- Create: `src/app/api/finance-profile/merge-rent/route.ts` — `POST { keepId, mergeId }`:
  - adds a rent step `{ effectiveDate: merge.recurrenceRule.startDate, monthly: merge.amount }` to the profile (it skips any existing step on that date)
  - clears `keep.recurrenceRule.endDate`
  - deletes `merge`
  - re-runs the rent schedule write
  - returns the profile

  The shared schedule-writing helper lives in `src/lib/finance/apply-profile.ts`, as `applyProfileToTransactions(profile)`, used by both routes.

- [ ] **Step 1:** Implement the model, schema, helper and routes.
- [ ] **Step 2: Verify with curl** against `npm run dev` (port 3030), using a **throwaway** pair of transactions created via `POST /api/transactions` and deleted afterwards. Do not touch the user's real Salary/Rent.
  - The defaults GET returns 200.
  - PUT with a duplicate salary date returns 400 with "Duplicate date in salary changes".
  - PUT linking the throwaway salary, with a raise step, returns 200. `GET /api/transactions/<id>` then shows the `amountSchedule`, and `/api/projections` shows the two nets before and after the step.
  - Deleting the throwaway transaction and PUTting again returns 409.
  - Restore: delete the throwaway transactions and reset the profile.
- [ ] **Step 3:** `npx tsc --noEmit` is clean. Commit: `feat(finance): finance profile API that writes salary/rent schedules`.

### Task 5: Datasheet page, nav, form lock

**Files:**
- Create: `src/hooks/finance/use-finance-profile.ts` with `useFinanceProfile()` → `{ profile, isLoading, mutate }`, `saveFinanceProfile(data)`, and `mergeRent(keepId, mergeId)` (same fetch and error pattern as `use-accounts.ts`).
- Create: `src/app/(app)/finance/datasheet/page.tsx` (`"use client"`), composing the components below.
- Create, in `src/components/finance/datasheet/`:
  - `settings-card.tsx`: filing status Select, hours/week, NYC Switch, Salary/Rent transaction Selects. The selects list recurring transactions from `useTransactions` filtered by `isRecurring`, credit for salary and debit for rent. The card shows a read-only pay cycle.
  - `steps-card.tsx`: four rows (Salary $/yr or $/hr toggle, 401(k) %, Health $/check, Rent $/mo). Each date+value chip can be removed, plus an add button that uses the existing Popover+Calendar pattern from `transaction-form.tsx`.
  - `paycheck-breakdown.tsx`: a table of the lines × {per check, monthly, annual}, plus the effective tax rate. Lines that are 0 are hidden; NYC is shown only when it's on.
  - `salary-table.tsx`: columns Hourly | Weekly (g) | Monthly (g) | Annually (g) | Weekly (net) | Monthly (net) | Annually (net). Rows:
    - **Actual** (salary step in effect today)
    - editable what-if rows (hourly or annual input; add/remove)
    - a **10-year** block with a raise % input, showing Starting and 1–10
  - `rent-merge-banner.tsx`: shown when the profile's rent transaction is linked and another recurring debit has the same description. It offers "Merge into one Rent with a change on <date>" behind a confirm Dialog.
- Modify: `src/lib/modules.ts`, adding nav item `{ href: "/finance/datasheet", label: "Datasheet", icon: Calculator }` after Projections.
- Modify: `src/components/finance/transaction-form.tsx`: when `defaultValues.amountSchedule?.length`, disable the amount Input and show "Managed by Datasheet" under it. Pass `amountSchedule` through from `transactions/page.tsx` defaultValues (`TransactionFormData` gains an optional `amountSchedule`, which is not submitted).
- All calculations are client-side, via the Task 1 and Task 3 libs. Save sends dollars and shows a sonner toast: "Salary and Rent updated", or the 409 message.

- [ ] **Step 1:** Implement the hook, components, page, nav and form lock.
- [ ] **Step 2: Verify:**
  - `npm test`, `npx tsc --noEmit` and `npm run build` pass.
  - `npm run lint` shows no new errors in the touched files.
  - In the browser at `/finance/datasheet`: the page renders with no profile, the $30/hr Actual row reproduces the spreadsheet's gross columns, and the 10-year row 10 shows $1,612.70 weekly / $83,860.40 annual gross.
  - Opening a scheduled transaction in the transactions page shows the disabled amount.
- [ ] **Step 3:** Commit: `feat(finance): datasheet page for salary, deductions, rent and raise projection`.

### Task 6: Hand-off
- [ ] Don't link or merge the user's real Salary/Rent transactions automatically. Report how to do it from the page, since it rewrites their transactions. Run a final whole-branch review against the spec, then report.
