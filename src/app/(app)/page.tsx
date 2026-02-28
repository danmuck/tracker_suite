"use client";

import Link from "next/link";
import { format } from "date-fns";
import { ArrowRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CurrencyDisplay } from "@/components/finance/currency-display";
import { LoadingState } from "@/components/loading-state";
import { useAccounts } from "@/hooks/finance/use-accounts";
import { useSummary } from "@/hooks/finance/use-summary";
import { modules } from "@/lib/modules";

export default function GlobalDashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Tracker Suite</h1>
        <p className="text-muted-foreground text-sm">
          {format(new Date(), "EEEE, MMMM d, yyyy")}
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {modules.map((mod) => (
          <ModuleCard key={mod.id} moduleId={mod.id} />
        ))}

        {/* Placeholder for future modules */}
        <Card className="border-dashed opacity-60">
          <CardContent className="flex flex-col items-center justify-center py-10 text-center">
            <Plus className="h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-sm font-medium text-muted-foreground">
              More modules coming soon
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ModuleCard({ moduleId }: { moduleId: string }) {
  if (moduleId === "finance") return <FinanceModuleCard />;
  return null;
}

function FinanceModuleCard() {
  const { accounts, isLoading: accountsLoading } = useAccounts();
  const { summary, isLoading: summaryLoading } = useSummary("monthly", new Date());

  const netWorth = accounts.reduce((total, account) => {
    if (account.type === "bank") return total + account.balance;
    return total - account.balance;
  }, 0);

  const mod = modules.find((m) => m.id === "finance")!;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-md text-white"
              style={{ backgroundColor: mod.accentColor }}
            >
              <mod.icon className="h-4 w-4" />
            </div>
            <CardTitle className="text-base">{mod.label}</CardTitle>
          </div>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/finance">
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {accountsLoading || summaryLoading ? (
          <LoadingState variant="cards" />
        ) : (
          <>
            <div>
              <p className="text-xs text-muted-foreground">Net Worth</p>
              <p className="text-xl font-bold">
                {new Intl.NumberFormat("en-US", {
                  style: "currency",
                  currency: "USD",
                }).format(netWorth / 100)}
              </p>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">
                {accounts.length} account{accounts.length !== 1 ? "s" : ""}
              </span>
              {summary && (
                <span className="text-muted-foreground">
                  Monthly net:{" "}
                  <CurrencyDisplay
                    cents={summary.totals.net}
                    colored
                    className="font-medium"
                  />
                </span>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
