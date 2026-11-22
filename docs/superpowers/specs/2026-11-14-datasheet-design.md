# Finance Datasheet — Design

Date: 2026-11-14 · Status: draft for approval

## Intent

Replace the user's personal salary spreadsheet with a **Datasheet** page in the Finance module. Today the user keeps salary math in a spreadsheet:
- a flat 24% tax rate
- hourly, weekly, monthly and annual figures, gross and actual
- a few what-if salaries
- a 10-year table compounding a 3% raise
- a rent figure

They then hand-copy the results into the Salary and Rent transactions. To model a move, they created a second Rent transaction by hand.

The Datasheet should:
1. Compute **real take-home pay** from brackets: federal, Social Security, Medicare and New York State, plus NY extras. The user's own pre-tax deductions (401(k), health insurance) come out first.
2. **Drive the Salary and Rent transactions.** The net biweekly pay and the monthly rent flow into the projection engine.
3. Let the user enter **dated changes** (raises, 401(k) increases, health-plan changes, moves) that take effect in projections from their date.
4. Show **what-if salaries** with the same breakdown.
5. Show a **10-year raise projection** from the actual salary, at an editable annual raise rate (default 3%).

## Goals
- Net pay per paycheck matches a real NY pay stub closely: within a few dollars, given the same inputs.
- Projections reflect raises, contribution changes and moves on the right dates, with no hand-editing of transactions.
- The page reads like the spreadsheet: compact tables, with gross and net side by side.

## Non-goals
- Exact payroll withholding (W-4 allowances, supplemental/bonus rates, year-to-date Social Security cap tracking). Net pay is the annualized tax ÷ pay periods.
- Indexing tax brackets to future years. Every year uses the current tax-year tables.
- Applying the 10-year table to transactions automatically. It is a view; dated raises are entered by hand.
- Multiple jobs or states. One salary and one state (NY) with an optional NYC resident tax.

## Anti-goals
- Generated or duplicate transactions cluttering the transactions list.
- Datasheet logic leaking into reports or the transactions page beyond the amount schedule.
- A silently wrong projection. If a linked transaction is missing or deleted, the Datasheet must say so rather than fail quietly.

## Approaches considered
- **A. Dated segments.** Save rewrites Salary/Rent as chained recurring transactions. No engine change, but it creates generated rows and delete/recreate churn. Rejected.
- **B. Engine reads the Datasheet.** The most accurate, since it could model the mid-year Social Security cap, but datasheet logic would spread into projections, reports and transactions. Rejected.
- **C. Amount schedule on the transaction (chosen by the user).** Salary and Rent each stay one recurring transaction, with an `amountSchedule` list of `{effectiveDate, amount}`. The Datasheet writes it on save, and the engine picks the entry in effect on each occurrence date. The trade-off: net pay is constant between steps.

## Decisions (user)
- Taxes are computed from brackets: federal, Social Security, Medicare and **New York State**.
- **401(k)** is user-entered and steps up over time with dated changes.
- **Health insurance** is user-entered and static for now, but can have dated changes (e.g. a family plan).
- Raises and moves are dated changes that update the Salary and Rent transactions.
- What-if salaries show a full breakdown.
- The 10-year projection uses an annual raise, 3% today.
- Approach C.
- The 401(k) is **traditional (pre-tax)**: it reduces federal and NY taxable income, but not FICA wages.

## Calls made by Claude (for review)
- The 401(k) is entered as **% of gross**, and health insurance as **$ per paycheck** (as on a pay stub).
- Health insurance is pre-tax for everything, including FICA (Section 125, the common employer setup).
- NY SDI, NY Paid Family Leave, and an optional NYC resident tax are included.
- Net pay is annualized tax ÷ pay periods; there is no year-to-date Social Security cap tracking.
- Current tax-year tables are used for all future years (no inflation indexing).
- A dated change can fall on any date. It applies to the first paycheck or rent due on or after that date.
- The 10-year table is display-only, with year 1 equal to the current salary × (1 + raise rate). It matches the spreadsheet.
- Employer 401(k) match is out of scope, since it doesn't affect take-home pay.

## Design

### Data

**`Transaction.amountSchedule`** (new, optional): `[{ effectiveDate: Date, amount: number /* cents */ }]`, sorted ascending.
- Engine rule: for each recurring occurrence on date `d`, use the last entry with `effectiveDate ≤ d`. If none applies (or the list is empty), use `amount`.
- On save, the Datasheet also sets `amount` to the entry in effect today, so the transactions list shows the current figure.
- Editing a scheduled transaction's amount in the normal transaction form: the form shows a note "Amount managed by Datasheet" and disables the amount field when `amountSchedule` is non-empty.

**`FinanceProfile`** (new model; a single document, `src/models/finance/FinanceProfile.ts`):
```
filingStatus: single | married_jointly | married_separately | head_of_household
hoursPerWeek: number                       // default 40, for hourly ↔ annual
nycResident: boolean                       // NYC local tax on/off
raiseRate: number                          // 0.03 default, 10-year table only
salaryTransactionId?: ObjectId             // link to the Salary recurring tx
rentTransactionId?: ObjectId               // link to the Rent recurring tx
salarySteps:   [{ effectiveDate, annualGross /* cents */ }]
retirementSteps:[{ effectiveDate, percent /* 0.06 */ }]
healthSteps:   [{ effectiveDate, perPaycheck /* cents */ }]
rentSteps:     [{ effectiveDate, monthly /* cents */ }]
whatIfSalaries:[{ label?, annualGross /* cents */ }]
```
The pay cycle is read from the linked Salary transaction's recurrence frequency (biweekly today), falling back to biweekly.

### Tax engine (`src/lib/finance/tax-calculator.ts`, extended)
Inputs: annual gross, 401(k) %, health per paycheck × periods, filing status, NYC flag, periods per year. Outputs the annual and per-period breakdown below, all in cents:
- `retirement = gross × percent`
- `health = perPaycheck × periods`
- **FICA wages** = gross − health. **Income-tax wages** = gross − health − retirement.
- **Federal** = brackets on (income-tax wages − federal standard deduction).
- **Social Security** = 6.2% of FICA wages up to the wage base. **Medicare** = 1.45% plus 0.9% above the threshold.
- **NY State** = NY brackets on (income-tax wages − NY standard deduction).
- **NYC** (if on) = NYC brackets on the same NY taxable income.
- **NY SDI** = 0.5% of wages, capped at $0.60/week (31.20/yr). **NY PFL** = the current-year rate × FICA wages, capped at the annual maximum.
- **Net** = gross − retirement − health − all taxes.

Tables move to the current tax year (2026): federal brackets and standard deduction, the Social Security wage base, NY State and NYC brackets, and NY PFL rate/cap. They live in `constants.ts` under a `TAX_YEAR` constant. Values are checked against official sources at implementation. The existing `calculateSalary` export changes signature; it has no callers.

The values the pay stub uses are cents throughout. All rounding happens per line per period, so the per-period lines sum exactly to the per-period net.

### Schedule generation (on Datasheet save, server-side)
- **Salary.** Take the union of effective dates from the salary, retirement and health steps. At each date, use the latest step of each kind and compute the per-paycheck net. That gives `{effectiveDate, net}` entries; adjacent duplicates are dropped. Write them to the linked Salary transaction's `amountSchedule`, and set `amount` to the entry in effect today.
- **Rent.** Rent steps map directly to `{effectiveDate, monthly}`, written to the linked Rent transaction.
- One API call (`PUT /api/finance-profile`) validates with Zod, saves the profile and updates both transactions. If a linked transaction no longer exists, it returns 409 with a message and the page shows "Linked Salary transaction not found — pick one".

### Page: `/finance/datasheet` (nav item "Datasheet")
Four sections, compact tables in the existing shadcn style:

```
┌ Settings ──────────────────────────────────────────────────────────┐
│ Filing status [Single ▾]  Hours/wk [40]  NYC resident [ ]          │
│ Salary tx [Salary ▾]  Rent tx [Rent ▾]   Pay cycle: Biweekly (tx)  │
└────────────────────────────────────────────────────────────────────┘
┌ Changes over time ────────────────────────────────────────────────┐
│ Salary      2026-10-02  $62,400/yr   2027-03-05  $66,000/yr  [+]  │
│ 401(k)      2026-10-02  6%           2027-06-04  8%          [+]  │
│ Health      2026-10-02  $85.00/chk                           [+]  │
│ Rent        2026-03-01  $1,800/mo    2027-05-01  $2,100/mo   [+]  │
└────────────────────────────────────────────────────────────────────┘
┌ Paycheck breakdown (in effect today) ─────── per check │ month │ yr ┐
│ Gross · 401(k) · Health · Federal · Soc Sec · Medicare · NY ·      │
│ NYC · SDI · PFL · Net · effective rate                             │
└────────────────────────────────────────────────────────────────────┘
┌ Salaries ─ Hourly │ Wkly(g) │ Mo(g) │ Yr(g) │ Wkly(net) │ Mo(net) │ Yr(net) ┐
│ Actual            (current salary step)                           │
│ What-if rows      (editable: hourly or annual input, add/remove)  │
│ 10-year @ [3]%    Starting, 1 … 10                                │
└────────────────────────────────────────────────────────────────────┘
```
- Salary inputs accept hourly or annual and convert with `hoursPerWeek × 52`. Monthly = annual / 12, matching the spreadsheet.
- What-if and 10-year rows use the current filing status, 401(k) % and health amount.
- One **Save** button persists everything and updates the transactions. A toast confirms "Salary and Rent updated".

### Existing data
The DB has two Rent transactions: through 2027-04-01 and from 2027-05-01. On first link, the page offers to **merge**:
- the second Rent's amount becomes a rent step on 2027-05-01
- the first Rent's `endDate` is cleared
- the second is deleted after a confirm dialog

The user can decline.

## Left to the builder
- Component breakdown, the SWR hook (`use-finance-profile.ts`), and the exact Zod shapes.
- Validation: step dates must be unique within a kind, there must be at least one salary step, and percent must be 0–100%.
- Keeping `amountSchedule` out of the transactions table, except for the disabled-amount note in the form.

## Verification
- Tax-calculator script (node strip-types) with hand-checked cases: a $62,400 single NY non-NYC filer with 6% 401(k) and $85/check health, compared line by line against a public NY paycheck calculator for the same tax year.
- A projection API check with a raise step: Salary occurrences before and after the step date carry the two different nets, and Rent changes on the move date.
- `npm run lint` (no new errors) and `npm run build`.
