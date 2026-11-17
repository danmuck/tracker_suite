"use client";

import { ChartBlock, Headline, ModuleCard, StatRow, StatRows } from "@/components/dashboard/module-card";
import { SparkBars } from "@/components/dashboard/spark";
import { CurrencyDisplay } from "@/components/finance/currency-display";
import { useAccounts } from "@/hooks/finance/use-accounts";
import { useSummary } from "@/hooks/finance/use-summary";
import { computeAccountTotals } from "@/lib/finance/account-utils";
import { centsToDollars, formatCurrency } from "@/lib/finance/formatters";
import { monthWeekBuckets } from "@/lib/finance/summary-utils";

// Same colors as the Finance dashboard's income and expenses bars
const INCOME_COLOR = "var(--chart-2)";
const EXPENSE_COLOR = "var(--chart-1)";

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
  const topCategory = summary?.categoryBreakdown[0];
  const monthLabel = summary?.period.label ?? "This month";

  return (
    <ModuleCard moduleId="finance" href="/finance" isLoading={accountsLoading || summaryLoading}>
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
    </ModuleCard>
  );
}
