"use client";

import { useMemo } from "react";
import Link from "next/link";
import { format, addDays, endOfDay } from "date-fns";
import { ArrowRight, TrendingUp, TrendingDown, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ChartContainer,
  type ChartConfig,
} from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { LoadingState } from "@/components/loading-state";
import { EmptyState } from "@/components/empty-state";
import { CurrencyDisplay } from "@/components/currency-display";
import { CategoryBadge } from "@/components/category-badge";
import { ProjectionAlerts } from "@/components/projection-alerts";
import { useAccounts } from "@/hooks/use-accounts";
import { useTransactions } from "@/hooks/use-transactions";
import { useSummary } from "@/hooks/use-summary";
import { useProjections } from "@/hooks/use-projections";
import { useCategories } from "@/hooks/use-categories";
import { centsToDollars, formatDateShort } from "@/lib/formatters";
import { cn } from "@/lib/utils";

const summaryChartConfig: ChartConfig = {
  income: { label: "Income", color: "var(--chart-2)" },
  expenses: { label: "Expenses", color: "var(--chart-1)" },
};

export default function DashboardPage() {
  const { accounts, isLoading: accountsLoading } = useAccounts();
  const todayEnd = useMemo(() => endOfDay(new Date()).toISOString(), []);
  const { transactions, isLoading: txLoading } = useTransactions({
    limit: 10,
    sort: "date",
    order: "desc",
    endDate: todayEnd,
  });
  const { categories } = useCategories();
  const { summary, isLoading: summaryLoading } = useSummary(
    "monthly",
    new Date()
  );
  const today = new Date();
  const { projection } = useProjections(today, addDays(today, 30), "daily");

  // Net worth: bank balances minus credit card balances and debt
  const netWorth = accounts.reduce((total, account) => {
    if (account.type === "bank") return total + account.balance;
    return total - account.balance;
  }, 0);

  const bankAccounts = accounts.filter((a) => a.type === "bank");
  const creditAccounts = accounts.filter((a) => a.type === "credit_card");
  const debtAccounts = accounts.filter((a) => a.type === "debt");

  // Sort accounts in order: banks -> credit -> debts
  const sortedAccounts = [...bankAccounts, ...creditAccounts, ...debtAccounts];

  const totalCreditBalance = creditAccounts.reduce((s, a) => s + a.balance, 0);
  const totalCreditLimit = creditAccounts.reduce((s, a) => s + (a.creditLimit ?? 0), 0);
  const totalCreditUtilization =
    totalCreditLimit > 0 ? (totalCreditBalance / totalCreditLimit) * 100 : null;

  const summaryBarData =
    summary?.months?.map((m) => ({
      label: m.label,
      income: centsToDollars(m.totalCredits),
      expenses: centsToDollars(m.totalDebits),
    })) ??
    summary?.days?.slice(-14).map((d) => ({
      label: formatDateShort(d.date),
      income: centsToDollars(d.totalCredits),
      expenses: centsToDollars(d.totalDebits),
    })) ??
    [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground text-sm">
          {format(new Date(), "EEEE, MMMM d, yyyy")}
        </p>
      </div>

      {/* Net worth banner */}
      <Card className="bg-primary text-primary-foreground dark:bg-muted dark:text-foreground">
        <CardContent className="pt-6">
          <p className="text-sm opacity-80">Net Worth</p>
          <p className={cn("text-3xl font-bold mt-1", netWorth < 0 && "text-red-300")}>
            {accountsLoading ? "..." : (
              new Intl.NumberFormat("en-US", {
                style: "currency",
                currency: "USD",
              }).format(netWorth / 100)
            )}
          </p>
          <div className="mt-3 flex gap-4 text-sm opacity-80">
            <span>
              Assets:{" "}
              {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
                bankAccounts.reduce((s, a) => s + a.balance, 0) / 100
              )}
            </span>
            <span>
              Liabilities:{" "}
              {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
                [...creditAccounts, ...debtAccounts].reduce(
                  (s, a) => s + a.balance,
                  0
                ) / 100
              )}
            </span>
          </div>
        </CardContent>
      </Card>

      {creditAccounts.length > 0 && totalCreditLimit > 0 && (
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex justify-between items-center mb-2">
              <p className="text-sm font-medium">Credit Cards</p>
              <p className="text-sm text-muted-foreground">
                <CurrencyDisplay cents={totalCreditBalance} /> of{" "}
                <CurrencyDisplay cents={totalCreditLimit} /> limit
              </p>
            </div>
            {totalCreditUtilization !== null && (
              <div className="space-y-1">
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full",
                      totalCreditUtilization >= 100 ? "bg-red-500" : "bg-blue-500"
                    )}
                    style={{ width: `${Math.min(totalCreditUtilization, 100)}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {totalCreditUtilization.toFixed(0)}% of total credit limit used across {creditAccounts.length} card{creditAccounts.length !== 1 ? "s" : ""}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Projection alerts (next 30 days) */}
      {projection?.alerts && projection.alerts.length > 0 && (
        <ProjectionAlerts
          alerts={projection.alerts}
          accounts={accounts}
          compact
        />
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Accounts section */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Accounts</h2>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/accounts">
                View all <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>

          {accountsLoading ? (
            <LoadingState variant="cards" />
          ) : accounts.length === 0 ? (
            <EmptyState
              icon={Wallet}
              title="No accounts yet"
              description="Add your first account to get started."
              action={{ label: "Add Account", onClick: () => {} }}
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {sortedAccounts.map((account) => {
                const utilization =
                  account.type === "credit_card" && account.creditLimit
                    ? (account.balance / account.creditLimit) * 100
                    : null;
                return (
                  <Card key={account._id}>
                    <CardContent className="pt-4 pb-4">
                      <div className="flex justify-between items-start mb-1">
                        <div>
                          <p className="font-medium text-sm">{account.name}</p>
                          <Badge variant="secondary" className="text-xs mt-0.5">
                            {account.type.replace("_", " ")}
                          </Badge>
                        </div>
                        <CurrencyDisplay
                          cents={account.balance}
                          currency={account.currency}
                          accountType={account.type}
                          creditLimit={account.creditLimit}
                          className="font-bold"
                        />
                      </div>
                      {utilization !== null && (
                        <div className="mt-2 space-y-1">
                          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                            <div
                              className={cn(
                                "h-full rounded-full",
                                utilization >= 100 ? "bg-red-500" : "bg-blue-500"
                              )}
                              style={{
                                width: `${Math.min(utilization, 100)}%`,
                              }}
                            />
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {utilization.toFixed(0)}% of{" "}
                            <CurrencyDisplay
                              cents={account.creditLimit!}
                              currency={account.currency}
                            />{" "}
                            limit
                          </p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        {/* Monthly summary */}
        <div className="space-y-4">
          <h2 className="font-semibold">This Month</h2>
          {summaryLoading ? (
            <LoadingState variant="cards" />
          ) : (
            <Card>
              <CardContent className="pt-4 space-y-3">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <TrendingUp className="h-3.5 w-3.5 text-green-500" />
                    Income
                  </div>
                  <CurrencyDisplay
                    cents={summary?.totals.income ?? 0}
                    colored
                    className="font-medium text-sm"
                  />
                </div>
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <TrendingDown className="h-3.5 w-3.5 text-red-500" />
                    Expenses
                  </div>
                  <CurrencyDisplay
                    cents={-(summary?.totals.expenses ?? 0)}
                    colored
                    className="font-medium text-sm"
                  />
                </div>
                <div className="border-t pt-2 flex justify-between items-center">
                  <span className="text-sm font-medium">Net</span>
                  <CurrencyDisplay
                    cents={summary?.totals.net ?? 0}
                    colored
                    className="font-semibold"
                  />
                </div>

                {summaryBarData.length > 0 && (
                  <ChartContainer
                    config={summaryChartConfig}
                    className="h-[120px] w-full mt-2"
                  >
                    <BarChart data={summaryBarData.slice(-6)} barSize={8}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 9 }}
                        tickLine={false}
                      />
                      <Bar dataKey="income" fill="var(--chart-2)" radius={[2, 2, 0, 0]} />
                      <Bar dataKey="expenses" fill="var(--chart-1)" radius={[2, 2, 0, 0]} />
                    </BarChart>
                  </ChartContainer>
                )}

                <Button variant="outline" size="sm" className="w-full" asChild>
                  <Link href="/reports">View Reports</Link>
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Recent transactions */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Recent Transactions</h2>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/transactions">
              View all <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>

        {txLoading ? (
          <LoadingState variant="table" />
        ) : transactions.length === 0 ? (
          <EmptyState
            icon={Wallet}
            title="No transactions yet"
            description="Add your first transaction to start tracking."
          />
        ) : (
          <Card>
            <CardContent className="p-0">
              <div className="divide-y">
                {transactions.map((tx) => {
                  const account = accounts.find((a) => a._id === tx.accountId);
                  const cents = tx.type === "credit" ? tx.amount : -tx.amount;
                  return (
                    <div
                      key={tx._id}
                      className="flex items-center justify-between px-4 py-3"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">
                          {tx.description}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-muted-foreground">
                            {formatDateShort(tx.date)}
                          </span>
                          {account && (
                            <span className="text-xs text-muted-foreground">
                              · {account.name}
                            </span>
                          )}
                          <div className="flex gap-1">
                            {tx.categoryTags.slice(0, 2).map((tag) => (
                              <CategoryBadge
                                key={tag}
                                categoryName={tag}
                                categories={categories}
                              />
                            ))}
                          </div>
                        </div>
                      </div>
                      <CurrencyDisplay
                        cents={cents}
                        colored
                        className="font-mono text-sm ml-4 shrink-0"
                      />
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
