# Debt & Credit Card Payment Plans Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give credit cards and debt accounts a minimum payment, an optional (blended) APR, a dated payment schedule on a linked bank→debt transfer, month-end interest in projections, and a RAP mode for the student loan (interest waiver, principal match, automatic yearly payment from prior-year Datasheet income).

**Architecture:**
- Pure libs (`interest.ts`, `rap.ts`, `payoff.ts`) hold all the math and are unit-tested with `node:test`.
- The linked transfer's existing `amountSchedule` is the timeline (approach B). Automatic RAP entries are tagged `source: "rap"`.
- A `payment-plan` API on each account reads and writes plan fields and the schedule. The projection engine adds month-end interest and RAP adjustments.
- UI: a shared `ScheduleEditor`, used by account cards, the Datasheet's new Debt payments card, and the Datasheet's existing step rows.

**Tech Stack:** Next.js 16, TypeScript, Mongoose 9, Zod 4, SWR, shadcn/ui, date-fns 4, and `node:test` via `npm test`.

**Spec:** `docs/superpowers/specs/2026-11-14-debt-payment-plans-design.md`

## Global Constraints
- Money is integer cents in the DB and libs; APIs speak dollars; APR is a fraction (0.065) in the DB/libs and a percent in forms.
- Dates are `yyyy-MM-dd` calendar strings or UTC-midnight `Date`s. Use `src/lib/finance/dates.ts`.
- Interest is added only at month-ends **after** `localTodayStr()`, and only while owed > 0: `round(owed × apr / 12)`.
- RAP:
  - AGI ≤ $10,000 → $10/mo
  - otherwise rate = min(10, ceil((AGI − 10,000)/10,000))%
  - monthly = round(AGI × rate / 12) − $50 × dependents, with a floor of $10
  - waiver: `charged = min(interest, paid)`
  - match: `max(0, min($50, paid) − (paid − charged))`, capped at owed
- No click-to-edit; schedule entries are added and removed. The account popup gains only APR (%) and Minimum payment ($).
- No new npm dependencies.

## Review Focus
1. **A RAP account with a payment linked whose first payment hasn't happened yet this month** (paid = 0 at month-end). All interest is waived and the match is 0; the balance doesn't change. Test `rap month-end with no payment waives everything` (Task 1).
2. **Sub-loans whose balances sum to 0** (all entered as $0). The blended APR falls back to the account's `apr`, with no divide-by-zero NaN. Test `blendedApr falls back when weights are zero` (Task 1).
3. **A manual entry on the same date as an automatic RAP entry.** The manual one wins and the automatic one is dropped. Test `manual entry beats rap entry on same date` (Task 4, `mergeRapEntries`).
4. **The payment transfer was deleted outside the plan.** GET reports `payment: null`, PUT returns 409, and the card shows "Set up payments" again. Curl check in Task 4.
5. **A debt already at 0 owed with interest and payments scheduled.** No interest, no match, and the payment is capped at 0 by the existing engine. Test `no interest when nothing owed` (Task 3).

---

### Task 1: Interest, RAP and payoff math

**Files:**
- Create: `src/lib/finance/interest.ts`, `src/lib/finance/rap.ts`, `src/lib/finance/payoff.ts`
- Tests: `src/lib/finance/interest.test.ts`, `src/lib/finance/rap.test.ts`, `src/lib/finance/payoff.test.ts`

**Interfaces (Produces):**
```ts
// interest.ts
export interface SubLoan { name: string; balance: number; apr: number } // cents, fraction
export function monthlyInterest(owedCents: number, apr: number): number; // 0 when owed<=0 or apr<=0
export function blendedApr(subLoans: SubLoan[] | undefined, fallback: number | undefined): number;
export interface RapMonthEnd { charged: number; waived: number; match: number }
export function rapMonthEnd(interest: number, paid: number, owedAfterPayments: number): RapMonthEnd;

// rap.ts
export const RAP_MIN_PAYMENT = 1000; // cents
export function rapMonthlyPayment(agiCents: number, dependents: number): number; // cents
export function priorYearAgi(p: FinanceProfileData, paydays: string[], year: number, periodsPerYear: number): number | null; // null when no salary step covers any payday that year
export function rapScheduleEntries(args: { recertDate: string /* "MM-dd" */; dependents: number; today: string; years: number; agiForYear: (year: number) => number | null }): { effectiveDate: string; amount: number; source: "rap" }[];

// payoff.ts
export function estimatePayoff(args: { balance: number; apr: number; schedule: { effectiveDate: string; amount: number }[]; paymentDay: number; startDate: string; rap?: boolean }): { payoffDate: string | null; totalInterest: number; months: number };
```

- [ ] **Step 1: Failing tests.**
  - `interest.test.ts`:
    - `monthlyInterest(5_500_000, 0.065) === 29_792` ($55,000 × 6.5% / 12 = $297.92)
    - `monthlyInterest(0, 0.2) === 0`
    - `monthlyInterest(-100, 0.2) === 0`
    - `blendedApr([{balance:1_000_000,apr:0.05},{balance:3_000_000,apr:0.07}], 0) ≈ 0.065`
    - `blendedApr falls back when weights are zero`: `blendedApr([{balance:0,apr:0.05}], 0.04) === 0.04`
    - `blendedApr(undefined, 0.03) === 0.03`
    - `rapMonthEnd(25_000, 1_000, 5_000_000)` → `{charged:1000, waived:24000, match:1000}`
    - `rapMonthEnd(10_000, 30_000, 5_000_000)` → principal paid 20,000 ≥ 5,000 → match 0
    - `rapMonthEnd(2_000, 3_000, …)` → principal 1,000, match = min(5000, 3000) − 1000 = 2000
    - `rap month-end with no payment waives everything`: `rapMonthEnd(25_000, 0, 5_000_000)` → `{charged:0, waived:25000, match:0}`
    - match capped at `owedAfterPayments`
  - `rap.test.ts`:
    - `rapMonthlyPayment`:
      - `1_000_000, 0 → 1000`
      - `1_000_100, 0` → 1% of $10,001 = $8.33, so the $10 floor gives 1000
      - `2_000_000, 0 → 1%` → 1,667
      - `10_000_000, 0 → 9%` → 75_000
      - `10_000_100, 0 → 10%` → 83_334
      - `5_000_000, 2 → 4%` → 16,667 − 10,000 = 6,667
      - floor: `2_000_000, 3 → 1000`
    - `priorYearAgi`: profile with salary $62,400, 6% 401(k), $85 health, 27 biweekly paydays in the year → 27 × (240,000 − 14,400 − 8,500) = 5,861,700. It returns `null` when the paydays precede the first salary step.
    - `rapScheduleEntries`: recert "07-01", today "2026-11-14", years 3, agiForYear 2026→5,000,000, 2027→6,000,000, 2025→null. Expected entries: 2027-07-01 (from 2026 AGI) and 2028-07-01 (from 2027 AGI); 2029-07-01 is skipped because its AGI is null.
  - `payoff.test.ts`:
    - zero APR: $1,000 balance at $100/mo → 10 months, interest 0
    - with APR: $1,000, 12%, $100/mo → months 11, totalInterest within ±100 cents of 5,800
    - `never paid off`: $55,000, 6.5%, $10/mo, no RAP → `payoffDate: null`
    - `step change`: $1,000, 0%, $50/mo, then $100 from month 3 → 11 months
    - `rap shrinks balance`: $1,000, 20%, $10/mo, rap → balance falls by exactly $10/mo (−$10 paid, +$10 charged, −$10 match), so payoff takes 100 months
- [ ] **Step 2:** `npm test` → FAIL (modules missing).
- [ ] **Step 3:** Implement the three modules. In `estimatePayoff`:
  - step through months from `startDate`; on `paymentDay` (clamped to the month length), pay `amountOn(0, schedule, date)` capped at owed
  - at month-end, add `monthlyInterest` (or with `rap`, apply `rapMonthEnd` using that month's payment)
  - stop when owed ≤ 0, or after 600 months → `payoffDate: null`
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** Commit `feat(finance): interest, RAP and payoff calculators`.

### Task 2: Account fields, popup inputs, schedule `source`

**Files:**
- Modify: `src/models/finance/Account.ts`, adding:
  - `apr?: number`
  - `minimumPayment?: number` (cents)
  - `paymentTransactionId?: ObjectId` (ref Transaction)
  - `subLoans?: [{name, balance, apr}]` (`_id: false`)
  - `rap?: {enabled, autoSchedule, recertDate, dependents}` (`_id: false`)
- Modify: `src/types/finance/account.ts` (same fields on `Account`; `AccountFormData` gains `apr?: number` (percent) and `minimumPayment?: number` (dollars))
- Modify: `src/models/finance/Transaction.ts` + `src/types/finance/transaction.ts`, giving `amountSchedule` entries `source?: "rap"`
- Modify: `src/lib/finance/validators.ts` `accountSchema`: `apr: z.number().min(0).max(100).optional()` and `minimumPayment: z.number().min(0).optional()`
- Modify: `src/app/api/accounts/route.ts` POST and `[accountId]/route.ts` PUT: store `apr / 100` and `Math.round(minimumPayment × 100)`. When `apr` is absent, `$unset` it.
- Modify: `src/components/finance/account-form.tsx`: for credit_card/debt, add "APR (%)" and "Minimum payment ($)" inputs. When the edited account has sub-loans, APR is disabled with the hint "Blended from sub-loans".
- Modify: `src/app/(app)/finance/accounts/page.tsx` edit defaultValues, to pass `apr × 100`, `minimumPayment / 100`, and `hasSubLoans`.

- [ ] **Step 1:** Implement.
- [ ] **Step 2: Verify.**
  - `npx tsc --noEmit` is clean.
  - Curl: PUT a throwaway debt account with `apr: 6.5, minimumPayment: 210`, then GET shows `apr: 0.065, minimumPayment: 21000`. Delete the throwaway.
- [ ] **Step 3:** Commit `feat(finance): APR and minimum payment on credit cards and debt`.

### Task 3: Month-end interest and RAP in the projection engine

**Files:**
- Modify: `src/lib/finance/projection-engine.ts`
- Test: `src/lib/finance/projection-interest.test.ts`

**Interfaces:**
- Consumes: `monthlyInterest`, `blendedApr`, `rapMonthEnd` (Task 1); `IAccount.apr/subLoans/rap` (Task 2).
- Behavior:
  - Track `paidThisMonth[accountId]`: the sum of transfer amounts into the account (after caps) plus credits on it, reset at each month start.
  - After a day's transactions, if `dateStr` is the month's last day and `dateStr > todayStr`, for each debt/credit-card account with effective APR > 0 and running balance > 0:
    - interest = `monthlyInterest(bal, apr)`
    - with RAP enabled, apply `rapMonthEnd(interest, paid, bal)`; otherwise `charged = interest, match = 0`
    - `bal += charged − match`
  - Push synthetic transactions onto that day's list:
    - `{description:"Interest", type:"debit", accountId, amount: charged, categoryTags:["interest"], isProjected:true}` when charged > 0
    - `{description:"RAP principal match", type:"credit", accountId, amount: match, categoryTags:["rap_match"], isProjected:true}` when match > 0
  - Summary totals: "Interest" counts as an expense; `rap_match` is excluded from income.

- [ ] **Step 1: Failing tests** (fake accounts/transactions as in `amount-schedule.test.ts`). Use the window 2099-01-01..2099-03-31 so every month-end is after today:
  - `adds month-end interest on debt`: debt $1,200 owed, APR 12%, no payments. Interest lines appear on 2099-01-31 ($12.00), 2099-02-28 ($12.12) and 2099-03-31 ($12.24), and the end balance is 123,636 (±1).
  - `no interest when nothing owed`: debt balance 0, APR 20% → no Interest lines.
  - `no interest on bank accounts`.
  - `rap waives unpaid interest and matches principal`: debt $55,000, APR 6.5%, rap.enabled, a monthly $10 transfer from bank on the 15th. The January month-end shows Interest $10.00 and RAP match $10.00, and the balance after January = 5,500,000 − 1,000 + 1,000 − 1,000 = 5,499,000.
  - `blended apr from sub-loans`: subLoans [$1,000 @ 6%, $1,000 @ 12%] with account balance $2,000 → January interest = round(200,000 × 0.09 / 12) = 1,500.
  - `interest only after today`: a window from 2020-01-01 to 2020-03-31 → no Interest lines.
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Implement in the engine.
- [ ] **Step 4:** `npm test` → PASS (all suites).
- [ ] **Step 5:** Commit `feat(finance): month-end interest and RAP waiver/match in projections`.

### Task 4: Payment-plan API and RAP schedule regeneration

**Files:**
- Create: `src/lib/finance/payment-plan.ts` (server; uses models)
- Create: `src/lib/finance/rap-merge.ts` (pure) + `src/lib/finance/rap-merge.test.ts`
- Create: `src/app/api/accounts/[accountId]/payment-plan/route.ts`
- Modify: `src/lib/finance/validators.ts` (`paymentPlanSetupSchema`, `paymentPlanUpdateSchema`)
- Modify: `src/lib/finance/apply-profile.ts`, which after saving the profile calls `regenerateAllRapSchedules()`

**Interfaces (Produces):**
```ts
// rap-merge.ts (pure)
export type ScheduleEntry = { effectiveDate: string; amount: number; source?: "rap" };
/** Manual entries plus rap entries; drop rap entries dated on a manual entry's date; sorted. */
export function mergeRapEntries(manual: ScheduleEntry[], rap: ScheduleEntry[]): ScheduleEntry[];

// payment-plan.ts (server)
export interface PaymentPlanDTO { // dollars, percent
  accountId: string; apr: number | null; blendedApr: number | null; minimumPayment: number | null;
  subLoans: { name: string; balance: number; apr: number }[];
  rap: { enabled: boolean; autoSchedule: boolean; recertDate: string; dependents: number } | null;
  payment: { transactionId: string; fromAccountId: string; fromAccountName: string; dayOfMonth: number | null; frequency: string } | null;
  schedule: { effectiveDate: string; amount: number; source?: "rap" }[];
  nextRap: { effectiveDate: string; amount: number; incomeYear: number; agi: number } | null;
  payoff: { payoffDate: string | null; totalInterest: number; months: number } | null;
}
export async function getPaymentPlan(accountId: string): Promise<PaymentPlanDTO>;
export async function regenerateRapSchedule(accountId: string): Promise<void>; // no-op unless rap.enabled && autoSchedule && payment linked
export async function regenerateAllRapSchedules(): Promise<void>;
```
- Route:
  - `GET` → `{ data: PaymentPlanDTO }`
  - `POST` setup `{fromAccountId, dayOfMonth (1–28), startDate, firstAmount}`:
    - 400 unless the account is credit_card/debt and the source is an active bank account
    - creates a monthly transfer, `description: "<name> payment"`, tags `["debt"]` or `["credit"]`, `recurrenceRule.dayOfMonth`, schedule `[{startDate, firstAmount}]`
    - links it, then regenerates RAP
  - `PUT` `{schedule?, subLoans?, rap?}`:
    - schedule entries are manual only; the RAP ones are regenerated
    - unique dates, amounts ≥ 0
    - returns 409 "No payment linked — set up payments" when the schedule is sent but there is no transfer or it's gone
    - saves, then regenerates RAP
  - `DELETE` unlinks and `$unset`s the transfer's `amountSchedule`.
- Prior-year AGI in `getPaymentPlan`/`regenerateRapSchedule`:
  - load the Datasheet profile and the linked Salary transaction
  - for each year, paydays = `expandRecurrence(salary rule, Jan 1, Dec 31)` mapped with `toDateStr`
  - `priorYearAgi(profile, paydays, year, getPeriodsPerYear(freq))`
- [ ] **Step 1: Failing tests** for `mergeRapEntries`:
  - `manual entry beats rap entry on same date`
  - `sorted by date`
  - `rap entries kept when no conflict`
- [ ] **Step 2:** `npm test` → FAIL. **Step 3:** Implement everything above. **Step 4:** `npm test` → PASS; `tsc` clean.
- [ ] **Step 5: Curl verification**, with a throwaway debt account plus the existing ServU as source; delete everything after:
  - POST setup → 200, and the schedule has one entry
  - PUT adding an entry → two entries, and `/api/projections` shows the payment change on the date
  - PUT with `rap:{enabled:true,autoSchedule:true,recertDate:"07-01",dependents:0}` → automatic entries appear tagged `source:"rap"`; `nextRap.incomeYear` is the prior year
  - PUT removing an entry → gone
  - DELETE the transfer via `/api/transactions/:id`, then PUT schedule → 409, and GET → `payment: null`
  - DELETE plan → 200
- [ ] **Step 6:** Commit `feat(finance): payment-plan API with RAP auto-schedule`.

### Task 5: UI — ScheduleEditor, account cards, Datasheet Debt payments

**Files:**
- Create: `src/components/finance/schedule-editor.tsx`, with `ScheduleEditor({ entries, format, unit, onAdd(date, value), onRemove(date), addLabel?, valueMode: "money" | "percent" | "salary", hoursPerWeek? })`. It's extracted from `steps-card.tsx`'s chips and `AddStep` (same look and validation), and shows a small "RAP" badge on `source === "rap"` chips; those have no remove button.
- Modify: `src/components/finance/datasheet/steps-card.tsx` to use `ScheduleEditor`.
- Create: `src/hooks/finance/use-payment-plan.ts`, with `usePaymentPlan(accountId)` and `setupPayments`, `updatePaymentPlan`, `unlinkPaymentPlan`. After each write, mutate `/api/accounts/<id>/payment-plan`, `/api/projections*` and the transactions keys via SWR's global `mutate` with a key matcher.
- Create: `src/components/finance/debt/payment-plan-panel.tsx`, used by the account card and the Datasheet:
  - the line "APR x% (blended) · Min $y/mo"
  - payoff ("Paid off ~Mar 2041 · interest ~$31,400", or "Not paid off at current payments")
  - the source line
  - `ScheduleEditor`
  - an amber below-minimum note
  - with no plan, a **Set up payments** button opening `SetupPaymentsDialog` (from bank Select, day 1–28, start date, first amount prefilled with the minimum)
- Create: `src/components/finance/debt/loans-section.tsx` (debt only): sub-loan rows (name, balance, rate) with add/remove, the blended rate, and "Sub-loans total $X vs balance $Y" when they differ. It saves via `updatePaymentPlan({subLoans})`.
- Create: `src/components/finance/debt/rap-section.tsx` (debt only): a RAP Switch, an "Auto-update at recertification" Switch, recert date (month and day Selects), dependents, and "Next: Jul 1, 2027 · $412/mo from 2026 income $49,450". It saves via `updatePaymentPlan({rap})`.
- Modify: `src/app/(app)/finance/accounts/page.tsx` `renderCard`: for credit_card/debt (not archived), render a "Payments" collapsible holding `PaymentPlanPanel` (plus `LoansSection` and `RapSection` for debt).
- Create: `src/components/finance/datasheet/debt-payments-card.tsx`, a card listing active credit_card/debt accounts, each with its name and balance and `PaymentPlanPanel`. Add it to the Datasheet page under `StepsCard`.

- [ ] **Step 1:** Implement.
- [ ] **Step 2: Verify.**
  - `npm test`, `tsc`, eslint on touched files, `npm run build`.
  - Browser pane, using a throwaway debt account:
    - set up payments from the card, add and remove an entry, and turn RAP on; the payoff and next-RAP lines render
    - the Datasheet Debt payments card shows the same schedule
    - delete the throwaway afterwards
- [ ] **Step 3:** Commit `feat(finance): payment plans on account cards and datasheet`.

### Task 6: Hand-off
- [ ] Final whole-branch self-review against the spec, focusing on Review Focus.
- [ ] Don't set up plans on the user's real accounts.
- [ ] Report how to set up Student Loans: $10 starting next week, RAP on, recert date from Edfinancial, sub-loans from the Edfinancial statement.
