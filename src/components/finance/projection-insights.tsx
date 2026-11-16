"use client";

import { format } from "date-fns";
import { ArrowRightLeft } from "lucide-react";
import { InfoTip } from "@/components/finance/info-tip";
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
import { centsToDollars, formatCurrency } from "@/lib/finance/formatters";
import { isLiability } from "@/lib/finance/account-utils";
import type { Account } from "@/types/finance/account";
import type { Granularity, ProjectionResult } from "@/types/finance/projection";

/** Calendar-date string (yyyy-MM-dd) → Date that formats to the same day in any timezone */
const toDate = (dateStr: string) => new Date(dateStr.slice(0, 10) + "T12:00:00.000Z");
const fmtDay = (dateStr: string) => format(toDate(dateStr), "MMM d, yyyy");
const fmtMonth = (dateStr: string) => format(toDate(dateStr), "MMM yyyy");
const dollarAxis = (v: number) => `$${(v / 1000).toFixed(0)}k`;

function StatCard({
  title,
  tip,
  children,
  hint,
}: {
  title: string;
  /** One-line explanation shown from the info icon */
  tip?: string;
  children: React.ReactNode;
  hint?: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-1">
        <CardTitle className="flex items-center gap-1.5 text-xs text-muted-foreground font-normal">
          {title}
          {tip && (
            <InfoTip label={title}>{tip}</InfoTip>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-lg font-bold">{children}</div>
        {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
      </CardContent>
    </Card>
  );
}

const GOOD = "text-green-600 dark:text-green-500";
const BAD = "text-red-600 dark:text-loss";

/** Headline figures for the range, each with a short explanation on its info icon */
export function ProjectionInsightCards({
  summary,
  alerts,
  accounts,
  rangeDays,
}: {
  summary: ProjectionResult["summary"];
  alerts: ProjectionResult["alerts"];
  accounts: Account[];
  /** Length of the projection range in days */
  rangeDays: number;
}) {
  const { lowestCash, totalIncome, totalExpenses, netChange, interestCharged, debtPayments } = summary;
  const savingsRate = totalIncome > 0 ? (netChange / totalIncome) * 100 : null;
  const otherSpending = totalExpenses - interestCharged;
  const months = rangeDays / 30.44;
  const monthlyNet = months >= 1 ? Math.round(netChange / months) : null;

  // Total owed on cards and loans, start vs end of the range
  const owed = (balances: Record<string, number>) =>
    accounts.filter(isLiability).reduce((sum, a) => sum + (balances[a._id] ?? 0), 0);
  const debtPaidDown = owed(summary.startBalances) - owed(summary.endBalances);

  // Money the projection could not move because a card or bank account ran out
  const limited = alerts.filter((a) => a.reason !== "debt_paid_off");
  const shortfall = limited.reduce((sum, a) => sum + (a.originalAmount - a.adjustedAmount), 0);

  const payoffs = Object.entries(summary.payoffDates);
  const cleared = payoffs
    .filter((e): e is [string, string] => e[1] !== null)
    .sort((a, b) => a[1].localeCompare(b[1]));
  const nextCleared = cleared[0];
  const nextName = nextCleared ? accounts.find((a) => a._id === nextCleared[0])?.name : undefined;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        title="Lowest Cash Balance"
        tip="The smallest combined bank and cash balance on any day in this range."
        hint={lowestCash ? `on ${fmtDay(lowestCash.date)}` : "No bank accounts in view"}
      >
        {lowestCash ? <CurrencyDisplay cents={lowestCash.amount} colored /> : "—"}
      </StatCard>
      <StatCard
        title="Savings Rate"
        tip="Net change divided by income. Transfers and debt payments are not counted as spending."
        hint="Net change as a share of income"
      >
        {savingsRate === null ? "—" : <span className={savingsRate < 0 ? BAD : GOOD}>{savingsRate.toFixed(1)}%</span>}
      </StatCard>
      <StatCard
        title="Average Monthly Net"
        tip="Income minus expenses, averaged per month across the range."
        hint={monthlyNet === null ? "Needs a range of a month or more" : `over ${months.toFixed(1)} months`}
      >
        {monthlyNet === null ? "—" : <CurrencyDisplay cents={monthlyNet} colored />}
      </StatCard>
      <StatCard
        title="Cut by Limits"
        tip="Spending and payments left out because a card was at its limit or a bank account was empty."
        hint={limited.length === 0 ? "Everything fits" : `${limited.length} ${limited.length === 1 ? "item" : "items"} stopped or reduced`}
      >
        {shortfall === 0 ? <span className={GOOD}>$0.00</span> : <CurrencyDisplay cents={-shortfall} colored />}
      </StatCard>
      <StatCard
        title="Debt Payments"
        tip="Money moved into cards and loans in this range, including payments already made."
        hint={
          <>
            vs <CurrencyDisplay cents={otherSpending} /> other spending
          </>
        }
      >
        <CurrencyDisplay cents={debtPayments} />
      </StatCard>
      <StatCard
        title="Interest Charged"
        tip="Interest added to cards and loans at each month end, from each account's APR."
        hint={interestCharged === 0 ? "Set an APR on cards and debt to project interest" : "Projected, at month end"}
      >
        <CurrencyDisplay cents={interestCharged} />
      </StatCard>
      <StatCard
        title="Debt Paid Down"
        tip="How far total card and loan balances fall from the start to the end of the range. Negative means debt grew."
        hint="Payments minus new charges and interest"
      >
        <CurrencyDisplay cents={debtPaidDown} colored />
      </StatCard>
      <StatCard
        title="Next Debt-Free"
        tip="The first card or loan to reach a zero balance in this range."
        hint={
          payoffs.length === 0
            ? "No debts owing at the start"
            : `${cleared.length} of ${payoffs.length} cleared in range`
        }
      >
        {nextCleared ? (
          <span className={GOOD}>
            {nextName ?? "Account"} · {format(toDate(nextCleared[1]), "MMM d")}
          </span>
        ) : (
          "—"
        )}
      </StatCard>
    </div>
  );
}

interface BreakdownRow {
  id: string;
  name: string;
  amount: number;
  /** Bar fill and percentage (0-100); defaults to this row's share of the total */
  percent?: number;
  /** Small line under the row, e.g. the credit limit or the starting balance */
  note?: string;
  /** Paid off by the end of the range: the row's text is crossed out */
  paidOff?: boolean;
  /** Shown after the name, not crossed out (e.g. the date the account closes) */
  suffix?: string;
}

function BreakdownCard({
  title,
  tip,
  rows,
  empty,
  barClass,
}: {
  title: string;
  tip: string;
  rows: BreakdownRow[];
  empty: string;
  barClass: string;
}) {
  const total = rows.reduce((sum, r) => sum + r.amount, 0);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          {title}
          <InfoTip label={title}>{tip}</InfoTip>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{empty}</p>
        ) : (
          <div className="space-y-3">
            {rows.map((r) => {
              const share = Math.min(100, Math.max(0, r.percent ?? (total > 0 ? (r.amount / total) * 100 : 0)));
              // Struck per element so the closing date after the name stays readable
              const strike = r.paidOff ? " line-through" : "";
              return (
                <div key={r.id} className={r.paidOff ? "space-y-1 text-muted-foreground" : "space-y-1"}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="flex min-w-0 items-baseline gap-2">
                      <span className={`truncate font-medium${strike}`}>{r.name}</span>
                      {r.suffix && (
                        <span className="shrink-0 text-xs text-green-600 dark:text-green-500">
                          {r.suffix}
                        </span>
                      )}
                    </span>
                    <span className={`shrink-0 font-mono${strike}`}>
                      <CurrencyDisplay cents={r.amount} />
                      <span className="ml-2 text-xs text-muted-foreground">{share.toFixed(0)}%</span>
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className={`h-full rounded-full ${barClass}`} style={{ width: `${share}%` }} />
                  </div>
                  {r.note && <p className={`text-xs text-muted-foreground${strike}`}>{r.note}</p>}
                </div>
              );
            })}
            <div className="flex items-baseline justify-between border-t pt-2 text-sm">
              <span className="text-muted-foreground">Total</span>
              <span className="font-mono font-medium">
                <CurrencyDisplay cents={total} />
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Debt payments and interest for the range, split by the card or loan they belong to */
export function DebtBreakdowns({
  timeline,
  summary,
  accounts,
}: {
  timeline: ProjectionResult["timeline"];
  summary: ProjectionResult["summary"];
  accounts: Account[];
}) {
  const liabilities = new Map(accounts.filter(isLiability).map((a) => [a._id, a.name]));
  // Cards stay open at a zero balance, so only loans and other debts count as paid off
  const debtIds = new Set(accounts.filter((a) => a.type === "debt").map((a) => a._id));
  const paid: Record<string, number> = {};
  const interest: Record<string, number> = {};
  for (const day of timeline) {
    for (const t of day.transactions) {
      if (t.categoryTags.includes("interest")) {
        interest[t.accountId] = (interest[t.accountId] ?? 0) + t.amount;
      } else if (t.type === "transfer" && t.toAccountId && liabilities.has(t.toAccountId)) {
        paid[t.toAccountId] = (paid[t.toAccountId] ?? 0) + t.amount;
      } else if (t.type === "credit" && liabilities.has(t.accountId) && !t.categoryTags.includes("rap_match")) {
        paid[t.accountId] = (paid[t.accountId] ?? 0) + t.amount;
      }
    }
  }
  /** Owed something at the start and nothing at the end of the range */
  const paidOff = (id: string) =>
    debtIds.has(id) && (summary.startBalances[id] ?? 0) > 0 && (summary.endBalances[id] ?? 0) <= 0;
  const rows = (totals: Record<string, number>, strike = false): BreakdownRow[] =>
    Object.entries(totals)
      .filter(([id, amount]) => amount > 0 && liabilities.has(id))
      .map(([id, amount]) => ({ id, name: liabilities.get(id)!, amount, paidOff: strike && paidOff(id) }))
      .sort((a, b) => b.amount - a.amount);

  // Balance owed at the end of the range: cards against their limit, loans against where they started
  const balances: BreakdownRow[] = accounts
    .filter(isLiability)
    .map((a) => {
      const start = Math.max(0, summary.startBalances[a._id] ?? 0);
      const end = Math.max(0, summary.endBalances[a._id] ?? 0);
      const closed = paidOff(a._id) ? summary.payoffDates[a._id] : null;
      const suffix = closed ? `closed ${fmtDay(closed)}` : undefined;
      const from = start !== end ? ` · from ${formatCurrency(start)}` : "";
      if (a.type === "credit_card" && a.creditLimit) {
        return {
          id: a._id,
          name: a.name,
          amount: end,
          paidOff: paidOff(a._id),
          suffix,
          percent: (end / a.creditLimit) * 100,
          note: `of ${formatCurrency(a.creditLimit)} limit used${from}`,
        };
      }
      return {
        id: a._id,
        name: a.name,
        amount: end,
        paidOff: paidOff(a._id),
          suffix,
        percent: start > 0 ? (end / start) * 100 : end > 0 ? 100 : 0,
        note: start > 0 ? `of ${formatCurrency(start)} at the start still owed` : "new in this range",
      };
    })
    .filter((r) => r.amount > 0 || (summary.startBalances[r.id] ?? 0) > 0)
    // Same order as the payments card (most paid first) so rows line up; unpaid accounts follow by balance
    .sort((a, b) => (paid[b.id] ?? 0) - (paid[a.id] ?? 0) || b.amount - a.amount);

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <BreakdownCard
        title="Debt Payments by Account"
        tip="How much goes toward each card and loan in this range, and its share of all debt payments."
        rows={rows(paid, true)}
        empty="No payments toward cards or loans in this range."
        barClass="bg-primary"
      />
      <BreakdownCard
        title="Debt Balances by Account"
        tip="What each card and loan owes at the end of this range. Cards show how much of the limit is used; loans show how much of the starting balance is left."
        rows={balances}
        empty="No card or loan balances in this range."
        barClass="bg-amber-500 dark:bg-amber-400"
      />
      <BreakdownCard
        title="Interest Charged by Account"
        tip="Projected interest on each card and loan in this range, and its share of all interest."
        rows={rows(interest)}
        empty="No interest projected. Set an APR on a card or loan to see it here."
        barClass="bg-red-500 dark:bg-loss"
      />
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
                  <span className="shrink-0 font-medium text-green-600 dark:text-green-500">{fmtDay(date)}</span>
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
