"use client";

import { ArrowRight, Repeat } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { CategoryBadge } from "@/components/finance/category-badge";
import { CurrencyDisplay } from "@/components/finance/currency-display";
import { amountLabel, TX_TEXT } from "@/components/finance/calendar/month-grid";
import { bankBalance, signedAmount } from "@/lib/finance/calendar";
import { formatCurrency, parseDate } from "@/lib/finance/formatters";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import type { Account } from "@/types/finance/account";
import type { Category } from "@/types/finance/category";
import type { DaySummary } from "@/types/finance/summary";

interface DaySheetProps {
  /** yyyy-MM-dd, or null when closed */
  date: string | null;
  day: DaySummary | undefined;
  /** Every account, archived included, for names */
  accounts: Account[];
  categories: Category[];
  /** yyyy-MM-dd */
  today: string;
  onClose: () => void;
}

/** Side panel listing one day's transactions and its end-of-day bank balance */
export function DaySheet({ date, day, accounts, categories, today, onClose }: DaySheetProps) {
  const names = Object.fromEntries(accounts.map((a) => [a._id, a.name]));
  const txs = day?.transactions ?? [];
  const net = txs.reduce((sum, t) => sum + signedAmount(t), 0);
  const upcoming = date != null && date > today;

  return (
    <Sheet open={date != null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{date ? format(parseDate(date), "EEEE, MMMM d, yyyy") : ""}</SheetTitle>
          <SheetDescription>
            {txs.length === 0
              ? "No transactions"
              : `${txs.length} ${txs.length === 1 ? "transaction" : "transactions"}${upcoming ? ", upcoming" : ""}`}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 px-4 pb-6">
          {txs.length > 0 && (
            <ul className="divide-y rounded-lg border">
              {txs.map((t, i) => (
                <li key={i} className="flex items-start justify-between gap-3 p-3">
                  <div className="min-w-0 space-y-1">
                    <p className="flex items-center gap-1.5 text-sm font-medium">
                      <span className="truncate">{t.description}</span>
                      {t.isRecurring && <Repeat className="h-3 w-3 shrink-0 text-muted-foreground" aria-label="Recurring" />}
                    </p>
                    <p className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                      <span>{names[t.accountId] ?? "Unknown account"}</span>
                      {t.type === "transfer" && t.toAccountId && (
                        <>
                          <ArrowRight className="h-3 w-3" />
                          <span>{names[t.toAccountId] ?? "Unknown account"}</span>
                        </>
                      )}
                    </p>
                    {t.categoryTags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {t.categoryTags.map((tag) => (
                          <CategoryBadge key={tag} categoryName={tag} categories={categories} />
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className={cn("font-mono text-sm font-medium tabular-nums", TX_TEXT[t.type])}>{amountLabel(t)}</p>
                    {t.originalAmount != null && t.originalAmount !== t.amount && (
                      <p className="font-mono text-xs text-muted-foreground line-through">
                        {formatCurrency(t.originalAmount)}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}

          <dl className="space-y-1.5 text-sm">
            {txs.length > 0 && (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Income less expenses</dt>
                <dd className="font-mono tabular-nums">
                  <CurrencyDisplay cents={net} colored />
                </dd>
              </div>
            )}
            {day && (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Bank balance at end of day</dt>
                <dd className="font-mono tabular-nums">
                  <CurrencyDisplay cents={bankBalance(day.balances, accounts)} colored />
                </dd>
              </div>
            )}
          </dl>
        </div>
      </SheetContent>
    </Sheet>
  );
}
