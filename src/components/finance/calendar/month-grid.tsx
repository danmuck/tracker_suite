"use client";

import { formatCurrency } from "@/lib/finance/formatters";
import { monthWeeks, weekEndDate } from "@/lib/finance/calendar";
import { cn } from "@/lib/utils";
import type { DaySummary } from "@/types/finance/summary";
import type { ProjectedTransaction } from "@/types/finance/projection";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** Transactions listed in a day cell before "+N more" */
const MAX_LINES = 3;

export const TX_TEXT: Record<ProjectedTransaction["type"], string> = {
  credit: "text-green-600 dark:text-green-500",
  debit: "text-red-600 dark:text-loss",
  transfer: "text-blue-600 dark:text-blue-400",
};

const TX_DOT: Record<ProjectedTransaction["type"], string> = {
  credit: "bg-green-500",
  debit: "bg-red-500",
  transfer: "bg-blue-500",
};

/** "+$2,100.00", "-$60.00"; a transfer has no sign */
export function amountLabel(tx: Pick<ProjectedTransaction, "type" | "amount">): string {
  const sign = tx.type === "credit" ? "+" : tx.type === "debit" ? "-" : "";
  return `${sign}${formatCurrency(tx.amount)}`;
}

/** At the end of a day (cents): bank / cash total, and credit as owed (negative) or available (see creditPosition) */
export interface WeekEndTotals {
  bank: number;
  credit: number;
  /** Owed share of the credit limit, 0 to 1 or more; null when unknown (see creditUtilization) */
  utilization: number | null;
}

/** "$15K" for the narrow layout */
const compact = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 0,
});

/** Seven day columns and the week-end column. Inline so the layout never depends on a cached stylesheet */
/** Owed credit is shown in red from this share of the limit; below it, in blue */
const HIGH_UTILIZATION = 0.25;

const COLUMNS = { gridTemplateColumns: "repeat(7, minmax(0, 1fr)) minmax(0, 1.1fr)" };

interface MonthGridProps {
  /** yyyy-MM */
  month: string;
  /** The month's days keyed by yyyy-MM-dd; empty while loading */
  days: Record<string, DaySummary>;
  /** Totals at the end of each row's Saturday, keyed by that Saturday (which may be in the next month) */
  weekEnds: Record<string, WeekEndTotals | undefined>;
  /** yyyy-MM-dd */
  today: string;
  onSelect: (date: string) => void;
}

/** One month as a Sunday-to-Saturday grid of days with their transactions, and each week's closing totals */
export function MonthGrid({ month, days, weekEnds, today, onSelect }: MonthGridProps) {
  const weeks = monthWeeks(month);

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div
        className="grid border-b bg-muted/40 text-center text-xs font-medium text-muted-foreground"
        style={COLUMNS}
      >
        {WEEKDAYS.map((d) => (
          <div key={d} className="py-2">
            {d}
          </div>
        ))}
        <div className="border-l py-2">
          <span className="sm:hidden">End</span>
          <span className="hidden sm:inline">Week end</span>
        </div>
      </div>
      <div className="grid" style={COLUMNS}>
        {weeks.map((week, w) => {
          const bottom = w === weeks.length - 1 ? "border-b-0" : "border-b";
          const end = weekEndDate(week);
          const totals = weekEnds[end];
          return [
            ...week.map((date, i) => {
              const edge = cn("border-r", bottom);
              if (!date) return <div key={`blank-${w}-${i}`} className={cn("min-h-16 bg-muted/20 sm:min-h-28", edge)} />;

              const txs = days[date]?.transactions ?? [];
              const upcoming = date > today;
              const isToday = date === today;
              const dayNumber = Number(date.slice(8));

              return (
                <button
                  key={date}
                  type="button"
                  onClick={() => onSelect(date)}
                  aria-label={`${date}, ${txs.length} ${txs.length === 1 ? "transaction" : "transactions"}`}
                  className={cn(
                    "flex min-h-16 min-w-0 flex-col gap-1 p-1 text-left transition-colors hover:bg-accent/50 focus-visible:bg-accent/50 focus-visible:outline-none sm:min-h-28 sm:p-1.5",
                    edge,
                    isToday && "bg-primary/5 ring-2 ring-inset ring-primary"
                  )}
                >
                  <span
                    className={cn(
                      "text-xs tabular-nums",
                      isToday ? "font-semibold text-primary" : "text-muted-foreground"
                    )}
                  >
                    {dayNumber}
                  </span>

                  {/* Narrow screens: one dot per transaction */}
                  <span className={cn("flex flex-wrap gap-0.5 sm:hidden", upcoming && "opacity-50")}>
                    {txs.slice(0, 8).map((t, j) => (
                      <span key={j} className={cn("h-1.5 w-1.5 rounded-full", TX_DOT[t.type])} />
                    ))}
                  </span>

                  {/* Wider screens: description and amount */}
                  <span className={cn("hidden min-w-0 flex-col gap-0.5 sm:flex", upcoming && "opacity-60")}>
                    {txs.slice(0, MAX_LINES).map((t, j) => (
                      <span key={j} className="flex min-w-0 items-baseline justify-between gap-1 text-[11px] leading-tight">
                        <span className="truncate">{t.description}</span>
                        <span className={cn("shrink-0 font-mono tabular-nums", TX_TEXT[t.type])}>{amountLabel(t)}</span>
                      </span>
                    ))}
                    {txs.length > MAX_LINES && (
                      <span className="text-[11px] leading-tight text-muted-foreground">+{txs.length - MAX_LINES} more</span>
                    )}
                  </span>
                </button>
              );
            }),
            <WeekEndCell key={`end-${end}`} totals={totals} upcoming={end > today} className={bottom} />,
          ];
        })}
      </div>
    </div>
  );
}

/** Something is owed, and it is 25% of the limit or more (or the limit is unknown) */
function highUtilization(totals: WeekEndTotals): boolean {
  return totals.credit < 0 && (totals.utilization == null || totals.utilization >= HIGH_UTILIZATION);
}

/** Closing totals for one week: bank / cash, and credit owed (negative) or available */
function WeekEndCell({
  totals,
  upcoming,
  className,
}: {
  totals: WeekEndTotals | undefined;
  upcoming: boolean;
  className?: string;
}) {
  const rows = [
    { label: "Bank / Cash", short: "Bank", cents: totals?.bank, tone: totals && totals.bank < 0 ? TX_TEXT.debit : TX_TEXT.credit },
    { label: "Credit", short: "Credit", cents: totals?.credit, tone: totals && highUtilization(totals) ? TX_TEXT.debit : TX_TEXT.transfer },
  ];
  return (
    <div
      className={cn("flex min-h-16 min-w-0 flex-col items-center justify-center bg-muted/30 p-1 text-center sm:min-h-28 sm:p-1.5", className)}
      title={upcoming ? "Projected totals at the end of this Saturday" : "Totals at the end of this Saturday"}
    >
      <dl className={cn("flex w-full min-w-0 flex-col gap-1", upcoming && "opacity-70")}>
        {rows.map((r) => (
          <div key={r.label} className="min-w-0 leading-tight">
            <dt className="truncate text-[10px] text-muted-foreground">
              <span className="sm:hidden">{r.short}</span>
              <span className="hidden sm:inline">{r.label}</span>
            </dt>
            <dd className={cn("truncate font-mono text-[11px] font-medium tabular-nums sm:text-xs", r.cents != null && r.tone)}>
              {r.cents == null ? (
                "—"
              ) : (
                <>
                  <span className="sm:hidden">{compact.format(r.cents / 100)}</span>
                  <span className="hidden sm:inline">{formatCurrency(r.cents)}</span>
                </>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
