# Debt & Credit Card Payment Plans — Design

Date: 2026-11-14 · Status: draft for approval · Builds on: `2026-11-14-datasheet-design.md`

## Intent

Credit cards and debt accounts (loans included) need a payment model like the one Salary and Rent got from the Datasheet. The user is on the federal **RAP** student-loan plan, where the payment is reset every year. They want to:
- record those yearly changes on a timeline
- see projections follow them
- see a credit card's minimum payment
- optionally give an interest rate, so projected balances and payoff are realistic

## Goals
- Every credit card and debt account can have:
  - a **minimum payment**
  - an optional **APR**
  - a **payment schedule**: dated monthly payment amounts on one recurring bank → debt transfer
- The schedule can be viewed and changed (add or remove entries) on the **account card** and in a **Debt payments** section of the Datasheet.
- With an APR, projections add monthly interest, so payoff dates and remaining balances are realistic.
- Each card shows a payoff estimate (date and total interest), or says it won't be paid off at the current payments.
- **Sub-loans.** A debt account can list sub-loans (name, balance, rate), for example the user's several federal loans serviced by Edfinancial. They stay together under the account's single total balance, and their **balance-weighted (blended) rate** is the account's APR.
- **RAP mode** (a toggle on a debt account), so the user can switch it off if their terms change:
  - projections apply RAP's interest waiver and principal match
  - optionally, the payment schedule updates itself every recertification date from the prior calendar year's income

## Non-goals
- Click-to-edit on timeline entries. Entries are removed and re-added (user decision). This also applies to the Datasheet.
- Redesigning the account edit popup. The user said it's fine; it only gains the two new fields.
- Tracking each sub-loan's balance separately or modeling servicer payment allocation (the user chose the blended rate).
- RAP's married-filing-jointly spousal adjustment. Income comes only from the user's Datasheet.
- Statement cycles, grace periods, daily-balance interest, promotional APRs, minimum-payment formulas (like 1% + interest). The minimum is a dollar amount the user enters.
- Migrating the existing "Pay Dan" one-time debits into transfers. They get flagged to the user only.

## Anti-goals
- A debt payment that lowers the bank balance but not the debt. Linked payments are always transfers into the debt account.
- Counting interest twice. Past interest is already in the stored balance, so projections add interest only for dates after today.
- A second copy of the timeline that can drift from what projections use.

## Approaches considered
- **A. Steps saved on the account, copied onto the transfer.** The Datasheet does this, but only because net pay has to be calculated from salary. For debts it means duplicate data and syncing. Rejected.
- **B. The transfer's `amountSchedule` is the timeline (chosen by the user).** The account stores only its plan fields and a link to its payment transfer. The account card and the Datasheet both edit the transfer's schedule through one API, and the projection engine already reads `amountSchedule`.
- **C. Debts inside the Datasheet profile.** This puts account data away from the account and makes the Accounts page depend on the Datasheet. Rejected.

## Decisions (user)
- Credit cards and loans get the same treatment: minimum payment, optional APR, adjustable payment schedule.
- Approach B.
- No click-to-edit; remove and re-add.
- Leave the edit popup as it is.
- Interest builds up in projections (the user accepted the proposal).
- RAP is a toggle on the loan.
- Sub-loans use a blended rate under one total balance.
- RAP payments update automatically on the recertification date, using the **prior calendar year's year-end income** (what the tax return reports).
- The user's first RAP payment is next week, at $10/mo. It's entered by hand as the first schedule entry.

## Calls made by Claude (for review)
- **Payments are monthly.** The "Set up payments" flow creates a monthly transfer (`frequency: monthly`, chosen day of month) from a chosen bank account. A plan can also link an existing recurring transfer into that account, whatever its frequency.
- **A new schedule starts at the minimum payment**, effective on the first payment date. If no minimum is set, the user enters the first amount.
- **Below-minimum warning.** If the payment in effect today, or any scheduled entry, is below the minimum payment, the card shows an amber warning. Nothing is enforced.
- **APR and minimum payment are edited in the existing account popup.** They are two optional fields, shown only for credit cards and debt.
- **Interest is added on the last day of each month in projections:** `round(owed × APR / 12)`, only when owed > 0, and only for month-ends after today. It shows as a projected debit named "Interest" on that account (category `interest`), so it appears in the timeline, alerts, reports and income/expense totals. A credit card's limit doesn't stop interest; a card can go over its limit from interest alone.
- **Payoff estimate** comes from a small pure function: simulate month by month from today's balance, with month-end interest and the scheduled payment, capped at what's owed. Give up after 50 years and say "not paid off at current payments". This matches the engine's rules without running a full projection per card.
- **The Datasheet "Debt payments" section** lists every active credit card and debt account. Each has the same schedule chips and Add popover as the account card, plus a "Set up payments" button when no payment is linked.
- Unlinking a payment plan clears the transfer's `amountSchedule` (as the Datasheet does) but doesn't delete the transfer.
- **Sub-loans only set the rate mix.** The account balance stays the real balance, changed by transactions. When the sub-loans' total differs from the account balance, the card shows both, so the user can update them. Sub-loans are edited in a "Loans" list on the debt card, not in the account popup, which the user wants kept as it is.
- **With sub-loans, APR is derived** (Σ balance×rate / Σ balance) and is read-only in the popup.
- **Prior-year income for RAP = AGI estimate** = gross − pre-tax 401(k) − health for each Datasheet paycheck dated in that calendar year. It uses the linked Salary transaction's real paydays, so 27-paycheck years count correctly. Years with no Datasheet salary data get no automatic entry; the user's manual entries cover them.
- **Automatic RAP entries are tagged** (`source: "rap"`) inside the schedule. They're regenerated for each recertification date from today through 10 years ahead whenever the plan or the Datasheet is saved. Manual entries are never touched, and on the same date a manual entry beats an automatic one.
- **The recertification date** is a month and day on the loan (e.g. 07-01), repeating every year. Dependents is a number on the loan (default 0).

## Design

### Data
`Account` also gains, for debt accounts:
- `subLoans?: [{ name, balance /* cents */, apr /* fraction */ }]`
- `rap?: { enabled: boolean, autoSchedule: boolean, recertDate: "MM-dd", dependents: number }`

`amountSchedule` entries gain an optional `source?: "rap"`.

`Account` gains three optional fields:
- `apr?: number` (fraction, 0.065)
- `minimumPayment?: number` (cents)
- `paymentTransactionId?: ObjectId`, the recurring transfer whose `toAccountId` is this account

The payment amounts live only in that transaction's existing `amountSchedule`.

### API
- `GET /api/accounts/[accountId]/payment-plan` returns `{ apr, minimumPayment, payment: { transactionId, fromAccountId, dayOfMonth, frequency } | null, schedule: [{effectiveDate, amount}] }` in dollars.
- `PUT /api/accounts/[accountId]/payment-plan` with `{ schedule: [{effectiveDate: "yyyy-MM-dd", amount}] }`:
  - replaces the linked transfer's `amountSchedule`
  - sets its `amount` to the amount in effect today
  - returns 409 if no payment is linked or the transfer is gone
  - validates unique dates and amounts ≥ 0
- `POST /api/accounts/[accountId]/payment-plan` with `{ fromAccountId, dayOfMonth, startDate, firstAmount }`:
  - creates the recurring monthly transfer (description `"<account name> payment"`, category `debt`/`credit` by type, `balanceApplied` false)
  - gives it a one-entry schedule
  - links it to the account
  - returns 400 if the account is not a credit card or debt, or if the source is not a bank
- `DELETE /api/accounts/[accountId]/payment-plan` unlinks the payment and clears the schedule.
- The existing account PUT and Zod schema accept `apr` (percent in the form, stored as a fraction) and `minimumPayment` (dollars → cents).

### Projection engine (`projection-engine.ts`)
After a day's transactions are applied, if the day is a month-end and after today: for each debt or credit-card account with `apr > 0` and running balance > 0, add the interest to the balance. Also push a synthetic `ProjectedTransaction` `{type: "debit", description: "Interest", categoryTags: ["interest"], isProjected: true}` for that account onto the day.

A new pure helper `monthlyInterest(owedCents, apr)` is shared with the payoff estimate. The account's effective APR is the blended sub-loan rate when sub-loans exist, otherwise `apr`.

**RAP month-end** (when `rap.enabled`). Let `paid` be the total transferred into the account that calendar month, and `interest = monthlyInterest(owed, apr)`:
- `charged = min(interest, paid)` (unpaid interest is not charged)
- `principalPaid = paid − charged`
- `match = max(0, min($50, paid) − principalPaid)`, capped at what's still owed
- the balance changes by `+charged − match`

The synthetic "Interest" line shows `charged`. A synthetic credit line "RAP principal match" shows `match`.

### RAP payment (`src/lib/finance/rap.ts`)
- `rapMonthlyPayment(agiCents, dependents)`:
  - AGI ≤ $10,000 → $10
  - otherwise rate = min(10%, ceil((AGI − 10,000) / 10,000)%), so $10,001–20,000 is 1% … above $100,000 is 10%
  - monthly = round(AGI × rate / 12) − $50 × dependents, with a floor of $10
- `priorYearAgi(profile, paydays)` sums Datasheet per-paycheck (gross − 401(k) − health) over the paydays in that year.
- `rapScheduleEntries(...)` returns `{effectiveDate: recert date in year Y, amount, source: "rap"}` for each recertification date from today through 10 years ahead, using year Y−1 income.

### Payoff estimate (`src/lib/finance/payoff.ts`)
```
estimatePayoff({ balance, apr, schedule, startDate }): { payoffDate: string | null; totalInterest: number; months: number }
```
Payments are applied on each month's payment day using `amountOn(schedule)`, and interest is added at month-end.

### UI
- **Shared `ScheduleEditor`**: the chips row plus Add popover from the Datasheet's `steps-card.tsx`, pulled into a reusable component that takes `entries`, `format`, `onAdd` and `onRemove`. The Datasheet's four rows switch to it.
- **Account card (credit card and debt):**
  - a line showing `APR x% · Min $y/mo`
  - a payoff line
  - the payment source line ("ServU → Student Loans, monthly on the 15th")
  - the schedule editor, which saves on each add or remove
  - an amber note if a payment is below the minimum
  - with no plan linked, a **Set up payments** button opens a small dialog: from account, day of month, start date, first amount (prefilled with the minimum)
- **Datasheet:** a new **Debt payments** card under "Changes over time", with one row per active credit card or debt account. It uses the same editor and Set up button and calls the same API, so it's independent of the Datasheet Save button.
- **Account popup:** adds APR (%) and Minimum payment ($) inputs for credit cards and debt. APR is read-only and shows "blended" when sub-loans exist.
- **Debt card "Loans" section:** a list of sub-loans (name, balance, rate) with add and remove, the blended rate, and the sub-loan total next to the account balance.
- **Debt card "RAP" section:**
  - a toggle, plus "auto-update payment at recertification" (also a toggle)
  - recertification date and dependents inputs
  - the next automatic payment ("Jul 1, 2027: $412/mo, from 2026 income $49,450")
  - automatic entries are shown with a small "RAP" tag in the schedule chips

## Left to the builder
- Component file layout, the SWR hook (`use-payment-plan.ts`) and mutate wiring, so the account card and Datasheet stay in sync.
- Exact Zod shapes and error copy beyond what's above.

## Verification
- Unit tests:
  - `rapMonthlyPayment` at each boundary: $10,000 → $10; $10,001 → 1%; $100,000 → 9%; $100,001 → 10%; the dependent reduction and the $10 floor
  - `priorYearAgi` with a 27-paycheck year
  - the RAP month-end: a $10 payment against $250 interest charges $10, waives $240 and matches $10
  - blended APR
  - `monthlyInterest` and its rounding
  - `estimatePayoff`: zero APR, APR with payments that do pay it off, a payment below the interest (never paid off), and a step change in payments
  - engine: month-end interest added only after today and only while owed > 0, plus a payment schedule on a transfer reducing the debt
- API (curl, throwaway account and transfer, then cleaned up): set up, add a step, remove it, 409 after deleting the transfer, unlink.
- Browser pane: the card shows the plan and payoff, add and remove persist, and the Datasheet section reflects the same schedule.
- `npm test`, `tsc`, lint on touched files, `npm run build`.
