"use client";

import { format } from "date-fns";
import { ArrowRightLeft } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { CurrencyDisplay } from "@/components/finance/currency-display";
import { centsToDollars } from "@/lib/finance/formatters";
import { isLiability } from "@/lib/finance/account-utils";
import type { Account } from "@/types/finance/account";
import type { Granularity, ProjectionResult } from "@/types/finance/projection";

/** Calendar-date string (yyyy-MM-dd) → Date that formats to the same day in any timezone */
const toDate = (dateStr: string) => new Date(dateStr.slice(0, 10) + "T12:00:00.000Z");
const fmtDay = (dateStr: string) => format(toDate(dateStr), "MMM d, yyyy");
const fmtMonth = (dateStr: string) => format(toDate(dateStr), "MMM yyyy");
const dollarAxis = (v: number) => `$${(v / 1000).toFixed(0)}k`;

function StatCard({ title, children, hint }: { title: string; children: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-1">
        <CardTitle className="text-xs text-muted-foreground font-normal">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-lg font-bold">{children}</div>
        {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
      </CardContent>
    </Card>
  );
}

/** Lowest cash balance, savings rate, interest, and debt payments vs other spending */
export function ProjectionInsightCards({ summary }: { summary: ProjectionResult["summary"] }) {
  const { lowestCash, totalIncome, totalExpenses, netChange, interestCharged, debtPayments } = summary;
  const savingsRate = totalIncome > 0 ? (netChange / totalIncome) * 100 : null;
  const otherSpending = totalExpenses - interestCharged;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard title="Lowest Cash Balance" hint={lowestCash ? `on ${fmtDay(lowestCash.date)}` : "No bank accounts in view"}>
        {lowestCash ? <CurrencyDisplay cents={lowestCash.amount} colored /> : "—"}
      </StatCard>
      <StatCard title="Savings Rate" hint="Net change as a share of income">
        {savingsRate === null ? (
          "—"
        ) : (
          <span className={savingsRate < 0 ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"}>
            {savingsRate.toFixed(1)}%
          </span>
        )}
      </StatCard>
      <StatCard title="Interest Charged" hint={interestCharged === 0 ? "Set an APR on cards and debt to project interest" : "Projected, at month end"}>
        <CurrencyDisplay cents={interestCharged} />
      </StatCard>
      <StatCard
        title="Debt Payments"
        hint={
          <>
            vs <CurrencyDisplay cents={otherSpending} /> other spending
          </>
        }
      >
        <CurrencyDisplay cents={debtPayments} />
      </StatCard>
    </div>
  );
}

/** Projected payoff date for each card / debt that owes money at the start */
export function PayoffDates({
  payoffDates,
  accounts,
}: {
  payoffDates: ProjectionResult["summary"]["payoffDates"];
  accounts: Account[];
}) {
  const rows = accounts.filter((a) => a._id in payoffDates);
  if (rows.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Debt-Free Dates</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="divide-y divide-border">
          {rows.map((a) => {
            const date = payoffDates[a._id];
            return (
              <div key={a._id} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0 text-sm">
                <span className="truncate">{a.name}</span>
                {date ? (
                  <span className="shrink-0 font-medium text-green-600 dark:text-green-400">{fmtDay(date)}</span>
                ) : (
                  <span className="shrink-0 text-xs text-muted-foreground">Not within this window</span>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

/** The largest upcoming items: next occurrence of each projected transaction, top few by amount */
export function UpcomingItems({
  timeline,
  accounts,
  limit = 5,
}: {
  timeline: ProjectionResult["timeline"];
  accounts: Account[];
  limit?: number;
}) {
  const accountMap = Object.fromEntries(accounts.map((a) => [a._id, a]));
  const seen = new Set<string>();
  const next = timeline
    .flatMap((d) => d.transactions)
    .filter((t) => {
      if (!t.isProjected || t.amount <= 0 || !t.sourceTransactionId) return false;
      if (seen.has(t.sourceTransactionId)) return false;
      seen.add(t.sourceTransactionId);
      return true;
    });
  const items = [...next]
    .sort((a, b) => b.amount - a.amount)
    .slice(0, limit)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (items.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Largest Upcoming Items</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="divide-y divide-border">
          {items.map((t) => {
            const from = accountMap[t.accountId]?.name ?? "Unknown account";
            const to = t.toAccountId ? accountMap[t.toAccountId]?.name ?? "Unknown account" : null;
            return (
              <div
                key={t.sourceTransactionId}
                className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0"
              >
                <div className="min-w-0">
                  <p className="text-sm truncate">{t.description}</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <span>{fmtDay(t.date)}</span>
                    <span className="opacity-40">|</span>
                    <span className="truncate">{from}</span>
                    {to && (
                      <>
                        <ArrowRightLeft className="h-2.5 w-2.5 shrink-0" />
                        <span className="truncate">{to}</span>
                      </>
                    )}
                  </p>
                </div>
                <CurrencyDisplay
                  cents={t.type === "debit" ? -t.amount : t.amount}
                  colored={t.type !== "transfer"}
                  className="shrink-0 font-mono text-sm"
                />
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

interface TimelineChartProps {
  timeline: ProjectionResult["timeline"];
  accounts: Account[];
  granularity: Granularity;
}

function dateTick(granularity: Granularity) {
  return (v: string) => (granularity === "monthly" ? fmtMonth(v) : format(toDate(v), "MMM d"));
}

function dateLabel(granularity: Granularity) {
  return (label: string) => (granularity === "monthly" ? fmtMonth(label) : fmtDay(label));
}

const NET_WORTH_CONFIG: ChartConfig = { netWorth: { label: "Net worth", color: "var(--chart-2)" } };

/** Assets minus everything owed, across the accounts in view */
export function NetWorthChart({ timeline, accounts, granularity }: TimelineChartProps) {
  if (timeline.length === 0 || accounts.length === 0) return null;
  const data = timeline.map((day) => ({
    date: day.date,
    netWorth: centsToDollars(
      accounts.reduce((sum, a) => {
        const bal = day.balances[a._id] ?? 0;
        return sum + (isLiability(a) ? -bal : bal);
      }, 0)
    ),
  }));

  return (
    <ChartCard title="Net Worth">
      <ChartContainer config={NET_WORTH_CONFIG} className="h-[300px] w-full">
        <AreaChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" tickFormatter={dateTick(granularity)} tick={{ fontSize: 11 }} />
          <YAxis tickFormatter={dollarAxis} tick={{ fontSize: 11 }} />
          <ChartTooltip content={<ChartTooltipContent labelFormatter={dateLabel(granularity)} />} />
          <Area
            type="monotone"
            dataKey="netWorth"
            // Fill down to the axis floor; the default (zero) fills upward when net worth is negative
            baseValue="dataMin"
            stroke="var(--color-netWorth)"
            fill="var(--color-netWorth)"
            fillOpacity={0.15}
            strokeWidth={2}
          />
        </AreaChart>
      </ChartContainer>
    </ChartCard>
  );
}

const UTILIZATION_CONFIG: ChartConfig = { utilization: { label: "Utilization %", color: "var(--chart-4)" } };

/** Total credit card balances as a share of total limits */
export function UtilizationChart({ timeline, accounts, granularity }: TimelineChartProps) {
  const cards = accounts.filter((a) => a.type === "credit_card" && (a.creditLimit ?? 0) > 0);
  const totalLimit = cards.reduce((sum, a) => sum + (a.creditLimit ?? 0), 0);
  if (timeline.length === 0 || totalLimit === 0) return null;
  const data = timeline.map((day) => ({
    date: day.date,
    utilization: +(
      (cards.reduce((sum, a) => sum + Math.max(0, day.balances[a._id] ?? 0), 0) / totalLimit) *
      100
    ).toFixed(1),
  }));

  return (
    <ChartCard title="Credit Utilization">
      <ChartContainer config={UTILIZATION_CONFIG} className="h-[240px] w-full">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" tickFormatter={dateTick(granularity)} tick={{ fontSize: 11 }} />
          <YAxis tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11 }} domain={[0, (max: number) => Math.max(100, Math.ceil(max))]} />
          <ChartTooltip content={<ChartTooltipContent labelFormatter={dateLabel(granularity)} />} />
          <Line type="monotone" dataKey="utilization" stroke="var(--color-utilization)" strokeWidth={2} dot={false} />
        </LineChart>
      </ChartContainer>
    </ChartCard>
  );
}

const CASH_FLOW_CONFIG: ChartConfig = {
  income: { label: "Income", color: "var(--chart-2)" },
  expenses: { label: "Expenses", color: "var(--chart-5)" },
};

/** Income vs expenses per calendar month (transfers excluded), whatever the granularity */
export function CashFlowChart({ timeline }: { timeline: ProjectionResult["timeline"] }) {
  const months = new Map<string, { income: number; expenses: number }>();
  for (const day of timeline) {
    for (const t of day.transactions) {
      if (t.type === "transfer" || t.categoryTags.includes("rap_match")) continue;
      const key = t.date.slice(0, 7);
      const m = months.get(key) ?? { income: 0, expenses: 0 };
      if (t.type === "credit") m.income += t.amount;
      else m.expenses += t.amount;
      months.set(key, m);
    }
  }
  if (months.size === 0) return null;
  const data = [...months.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, m]) => ({
      month: `${month}-01`,
      income: centsToDollars(m.income),
      expenses: centsToDollars(m.expenses),
    }));

  return (
    <ChartCard title="Monthly Cash Flow">
      <ChartContainer config={CASH_FLOW_CONFIG} className="h-[300px] w-full">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="month" tickFormatter={fmtMonth} tick={{ fontSize: 11 }} />
          <YAxis tickFormatter={dollarAxis} tick={{ fontSize: 11 }} />
          <ChartTooltip content={<ChartTooltipContent labelFormatter={fmtMonth} />} />
          <ChartLegend content={<ChartLegendContent />} />
          <Bar dataKey="income" fill="var(--color-income)" radius={[3, 3, 0, 0]} />
          <Bar dataKey="expenses" fill="var(--color-expenses)" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ChartContainer>
    </ChartCard>
  );
}
