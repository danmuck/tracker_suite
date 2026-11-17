"use client";

import { useEffect, useState } from "react";
import { addDays, addMonths, differenceInCalendarDays, isSameDay } from "date-fns";
import {
  BarChart3,
  CalendarIcon,
  ChevronLeft,
  ChevronRight,
  FlaskConical,
  RotateCcw,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import {
  projectionSandbox,
  sandboxChangeCount,
  useProjectionSandbox,
} from "@/hooks/finance/use-projection-sandbox";
import { ReportsPanel } from "@/components/finance/reports-panel";
import { InfoTip } from "@/components/finance/info-tip";
import { ProjectionTransactions } from "@/components/finance/projection-transactions";
import { ProjectionSandboxPanel } from "@/components/finance/projection-sandbox-panel";
import { useFinanceProfile } from "@/hooks/finance/use-finance-profile";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid } from "recharts";
import { PageHeader } from "@/components/page-header";
import { LoadingState } from "@/components/loading-state";
import { EmptyState } from "@/components/empty-state";
import { CurrencyDisplay } from "@/components/finance/currency-display";
import { ProjectionAlerts } from "@/components/finance/projection-alerts";
import {
  CashFlowChart,
  DebtBreakdowns,
  NetWorthChart,
  PayoffDates,
  ProjectionInsightCards,
  UpcomingItems,
  UtilizationChart,
} from "@/components/finance/projection-insights";
import { useProjections } from "@/hooks/finance/use-projections";
import { useAccounts } from "@/hooks/finance/use-accounts";
import { centsToDollars } from "@/lib/finance/formatters";
import type { Granularity } from "@/types/finance/projection";

const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

const PRESETS = [
  { label: "1M", months: 1 },
  { label: "3M", months: 3 },
  { label: "6M", months: 6 },
  { label: "1Y", months: 12 },
];

interface ProjectionSettings {
  startDate: Date;
  endDate: Date;
  granularity: Granularity;
  accountId: string;
  view: ProjectionView;
}

const VIEWS = ["overview", "cashflow", "debt", "transactions", "alerts", "sandbox", "reports"] as const;
type ProjectionView = (typeof VIEWS)[number];

const STORAGE_KEY = "finance.projections.settings";

// Survives client-side navigation; sessionStorage covers a full reload
let savedSettings: ProjectionSettings | null = null;

function defaultSettings(): ProjectionSettings {
  const today = new Date();
  return {
    startDate: today,
    endDate: addMonths(today, 3),
    granularity: "daily",
    accountId: "",
    view: "overview",
  };
}

function readStoredSettings(): ProjectionSettings | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const startDate = new Date(parsed.startDate);
    const endDate = new Date(parsed.endDate);
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) return null;
    return {
      startDate,
      endDate,
      granularity: ["daily", "weekly", "monthly"].includes(parsed.granularity)
        ? parsed.granularity
        : "daily",
      accountId: typeof parsed.accountId === "string" ? parsed.accountId : "",
      view: VIEWS.includes(parsed.view) ? parsed.view : "overview",
    };
  } catch {
    return null;
  }
}

interface ChartSeries {
  id: string;
  name: string;
  color: string;
}

function BalanceChart({
  title,
  data,
  series,
  config,
  granularity,
  spansYears,
}: {
  title: string;
  data: Record<string, string | number>[];
  series: ChartSeries[];
  config: ChartConfig;
  granularity: Granularity;
  spansYears: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={config} className="h-[300px] w-full">
          <AreaChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="date"
              tickFormatter={(v) => {
                const d = new Date(v + "T12:00:00.000Z");
                if (granularity === "monthly") return format(d, "MMM yyyy");
                return spansYears ? format(d, "MMM d ''yy") : format(d, "MMM d");
              }}
              tick={{ fontSize: 11 }}
            />
            <YAxis
              tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
              tick={{ fontSize: 11 }}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelFormatter={(label) => {
                    const d = new Date(label + "T12:00:00.000Z");
                    return granularity === "monthly"
                      ? format(d, "MMM yyyy")
                      : format(d, "MMM d, yyyy");
                  }}
                />
              }
            />
            <ChartLegend content={<ChartLegendContent />} />
            {series.map((s) => (
              <Area
                key={s.id}
                type="monotone"
                dataKey={s.id}
                name={s.name}
                stroke={s.color}
                fill={s.color}
                fillOpacity={0.15}
                strokeWidth={2}
              />
            ))}
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

export default function ProjectionsPage() {
  const [settings, setSettings] = useState<ProjectionSettings>(
    () => savedSettings ?? defaultSettings()
  );
  const { startDate, endDate, granularity } = settings;
  const update = (patch: Partial<ProjectionSettings>) =>
    setSettings((s) => ({ ...s, ...patch }));

  // Restore after a full reload (done post-mount to keep hydration consistent)
  useEffect(() => {
    const stored = savedSettings ? null : readStoredSettings();
    // ?view=reports (etc.) opens a specific tab, then is dropped from the URL
    const linked = new URLSearchParams(window.location.search).get("view");
    const view = VIEWS.find((v) => v === linked);
    if (view) window.history.replaceState(null, "", window.location.pathname);
    if (stored || view) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSettings((s) => ({ ...(stored ?? s), ...(view ? { view } : {}) }));
    }
  }, []);

  useEffect(() => {
    savedSettings = settings;
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // storage unavailable; in-memory copy still covers navigation
    }
  }, [settings]);

  const { accounts } = useAccounts();
  // Ignore a remembered account that no longer exists
  const accountId =
    accounts.length > 0 && !accounts.some((a) => a._id === settings.accountId)
      ? ""
      : settings.accountId;

  // Presets measure from the chosen start date; the arrows page by the same span
  const activePreset = PRESETS.find((p) =>
    isSameDay(addMonths(startDate, p.months), endDate)
  );
  const shiftRange = (direction: 1 | -1) => {
    if (activePreset) {
      const newStart = addMonths(startDate, direction * activePreset.months);
      update({
        startDate: newStart,
        endDate: addMonths(newStart, activePreset.months),
      });
    } else {
      const days = Math.max(1, differenceInCalendarDays(endDate, startDate));
      update({
        startDate: addDays(startDate, direction * days),
        endDate: addDays(endDate, direction * days),
      });
    }
  };
  const isFromToday = isSameDay(startDate, new Date());

  const sandbox = useProjectionSandbox();
  const sandboxChanges = sandboxChangeCount(sandbox);
  // Salary and Rent come from the Datasheet, so the sandbox changes them there
  const { profile: realProfile } = useFinanceProfile();
  const lockedIds = new Set(
    [realProfile?.salaryTransactionId, realProfile?.rentTransactionId].filter(
      (id): id is string => !!id
    )
  );
  const { projection, dataVersion, isLoading } = useProjections(
    startDate,
    endDate,
    granularity,
    accountId || undefined,
    sandbox
  );

  // The sandbox belongs to the real data it was made against: once that data
  // changes, drop it so the projection goes back to reality
  useEffect(() => {
    if (!dataVersion || sandboxChanges === 0) return;
    if (sandbox.version === null) {
      projectionSandbox.setVersion(dataVersion);
    } else if (sandbox.version !== dataVersion) {
      projectionSandbox.clear();
      toast.info("Your real data changed, so the sandbox was reset.");
    }
  }, [dataVersion, sandbox.version, sandboxChanges]);

  const filteredAccounts = accountId
    ? accounts.filter((a) => a._id === accountId)
    : accounts;

  const chartConfig: ChartConfig = Object.fromEntries(
    filteredAccounts.map((a, i) => [
      a._id,
      { label: a.name, color: CHART_COLORS[i % CHART_COLORS.length] },
    ])
  );

  // Colors are assigned once so an account keeps its color in every chart
  const chartSeries: ChartSeries[] = filteredAccounts.map((a, i) => ({
    id: a._id,
    name: a.name,
    color: CHART_COLORS[i % CHART_COLORS.length],
  }));
  // Cash, bank and credit cards only (no debt accounts)
  const liquidSeries = chartSeries.filter((_, i) => filteredAccounts[i].type !== "debt");

  const debtAccountIds = new Set(
    accounts
      .filter((a) => a.type === "credit_card" || a.type === "debt")
      .map((a) => a._id)
  );

  const chartData =
    projection?.timeline.map((day) => ({
      date: day.date,
      ...Object.fromEntries(
        filteredAccounts.map((a) => {
          const raw = day.balances[a._id] ?? 0;
          return [a._id, centsToDollars(debtAccountIds.has(a._id) ? -raw : raw)];
        })
      ),
    })) ?? [];

  const summary = projection?.summary;
  // Start and end totals per account type; liabilities count as negative
  const typeTotals = (
    [
      {
        type: "bank",
        label: "Bank & Cash",
        tip: "Combined balance of your bank and cash accounts at the end of the range, and where it started.",
      },
      {
        type: "credit_card",
        label: "Credit Cards",
        tip: "Total owed across your credit cards at the end of the range, shown as a negative, and where it started.",
      },
      {
        type: "debt",
        label: "Debt",
        tip: "Total owed on loans and other debts at the end of the range, shown as a negative, and where it started.",
      },
    ] as const
  )
    .map(({ type, label, tip }) => {
      const ids = filteredAccounts
        .filter((a) => a.type === type && summary?.endBalances[a._id] !== undefined)
        .map((a) => a._id);
      const sign = type === "bank" ? 1 : -1;
      const total = (balances?: Record<string, number>) =>
        ids.reduce((sum, id) => sum + sign * (balances?.[id] ?? 0), 0);
      return {
        type,
        label,
        tip,
        count: ids.length,
        start: total(summary?.startBalances),
        end: total(summary?.endBalances),
      };
    })
    .filter((t) => t.count > 0);
  // Matches how the alerts list groups repeats of the same item
  const alertGroupCount = new Set(
    projection?.alerts.map(
      (a) => `${a.sourceTransactionId ?? a.description}-${a.reason}`
    )
  ).size;
  const spansYears = startDate.getFullYear() !== endDate.getFullYear();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Projections"
        description="Forecast your account balances over time"
      />

      {/* Controls */}
      <div className="flex flex-wrap gap-3 items-center">
        {/* Preset buttons */}
        <div className="flex gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Previous period"
            title={`Back ${activePreset?.label ?? "one range"}`}
            onClick={() => shiftRange(-1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          {PRESETS.map((preset) => (
            <Button
              key={preset.label}
              variant={activePreset === preset ? "default" : "outline"}
              size="sm"
              title={`${preset.label} from the start date`}
              onClick={() =>
                update({ endDate: addMonths(startDate, preset.months) })
              }
            >
              {preset.label}
            </Button>
          ))}
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Next period"
            title={`Forward ${activePreset?.label ?? "one range"}`}
            onClick={() => shiftRange(1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <Button
          variant="outline"
          size="sm"
          disabled={isFromToday}
          onClick={() => {
            const now = new Date();
            const days = Math.max(1, differenceInCalendarDays(endDate, startDate));
            update({
              startDate: now,
              endDate: activePreset
                ? addMonths(now, activePreset.months)
                : addDays(now, days),
            });
          }}
        >
          Today
        </Button>

        {/* Start date */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm">
              <CalendarIcon className="mr-2 h-4 w-4" />
              {format(startDate, "MMM d, yyyy")}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0">
            <Calendar
              mode="single"
              selected={startDate}
              defaultMonth={startDate}
              onSelect={(d) => d && update({ startDate: d })}
              initialFocus
            />
          </PopoverContent>
        </Popover>

        <span className="text-muted-foreground text-sm">to</span>

        {/* End date */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm">
              <CalendarIcon className="mr-2 h-4 w-4" />
              {format(endDate, "MMM d, yyyy")}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0">
            <Calendar
              mode="single"
              selected={endDate}
              defaultMonth={endDate}
              onSelect={(d) => d && update({ endDate: d })}
              initialFocus
            />
          </PopoverContent>
        </Popover>

        {/* Granularity */}
        <Tabs
          value={granularity}
          onValueChange={(v) => update({ granularity: v as Granularity })}
        >
          <TabsList>
            <TabsTrigger value="daily">Daily</TabsTrigger>
            <TabsTrigger value="weekly">Weekly</TabsTrigger>
            <TabsTrigger value="monthly">Monthly</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Account filter */}
        <Select
          value={accountId}
          onValueChange={(v) => update({ accountId: v === "_all" ? "" : v })}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="All accounts" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">All accounts</SelectItem>
            {accounts.map((a) => (
              <SelectItem key={a._id} value={a._id}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <LoadingState variant="chart" />
      ) : !projection ? (
        <EmptyState
          icon={TrendingUp}
          title="No projection data"
          description="Add recurring transactions to see balance projections."
        />
      ) : (
        <>
          {sandboxChanges > 0 && (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-primary/40 bg-primary/5 px-4 py-3">
              <FlaskConical className="h-4 w-4 shrink-0 text-primary" />
              <div className="min-w-0 flex-1 text-sm">
                <span className="font-medium">Sandbox</span>
                <span className="text-muted-foreground">
                  {" "}
                  — {sandboxChanges} what-if {sandboxChanges === 1 ? "change" : "changes"} applied
                  below. Your real transactions are untouched.
                </span>
              </div>
              <Button size="sm" onClick={() => update({ view: "sandbox" })}>
                Review &amp; apply
              </Button>
              <Button variant="outline" size="sm" onClick={() => projectionSandbox.clear()}>
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                Reset to real data
              </Button>
            </div>
          )}

          {/* Summary cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <Card>
              <CardHeader className="pb-1">
                <CardTitle className="flex items-center gap-1.5 text-xs text-muted-foreground font-normal">
                  Start Balance
                  <InfoTip label="Start Balance">
                    Everything you hold minus everything you owe on the first day of the range.
                  </InfoTip>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <CurrencyDisplay
                  cents={Object.entries(summary!.startBalances).reduce(
                    (total, [id, bal]) =>
                      total + (debtAccountIds.has(id) ? -bal : bal),
                    0
                  )}
                  className="text-lg font-bold"
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-1">
                <CardTitle className="flex items-center gap-1.5 text-xs text-muted-foreground font-normal">
                  End Balance
                  <InfoTip label="End Balance">
                    Everything you hold minus everything you owe on the last day of the range.
                  </InfoTip>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <CurrencyDisplay
                  cents={Object.entries(summary!.endBalances).reduce(
                    (total, [id, bal]) =>
                      total + (debtAccountIds.has(id) ? -bal : bal),
                    0
                  )}
                  className="text-lg font-bold"
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-1">
                <CardTitle className="flex items-center gap-1.5 text-xs text-muted-foreground font-normal">
                  Total Income
                  <InfoTip label="Total Income">
                    Money coming in during the range. Transfers between your own accounts are not counted.
                  </InfoTip>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <CurrencyDisplay
                  cents={summary!.totalIncome}
                  colored
                  className="text-lg font-bold"
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-1">
                <CardTitle className="flex items-center gap-1.5 text-xs text-muted-foreground font-normal">
                  Total Expenses
                  <InfoTip label="Total Expenses">
                    Spending and projected interest during the range. Transfers and card payments are not
                    counted. Loan payments are listed underneath: they lower what you owe, so they are kept out
                    of Net Change, and Total out adds them with loan interest counted once.
                  </InfoTip>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <CurrencyDisplay
                  cents={-summary!.totalExpenses}
                  colored
                  className="text-lg font-bold"
                />
                {summary!.loanPayments > 0 && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    + {formatCurrency(summary!.loanPayments)} loan payments · {formatCurrency(summary!.totalOut)}{" "}
                    total out
                  </p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-1">
                <CardTitle className="flex items-center gap-1.5 text-xs text-muted-foreground font-normal">
                  Net Change
                  <InfoTip label="Net Change">
                    Total income minus total expenses for the range.
                  </InfoTip>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <CurrencyDisplay
                  cents={summary!.netChange}
                  colored
                  className="text-lg font-bold"
                />
              </CardContent>
            </Card>
          </div>

          {/* Balance totals by account type, start → end of the range */}
          <div className="grid gap-4 sm:grid-cols-3">
            {typeTotals.map((t) => (
              <Card key={t.type}>
                <CardHeader className="pb-1">
                  <CardTitle className="flex items-center gap-1.5 text-xs text-muted-foreground font-normal">
                    <span>
                      {t.label}
                      <span className="ml-1 opacity-70">
                        ({t.count} {t.count === 1 ? "account" : "accounts"})
                      </span>
                    </span>
                    <InfoTip label={t.label}>{t.tip}</InfoTip>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <CurrencyDisplay
                    cents={t.end}
                    colored
                    className="text-lg font-bold"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    from <CurrencyDisplay cents={t.start} /> at start
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Everything below the headline totals is grouped by topic */}
          <Tabs
            value={settings.view}
            onValueChange={(v) => update({ view: v as ProjectionView })}
            className="gap-6"
          >
            <TabsList variant="line" className="w-full justify-start border-b">
              <TabsTrigger value="overview" className="flex-none">Overview</TabsTrigger>
              <TabsTrigger value="cashflow" className="flex-none">Cash Flow</TabsTrigger>
              <TabsTrigger value="debt" className="flex-none">Debt</TabsTrigger>
              <TabsTrigger value="transactions" className="flex-none">Transactions</TabsTrigger>
              <TabsTrigger value="alerts" className="flex-none">
                Alerts
                {projection.alerts.length > 0 && (
                  <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-[10px]">
                    {alertGroupCount}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="sandbox" className="flex-none">
                <FlaskConical className="h-4 w-4" />
                Sandbox
                {sandboxChanges > 0 && (
                  <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-[10px]">
                    {sandboxChanges}
                  </Badge>
                )}
              </TabsTrigger>
              {/* Reports look back at recorded activity, so they sit apart from the forecast tabs */}
              <TabsTrigger value="reports" className="ml-auto flex-none">
                <BarChart3 className="h-4 w-4" />
                Reports
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-6">
              <ProjectionInsightCards
                summary={summary!}
                alerts={projection.alerts}
                accounts={filteredAccounts}
                rangeDays={Math.max(1, differenceInCalendarDays(endDate, startDate))}
              />
              <DebtBreakdowns timeline={projection.timeline} summary={summary!} accounts={accounts} />
              {chartData.length > 0 && chartSeries.length > 0 ? (
                <BalanceChart
                  title="Balance Over Time"
                  data={chartData}
                  series={chartSeries}
                  config={chartConfig}
                  granularity={granularity}
                  spansYears={spansYears}
                />
              ) : null}
              <NetWorthChart timeline={projection.timeline} accounts={filteredAccounts} granularity={granularity} />
            </TabsContent>

            <TabsContent value="cashflow" className="space-y-6">
              {chartData.length > 0 && liquidSeries.length > 0 ? (
                <BalanceChart
                  title="Balance Over Time (excluding debt)"
                  data={chartData}
                  series={liquidSeries}
                  config={chartConfig}
                  granularity={granularity}
                  spansYears={spansYears}
                />
              ) : null}
              <CashFlowChart timeline={projection.timeline} />
              <UpcomingItems timeline={projection.timeline} accounts={accounts} />
            </TabsContent>

            <TabsContent value="debt" className="space-y-6">
              <PayoffDates payoffDates={summary!.payoffDates} accounts={filteredAccounts} />
              <UtilizationChart timeline={projection.timeline} accounts={filteredAccounts} granularity={granularity} />
            </TabsContent>

            <TabsContent value="transactions">
              <ProjectionTransactions
                timeline={projection.timeline}
                accounts={accounts}
                sandbox={sandbox}
                lockedIds={lockedIds}
              />
            </TabsContent>

            <TabsContent value="alerts" className="space-y-6">
              {projection.alerts.length > 0 ? (
                <ProjectionAlerts
                  alerts={projection.alerts}
                  accounts={accounts}
                  initialLimit={20}
                />
              ) : (
                <EmptyState
                  icon={TrendingUp}
                  title="No alerts"
                  description="Nothing in this range is stopped, reduced or paid off."
                />
              )}
            </TabsContent>

            <TabsContent value="sandbox">
              <ProjectionSandboxPanel sandbox={sandbox} />
            </TabsContent>

            <TabsContent value="reports">
              <ReportsPanel accountId={accountId || undefined} />
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
