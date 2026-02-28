"use client";

import { useState } from "react";
import { addMonths, addYears } from "date-fns";
import { CalendarIcon, TrendingUp } from "lucide-react";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

export default function ProjectionsPage() {
  const today = new Date();
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(addMonths(today, 3));
  const [granularity, setGranularity] = useState<Granularity>("monthly");
  const [accountId, setAccountId] = useState("");

  const { accounts } = useAccounts();
  const { projection, isLoading } = useProjections(
    startDate,
    endDate,
    granularity,
    accountId || undefined
  );

  const filteredAccounts = accountId
    ? accounts.filter((a) => a._id === accountId)
    : accounts;

  const chartConfig: ChartConfig = Object.fromEntries(
    filteredAccounts.map((a, i) => [
      a._id,
      { label: a.name, color: CHART_COLORS[i % CHART_COLORS.length] },
    ])
  );

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
          {PRESETS.map((preset) => (
            <Button
              key={preset.label}
              variant="outline"
              size="sm"
              onClick={() => {
                setStartDate(today);
                setEndDate(addMonths(today, preset.months));
              }}
            >
              {preset.label}
            </Button>
          ))}
        </div>

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
              onSelect={(d) => d && setStartDate(d)}
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
              onSelect={(d) => d && setEndDate(d)}
              initialFocus
            />
          </PopoverContent>
        </Popover>

        {/* Granularity */}
        <Tabs
          value={granularity}
          onValueChange={(v) => setGranularity(v as Granularity)}
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
          onValueChange={(v) => setAccountId(v === "_all" ? "" : v)}
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
          {/* Summary cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <Card>
              <CardHeader className="pb-1">
                <CardTitle className="text-xs text-muted-foreground font-normal">
                  Start Balance
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
                <CardTitle className="text-xs text-muted-foreground font-normal">
                  End Balance
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
                <CardTitle className="text-xs text-muted-foreground font-normal">
                  Total Income
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
                <CardTitle className="text-xs text-muted-foreground font-normal">
                  Total Expenses
                </CardTitle>
              </CardHeader>
              <CardContent>
                <CurrencyDisplay
                  cents={-summary!.totalExpenses}
                  colored
                  className="text-lg font-bold"
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-1">
                <CardTitle className="text-xs text-muted-foreground font-normal">
                  Net Change
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

          {/* Balance constraint alerts */}
          {projection.alerts.length > 0 && (
            <ProjectionAlerts
              alerts={projection.alerts}
              accounts={accounts}
            />
          )}

          {/* Area chart */}
          {chartData.length > 0 && filteredAccounts.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Balance Over Time</CardTitle>
              </CardHeader>
              <CardContent>
                <ChartContainer config={chartConfig} className="h-[300px] w-full">
                  <AreaChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(v) => {
                        const d = new Date(v + "T12:00:00.000Z");
                        return granularity === "monthly"
                          ? format(d, "MMM yyyy")
                          : format(d, "MMM d");
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
                    {filteredAccounts.map((account, i) => (
                      <Area
                        key={account._id}
                        type="monotone"
                        dataKey={account._id}
                        name={account.name}
                        stroke={CHART_COLORS[i % CHART_COLORS.length]}
                        fill={CHART_COLORS[i % CHART_COLORS.length]}
                        fillOpacity={0.15}
                        strokeWidth={2}
                      />
                    ))}
                  </AreaChart>
                </ChartContainer>
              </CardContent>
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}
