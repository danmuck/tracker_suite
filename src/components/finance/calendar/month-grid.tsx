"use client";

import { formatCurrency } from "@/lib/finance/formatters";
import { monthWeeks } from "@/lib/finance/calendar";
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

interface MonthGridProps {
  /** yyyy-MM */
  month: string;
  /** The month's days keyed by yyyy-MM-dd; empty while loading */
  days: Record<string, DaySummary>;
  /** yyyy-MM-dd */
  today: string;
  onSelect: (date: string) => void;
}

/** One month as a Sunday-to-Saturday grid of days with their transactions */
export function MonthGrid({ month, days, today, onSelect }: MonthGridProps) {
  const weeks = monthWeeks(month);

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="grid grid-cols-7 border-b bg-muted/40 text-center text-xs font-medium text-muted-foreground">
        {WEEKDAYS.map((d) => (
          <div key={d} className="py-2">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {weeks.flat().map((date, i) => {
          const edge = cn("border-b border-r", i % 7 === 6 && "border-r-0", i >= (weeks.length - 1) * 7 && "border-b-0");
          if (!date) return <div key={`blank-${i}`} className={cn("min-h-16 bg-muted/20 sm:min-h-28", edge)} />;

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
        })}
      </div>
    </div>
  );
}
