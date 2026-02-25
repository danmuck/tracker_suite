"use client";

import { useState } from "react";
import {
  addWeeks,
  addMonths,
  addYears,
  subWeeks,
  subMonths,
  subYears,
  format,
} from "date-fns";
import { ChevronLeft, ChevronRight, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { PageHeader } from "@/components/page-header";
import { LoadingState } from "@/components/loading-state";
import { EmptyState } from "@/components/empty-state";
import { CurrencyDisplay } from "@/components/currency-display";
import { useSummary } from "@/hooks/use-summary";
import { useAccounts } from "@/hooks/use-accounts";
import { useCategories } from "@/hooks/use-categories";
import { formatCurrency, centsToDollars, formatDateShort } from "@/lib/formatters";
import type { SummaryView } from "@/types/summary";

function getPeriodLabel(view: SummaryView, date: Date): string {
  if (view === "weekly") return `Week of ${format(date, "MMM d, yyyy")}`;
  if (view === "monthly") return format(date, "MMMM yyyy");
  return format(date, "yyyy");
}

function navigate(view: SummaryView, date: Date, dir: -1 | 1): Date {
  if (view === "weekly") return dir === 1 ? addWeeks(date, 1) : subWeeks(date, 1);
  if (view === "monthly") return dir === 1 ? addMonths(date, 1) : subMonths(date, 1);
  return dir === 1 ? addYears(date, 1) : subYears(date, 1);
}

const barChartConfig: ChartConfig = {
  income: { label: "Income", color: "var(--chart-2)" },
  expenses: { label: "Expenses", color: "var(--chart-1)" },
};

export default function ReportsPage() {
  const [view, setView] = useState<SummaryView>("monthly");
  const [date, setDate] = useState(new Date());
  const [accountId, setAccountId] = useState("");

  const { summary, isLoading } = useSummary(
    view,
    date,
    accountId || undefined
  );
  const { accounts } = useAccounts();
  const { categories } = useCategories();

  const categoryColorMap = Object.fromEntries(
    categories.map((c) => [c.name.toLowerCase(), c.color])
  );

  const barData =
    view === "annual"
      ? (summary?.months ?? []).map((m) => ({
          label: m.label,
          income: centsToDollars(m.totalCredits),
          expenses: centsToDollars(m.totalDebits),
        }))
      : (summary?.days ?? []).map((d) => ({
          label: formatDateShort(d.date),
          income: centsToDollars(d.totalCredits),
          expenses: centsToDollars(d.totalDebits),
        }));

  const pieData = (summary?.categoryBreakdown ?? []).map((cb) => ({
    name: cb.category,
    value: centsToDollars(cb.amount),
    percentage: cb.percentage,
    color: categoryColorMap[cb.category.toLowerCase()] ?? "#94a3b8",
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        description="Analyze your income and expenses over time"
      />

      {/* Controls */}
      <div className="flex flex-wrap gap-3 items-center">
        {/* View toggle */}
        <Tabs value={view} onValueChange={(v) => setView(v as SummaryView)}>
          <TabsList>
            <TabsTrigger value="weekly">Weekly</TabsTrigger>
            <TabsTrigger value="monthly">Monthly</TabsTrigger>
            <TabsTrigger value="annual">Annual</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Date navigator */}
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => setDate((d) => navigate(view, d, -1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium min-w-[160px] text-center">
            {getPeriodLabel(view, date)}
          </span>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => setDate((d) => navigate(view, d, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

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
      ) : !summary ? (
        <EmptyState
          icon={BarChart3}
          title="No report data"
          description="Add transactions to see reports for this period."
        />
      ) : (
        <>
          {/* Totals */}
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardHeader className="pb-1">
                <CardTitle className="text-xs text-muted-foreground font-normal">
                  Income
                </CardTitle>
              </CardHeader>
              <CardContent>
                <CurrencyDisplay
                  cents={summary.totals.income}
                  colored
                  className="text-xl font-bold"
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-1">
                <CardTitle className="text-xs text-muted-foreground font-normal">
                  Expenses
                </CardTitle>
              </CardHeader>
              <CardContent>
                <CurrencyDisplay
                  cents={-summary.totals.expenses}
                  colored
                  className="text-xl font-bold"
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-1">
                <CardTitle className="text-xs text-muted-foreground font-normal">
                  Net
                </CardTitle>
              </CardHeader>
              <CardContent>
                <CurrencyDisplay
                  cents={summary.totals.net}
                  colored
                  className="text-xl font-bold"
                />
              </CardContent>
            </Card>
          </div>

          {/* Chart tabs */}
          <Tabs defaultValue="breakdown">
            <TabsList>
              <TabsTrigger value="breakdown">Category Breakdown</TabsTrigger>
              <TabsTrigger value="income-expense">Income vs Expense</TabsTrigger>
            </TabsList>

            <TabsContent value="breakdown" className="mt-4">
              <div className="grid gap-6 lg:grid-cols-2">
                {/* Pie chart */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Expense by Category</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {pieData.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-8">
                        No expense data for this period
                      </p>
                    ) : (
                      <ChartContainer
                        config={Object.fromEntries(
                          pieData.map((p) => [
                            p.name,
                            { label: p.name, color: p.color },
                          ])
                        )}
                        className="h-[220px]"
                      >
                        <PieChart>
                          <ChartTooltip
                            content={
                              <ChartTooltipContent
                                formatter={(value) =>
                                  formatCurrency(Number(value) * 100)
                                }
                              />
                            }
                          />
                          <Pie
                            data={pieData}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            outerRadius={90}
                          >
                            {pieData.map((entry, i) => (
                              <Cell key={i} fill={entry.color} />
                            ))}
                          </Pie>
                        </PieChart>
                      </ChartContainer>
                    )}
                  </CardContent>
                </Card>

                {/* Category table */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Details</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {pieData.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-8">
                        No data
                      </p>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Category</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                            <TableHead className="text-right">%</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {pieData.map((row) => (
                            <TableRow key={row.name}>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <div
                                    className="h-2.5 w-2.5 rounded-full shrink-0"
                                    style={{ backgroundColor: row.color }}
                                  />
                                  <span className="capitalize text-sm">
                                    {row.name}
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell className="text-right font-mono text-sm">
                                {formatCurrency(row.value * 100)}
                              </TableCell>
                              <TableCell className="text-right text-sm text-muted-foreground">
                                <div className="flex items-center justify-end gap-2">
                                  <div className="h-1.5 w-16 rounded-full bg-muted overflow-hidden">
                                    <div
                                      className="h-full rounded-full"
                                      style={{
                                        width: `${row.percentage}%`,
                                        backgroundColor: row.color,
                                      }}
                                    />
                                  </div>
                                  {row.percentage.toFixed(1)}%
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="income-expense" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Income vs Expenses</CardTitle>
                </CardHeader>
                <CardContent>
                  {barData.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      No data for this period
                    </p>
                  ) : (
                    <ChartContainer config={barChartConfig} className="h-[280px] w-full">
                      <BarChart data={barData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                        <YAxis
                          tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                          tick={{ fontSize: 11 }}
                        />
                        <ChartTooltip
                          content={
                            <ChartTooltipContent
                              formatter={(value) =>
                                formatCurrency(Number(value) * 100)
                              }
                            />
                          }
                        />
                        <Bar
                          dataKey="income"
                          fill="var(--chart-2)"
                          radius={[3, 3, 0, 0]}
                        />
                        <Bar
                          dataKey="expenses"
                          fill="var(--chart-1)"
                          radius={[3, 3, 0, 0]}
                        />
                      </BarChart>
                    </ChartContainer>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
