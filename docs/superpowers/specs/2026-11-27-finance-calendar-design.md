# Finance calendar

## Intent

A visual overview of a month: a calendar grid with each day's transactions, so paydays, bills and
payments can be seen at a glance. One month at a time, with back / forward like Projections.
Independent of the projection sandbox.

## Goals

- Page `/finance/calendar`, in the Finance sidebar after Transactions
- Previous / next month and Today; the month is kept in the URL (`?month=yyyy-MM`)
- Sunday to Saturday grid; each day lists up to three transactions and "+N more"
- Past and upcoming transactions both appear; upcoming ones are dimmed, today is outlined
- A day opens a side panel with every transaction that day and the end-of-day bank balance
- Month totals above the grid: income, expenses, loan payments, net
- Works in My data and Browser data

## Non-goals

- Adding or editing transactions from the calendar
- An account filter
- Any sandbox what-if

## Approaches

1. **Reuse `GET /api/summary?view=monthly`** (picked). It already returns every day of a month with
   its transactions (posted, pending and recurring occurrences) and day-end balances, and never
   reads the sandbox. No new endpoint, no new stored data, nothing to add to the parity scenario.
2. A dedicated calendar endpoint. Would repeat what the summary computes.
3. Read `/api/transactions` and expand recurrence in the browser. Would duplicate the engine and
   lose its payoff capping and same-day order.

## Design

- `src/lib/finance/calendar.ts` (pure, tested): `parseMonth`, `shiftMonth`, `monthWeeks`,
  `signedAmount`, `bankBalance`
- `src/components/finance/calendar/month-grid.tsx` and `day-sheet.tsx`
- `src/app/(app)/finance/calendar/page.tsx` uses `useSummary("monthly", …)` and `useAccounts`
- Amounts are cents; income is shown positive, expenses negative, transfers unsigned
- Narrow screens show one dot per transaction instead of text
