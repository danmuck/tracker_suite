"use client";

import { useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  CreditCard,
  Wallet,
  CheckCircle2,
  ArrowRightLeft,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CurrencyDisplay } from "@/components/currency-display";
import { cn } from "@/lib/utils";
import type { ProjectionAlert, ProjectionAlertReason } from "@/types/projection";
import type { Account } from "@/types/account";

const REASON_META: Record<
  ProjectionAlertReason,
  { label: string; icon: typeof AlertTriangle; severity: "amber" | "red" }
> = {
  credit_limit: {
    label: "Credit limit reached",
    icon: CreditCard,
    severity: "red",
  },
  debt_paid_off: {
    label: "Debt fully paid",
    icon: CheckCircle2,
    severity: "amber",
  },
  insufficient_balance: {
    label: "Insufficient balance",
    icon: Wallet,
    severity: "red",
  },
};

interface ProjectionAlertsProps {
  alerts: ProjectionAlert[];
  accounts: Account[];
  /** Max alerts shown before collapsing */
  initialLimit?: number;
  /** Compact mode for dashboard use */
  compact?: boolean;
}

export function ProjectionAlerts({
  alerts,
  accounts,
  initialLimit = 5,
  compact = false,
}: ProjectionAlertsProps) {
  const [expanded, setExpanded] = useState(false);

  if (alerts.length === 0) return null;

  const accountMap = Object.fromEntries(accounts.map((a) => [a._id, a]));

  // Deduplicate recurring alerts: group by sourceTransactionId + reason, show first + count
  const grouped = alerts.reduce<
    Record<string, { alert: ProjectionAlert; count: number; firstDate: string; lastDate: string }>
  >((acc, alert) => {
    const key = `${alert.sourceTransactionId ?? alert.description}-${alert.reason}`;
    if (acc[key]) {
      acc[key].count++;
      if (alert.date < acc[key].firstDate) acc[key].firstDate = alert.date;
      if (alert.date > acc[key].lastDate) acc[key].lastDate = alert.date;
    } else {
      acc[key] = { alert, count: 1, firstDate: alert.date, lastDate: alert.date };
    }
    return acc;
  }, {});

  const entries = Object.values(grouped).sort((a, b) => {
    // Red severity first, then by date
    const sevA = REASON_META[a.alert.reason].severity === "red" ? 0 : 1;
    const sevB = REASON_META[b.alert.reason].severity === "red" ? 0 : 1;
    if (sevA !== sevB) return sevA - sevB;
    return a.firstDate.localeCompare(b.firstDate);
  });

  const redCount = entries.filter(
    (e) => REASON_META[e.alert.reason].severity === "red"
  ).length;
  const amberCount = entries.length - redCount;

  const visible = expanded ? entries : entries.slice(0, initialLimit);
  const hasMore = entries.length > initialLimit;

  function formatDateCompact(dateStr: string) {
    const d = new Date(dateStr + "T12:00:00.000Z");
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  if (compact) {
    return (
      <Card
        className={cn(
          "overflow-hidden border-l-4 py-0 gap-0",
          redCount > 0
            ? "border-l-red-500 dark:border-l-red-400"
            : "border-l-amber-500 dark:border-l-amber-400"
        )}
      >
        <CardContent className="pt-2 pb-2">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle
              className={cn(
                "h-4 w-4 shrink-0",
                redCount > 0
                  ? "text-red-500 dark:text-red-400"
                  : "text-amber-500 dark:text-amber-400"
              )}
            />
            <span className="text-sm font-medium">
              {entries.length} projection{" "}
              {entries.length === 1 ? "alert" : "alerts"}
            </span>
          </div>
          <div className="space-y-1.5">
            {entries.slice(0, 3).map((entry, i) => {
              const meta = REASON_META[entry.alert.reason];
              const isStopped = entry.alert.adjustedAmount === 0;
              return (
                <div
                  key={i}
                  className="flex items-center justify-between gap-2 text-xs"
                >
                  <span className="text-muted-foreground truncate">
                    {entry.alert.description}
                  </span>
                  <Badge
                    variant="secondary"
                    className={cn(
                      "shrink-0 text-[10px] px-1.5 py-0",
                      meta.severity === "red"
                        ? "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400"
                        : "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400"
                    )}
                  >
                    {isStopped ? "stopped" : "reduced"}
                  </Badge>
                </div>
              );
            })}
            {entries.length > 3 && (
              <p className="text-xs text-muted-foreground">
                +{entries.length - 3} more
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      className={cn(
        "overflow-hidden border-l-4",
        redCount > 0
          ? "border-l-red-500 dark:border-l-red-400"
          : "border-l-amber-500 dark:border-l-amber-400"
      )}
    >
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-lg",
                redCount > 0
                  ? "bg-red-100 dark:bg-red-950/50"
                  : "bg-amber-100 dark:bg-amber-950/50"
              )}
            >
              <AlertTriangle
                className={cn(
                  "h-4 w-4",
                  redCount > 0
                    ? "text-red-600 dark:text-red-400"
                    : "text-amber-600 dark:text-amber-400"
                )}
              />
            </div>
            <div>
              <CardTitle className="text-sm">Projection Alerts</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                {entries.length} payment{entries.length !== 1 ? "s" : ""}{" "}
                affected by balance constraints
              </p>
            </div>
          </div>
          <div className="flex gap-1.5">
            {redCount > 0 && (
              <Badge
                variant="secondary"
                className="bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400 text-xs"
              >
                {redCount} critical
              </Badge>
            )}
            {amberCount > 0 && (
              <Badge
                variant="secondary"
                className="bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400 text-xs"
              >
                {amberCount} info
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-0 divide-y divide-border">
          {visible.map((entry, i) => {
            const meta = REASON_META[entry.alert.reason];
            const Icon = meta.icon;
            const isStopped = entry.alert.adjustedAmount === 0;
            const accountName =
              accountMap[entry.alert.accountId]?.name ??
              entry.alert.accountId;
            const toAccountName = entry.alert.toAccountId
              ? accountMap[entry.alert.toAccountId]?.name ??
                entry.alert.toAccountId
              : null;

            return (
              <div
                key={i}
                className={cn(
                  "flex items-start gap-3 py-3 first:pt-0",
                  i === visible.length - 1 && "pb-0"
                )}
              >
                {/* Severity indicator */}
                <div
                  className={cn(
                    "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md",
                    meta.severity === "red"
                      ? "bg-red-100 dark:bg-red-950/50"
                      : "bg-amber-100 dark:bg-amber-950/50"
                  )}
                >
                  <Icon
                    className={cn(
                      "h-3.5 w-3.5",
                      meta.severity === "red"
                        ? "text-red-600 dark:text-red-400"
                        : "text-amber-600 dark:text-amber-400"
                    )}
                  />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate">
                      {entry.alert.description}
                    </p>
                    <Badge
                      variant="secondary"
                      className={cn(
                        "shrink-0 text-[10px] px-1.5 py-0",
                        isStopped
                          ? "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400"
                          : "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400"
                      )}
                    >
                      {isStopped ? "stopped" : "reduced"}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
                    <span>{meta.label}</span>
                    <span className="opacity-40">|</span>
                    {toAccountName ? (
                      <span className="flex items-center gap-1">
                        {accountName}
                        <ArrowRightLeft className="h-2.5 w-2.5" />
                        {toAccountName}
                      </span>
                    ) : (
                      <span>{accountName}</span>
                    )}
                    <span className="opacity-40">|</span>
                    <span>
                      {entry.count > 1
                        ? `${formatDateCompact(entry.firstDate)} — ${formatDateCompact(entry.lastDate)}`
                        : formatDateCompact(entry.firstDate)}
                    </span>
                    {entry.count > 1 && (
                      <>
                        <span className="opacity-40">|</span>
                        <span>{entry.count} occurrences</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Amount impact */}
                <div className="shrink-0 text-right">
                  <p className="font-mono text-xs text-muted-foreground line-through">
                    <CurrencyDisplay cents={entry.alert.originalAmount} />
                  </p>
                  <p
                    className={cn(
                      "font-mono text-sm font-medium",
                      isStopped
                        ? "text-red-600 dark:text-red-400"
                        : "text-amber-600 dark:text-amber-400"
                    )}
                  >
                    {isStopped ? (
                      "$0.00"
                    ) : (
                      <CurrencyDisplay cents={entry.alert.adjustedAmount} />
                    )}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Expand/collapse */}
        {hasMore && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full mt-3 text-xs text-muted-foreground"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? (
              <>
                Show less <ChevronUp className="ml-1 h-3 w-3" />
              </>
            ) : (
              <>
                Show {entries.length - initialLimit} more{" "}
                <ChevronDown className="ml-1 h-3 w-3" />
              </>
            )}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
