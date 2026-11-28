"use client";

import { Suspense, useMemo, useState } from "react";
import { format } from "date-fns";
import { ChevronLeft, ChevronRight, CircleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { LoadingState } from "@/components/loading-state";
import { StatTile } from "@/components/stat-tile";
import { MonthGrid } from "@/components/finance/calendar/month-grid";
import { DaySheet } from "@/components/finance/calendar/day-sheet";
import { useAccounts } from "@/hooks/finance/use-accounts";
import { useCategories } from "@/hooks/finance/use-categories";
import { useSummary } from "@/hooks/finance/use-summary";
import { useQueryParam } from "@/hooks/use-query-param";
import { parseMonth, shiftMonth } from "@/lib/finance/calendar";
import { localTodayStr } from "@/lib/finance/dates";
import { formatCurrency, parseDate } from "@/lib/finance/formatters";
import type { DaySummary } from "@/types/finance/summary";

export default function FinanceCalendarPage() {
  return (
    <Suspense fallback={<LoadingState variant="cards" />}>
      <CalendarContent />
    </Suspense>
  );
}

function CalendarContent() {
  const today = localTodayStr();
  const thisMonth = today.slice(0, 7);
  const [monthParam, setMonthParam] = useQueryParam("month");
  const month = parseMonth(monthParam, today);
  const [selected, setSelected] = useState<string | null>(null);

  const monthDate = useMemo(() => parseDate(`${month}-01`), [month]);
  const { summary, isLoading, isError } = useSummary("monthly", monthDate);
  // Archived accounts too, so old transactions still show their account names
  const { accounts } = useAccounts(undefined, { includeArchived: true });
  const { categories } = useCategories();

  // Only this month's answer: while the next month loads the grid shows empty days, not last month's
  const current = summary?.period.start.slice(0, 7) === month ? summary : undefined;
  const days = useMemo(() => {
    const map: Record<string, DaySummary> = {};
    for (const d of current?.days ?? []) map[d.date.slice(0, 10)] = d;
    return map;
  }, [current]);

  function go(next: string) {
    setSelected(null);
    // The current month is the default, so it needs no parameter
    setMonthParam(next === thisMonth ? null : next);
  }

  const totals = current?.totals;
  const money = (cents: number | undefined) => (cents == null ? "—" : formatCurrency(cents));
  const count = current?.days?.reduce((n, d) => n + d.transactions.length, 0);

  return (
    <div className="space-y-6">
      <PageHeader title="Calendar" description="Each month's transactions, past and upcoming, day by day" />

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="icon" onClick={() => go(shiftMonth(month, -1))} aria-label="Previous month">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h2 className="min-w-40 text-center text-lg font-semibold tabular-nums" aria-live="polite">
          {format(monthDate, "MMMM yyyy")}
        </h2>
        <Button variant="outline" size="icon" onClick={() => go(shiftMonth(month, 1))} aria-label="Next month">
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="sm" onClick={() => go(thisMonth)} disabled={month === thisMonth}>
          Today
        </Button>
        {isLoading && <span className="text-xs text-muted-foreground">Loading…</span>}
      </div>

      {isError && !current && (
        <p className="flex items-center gap-2 text-sm text-destructive">
          <CircleAlert className="h-4 w-4" /> Could not load this month&apos;s transactions.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Income"
          value={money(totals?.income)}
          sub={count == null ? " " : `${count} ${count === 1 ? "transaction" : "transactions"} this month`}
        />
        <StatTile label="Expenses" value={money(totals?.expenses)} sub="Purchases and bills" />
        <StatTile label="Loan payments" value={money(totals?.loanPayments)} sub="Transfers into loans" />
        <StatTile label="Net" value={money(totals?.net)} sub="Income less expenses" />
      </div>

      <MonthGrid month={month} days={days} today={today} onSelect={setSelected} />

      <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <Legend className="bg-green-500" label="Income" />
        <Legend className="bg-red-500" label="Expense" />
        <Legend className="bg-blue-500" label="Transfer" />
        <span>Upcoming transactions are dimmed.</span>
      </p>

      <DaySheet
        date={selected}
        day={selected ? days[selected] : undefined}
        accounts={accounts}
        categories={categories}
        today={today}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-2 w-2 rounded-full ${className}`} />
      {label}
    </span>
  );
}
