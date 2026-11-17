"use client";

import Link from "next/link";
import { ChartBlock, Headline, ModuleCard, StatRow, StatRows } from "@/components/dashboard/module-card";
import { HBarList, SparkBars } from "@/components/dashboard/spark";
import { CurrencyDisplay } from "@/components/finance/currency-display";
import { useAccounts } from "@/hooks/finance/use-accounts";
import { useSummary } from "@/hooks/finance/use-summary";
import { expenseCategories, monthExpenses, type ExpenseItem } from "@/lib/dashboard/stats";
import { computeAccountTotals } from "@/lib/finance/account-utils";
import { centsToDollars, formatCurrency, formatDateISO, formatDateShort } from "@/lib/finance/formatters";
import { monthWeekBuckets } from "@/lib/finance/summary-utils";

// Same colors as the Finance dashboard's income and expenses bars
const INCOME_COLOR = "var(--chart-2)";
const EXPENSE_COLOR = "var(--chart-1)";

const MAX_CATEGORIES = 5;
const MAX_PAID = 6;
const MAX_UPCOMING = 3;

const dollars = (n: number) => formatCurrency(Math.round(n * 100));

export function FinanceCard() {
  const { accounts, isLoading: accountsLoading } = useAccounts();
  const { summary, isLoading: summaryLoading } = useSummary("monthly", new Date());

  const totals = computeAccountTotals(accounts);
  const weeks = monthWeekBuckets(summary?.days ?? []).map((w) => ({
    label: w.label,
    income: centsToDollars(w.totalCredits),
    expenses: centsToDollars(w.totalDebits),
  }));
  const hasFlow = weeks.some((w) => w.income > 0 || w.expenses > 0);
  const monthLabel = summary?.period.label ?? "This month";
  const expenses = monthExpenses(summary?.days ?? [], formatDateISO(new Date()));
  // This month's payments into loan / debt accounts, by date. They are transfers, so the expense lists skip them.
  const today = formatDateISO(new Date());
  const loanNames = new Map(accounts.filter((a) => a.type === "debt").map((a) => [a._id, a.name]));
  const loanPayments: ExpenseItem[] = (summary?.days ?? []).flatMap((d) =>
    d.transactions
      .filter((t) => t.type === "transfer" && t.toAccountId && loanNames.has(t.toAccountId))
      .map((t, i) => ({
        key: `${d.date}-${i}-${t.toAccountId}`,
        date: d.date.slice(0, 10),
        description: loanNames.get(t.toAccountId!)!,
        amount: t.amount,
      }))
  );
  // Loan payments count as a "loans" category here, next to the spending categories
  const allCategories = expenseCategories(summary?.categoryBreakdown ?? [], summary?.totals.loanPayments ?? 0);
  const topCategory = allCategories[0];
  const categories = allCategories.slice(0, MAX_CATEGORIES);
  const maxCategory = Math.max(...categories.map((c) => c.amount), 1);

  return (
    <ModuleCard moduleId="finance" href="/finance" isLoading={accountsLoading || summaryLoading} wide>
      <div className="grid gap-x-8 gap-y-4 md:grid-cols-2">
        <div className="space-y-4">
          <Headline
            label="Net worth"
            value={formatCurrency(totals.netWorth)}
            sub={`${accounts.length} account${accounts.length !== 1 ? "s" : ""}`}
          />

          {hasFlow && (
            <ChartBlock
              caption={`${monthLabel} by week`}
              legend={[
                { label: "Income", color: INCOME_COLOR },
                { label: "Expenses", color: EXPENSE_COLOR },
              ]}
            >
              <SparkBars
                data={weeks}
                series={[
                  { key: "income", label: "Income", color: INCOME_COLOR, format: dollars },
                  { key: "expenses", label: "Expenses", color: EXPENSE_COLOR, format: dollars },
                ]}
              />
            </ChartBlock>
          )}

          <StatRows>
            <StatRow label="Assets" value={formatCurrency(totals.assets)} href="/finance/accounts" />
            <StatRow label="Liabilities" value={formatCurrency(totals.liabilities)} href="/finance/accounts" />
            {summary && (
              <>
                <p className="pt-1.5 text-xs text-muted-foreground">{monthLabel}</p>
                <StatRow label="Income" value={formatCurrency(summary.totals.income)} />
                <StatRow label="Expenses" value={formatCurrency(summary.totals.expenses)} />
                <StatRow label="Net" value={<CurrencyDisplay cents={summary.totals.net} colored />} />
              </>
            )}
            {topCategory && (
              <StatRow
                label="Top spending"
                value={`${topCategory.category} · ${formatCurrency(topCategory.amount)}`}
                href="/finance/transactions"
              />
            )}
            {totals.creditUtilization !== null && (
              <StatRow
                label="Credit used"
                value={`${Math.round(totals.creditUtilization)}% of ${formatCurrency(totals.creditLimit)}`}
              />
            )}
          </StatRows>

          {loanPayments.length > 0 && (
            <ExpenseList title={`Loan payments in ${monthLabel}`} items={loanPayments} more={0} mutedAfter={today} />
          )}
        </div>

        <div className="space-y-4">
          <Headline
            label={`Spent so far in ${monthLabel}`}
            value={formatCurrency(expenses.paidTotal)}
            sub={`${formatCurrency(expenses.upcomingTotal)} still to come`}
          />

          {categories.length > 0 && (
            <ChartBlock caption="Month's expenses by category, loans included">
              <HBarList
                color={EXPENSE_COLOR}
                rows={categories.map((c) => ({
                  key: c.category,
                  label: c.category,
                  fraction: c.amount / maxCategory,
                  value: formatCurrency(c.amount),
                }))}
              />
            </ChartBlock>
          )}

          <ExpenseList
            title="Paid"
            items={expenses.paid.slice(-MAX_PAID)}
            more={expenses.paid.length - MAX_PAID}
            moreFirst
            empty="No expenses yet this month"
          />
          {expenses.upcoming.length > 0 && (
            <ExpenseList
              title="Upcoming"
              items={expenses.upcoming.slice(0, MAX_UPCOMING)}
              more={expenses.upcoming.length - MAX_UPCOMING}
              muted
            />
          )}
        </div>
      </div>
    </ModuleCard>
  );
}

function ExpenseList({
  title,
  items,
  more,
  empty,
  muted = false,
  mutedAfter,
  moreFirst = false,
}: {
  title: string;
  items: ExpenseItem[];
  /** How many lines were left out */
  more: number;
  empty?: string;
  muted?: boolean;
  /** Lines dated after this day (yyyy-MM-dd) are dimmed as not yet paid */
  mutedAfter?: string;
  /** The left-out lines are the earliest ones, so say so above the list */
  moreFirst?: boolean;
}) {
  const moreLink = more > 0 && (
    <Link href="/finance/transactions" className="block text-xs text-muted-foreground hover:underline">
      {more} {moreFirst ? "earlier" : "more"}
    </Link>
  );
  return (
    <div className="space-y-1.5 border-t pt-3 text-sm">
      <p className="text-xs text-muted-foreground">{title}</p>
      {items.length === 0 && empty && <p className="text-muted-foreground">{empty}</p>}
      {moreFirst && moreLink}
      {items.map((item) => (
        <div key={item.key} className={`flex items-baseline gap-3 ${
            muted || (mutedAfter && item.date > mutedAfter) ? "text-muted-foreground" : ""
          }`}>
          <span className="w-12 shrink-0 text-xs text-muted-foreground tabular-nums">{formatDateShort(item.date)}</span>
          <span className="min-w-0 flex-1 truncate" title={item.description}>
            {item.description}
          </span>
          <span className="shrink-0 font-medium tabular-nums">{formatCurrency(item.amount)}</span>
        </div>
      ))}
      {!moreFirst && moreLink}
    </div>
  );
}
