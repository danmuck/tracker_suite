"use client";

import { useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowRightLeft,
  ArrowUp,
  ArrowUpDown,
  ListX,
  Repeat,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";
import { CurrencyDisplay } from "@/components/finance/currency-display";
import { MONEY_IN, MONEY_OUT, TYPE_STYLE } from "@/components/finance/transaction-styles";
import { formatDate } from "@/lib/finance/formatters";
import { cn } from "@/lib/utils";
import type { Account } from "@/types/finance/account";
import type { ProjectedTransaction, ProjectionDay } from "@/types/finance/projection";

const LIMIT_OPTIONS = [10, 25, 50, 100];

// Bank | Credit: equal-width halves either side of a centred divider
const LEDGER_GRID = "grid grid-cols-[1fr_auto_1fr] items-baseline gap-x-2";

type SortKey = "date" | "amount";
type SortDir = "asc" | "desc";

/** Signed amount for sorting: money out is negative, transfers keep their size */
function signedAmount(t: ProjectedTransaction) {
  return t.type === "debit" ? -t.amount : t.amount;
}

/**
 * Every transaction inside the projection range — one-off entries, each
 * occurrence of a recurring item, and projected interest — laid out like the
 * Transactions page.
 */
export function ProjectionTransactions({
  timeline,
  accounts,
}: {
  timeline: ProjectionDay[];
  accounts: Account[];
}) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [recurringOnly, setRecurringOnly] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: "date", dir: "asc" });
  const [limit, setLimit] = useState(25);
  const [page, setPage] = useState(1);

  const accountMap = Object.fromEntries(accounts.map((a) => [a._id, a]));

  const all = useMemo(() => timeline.flatMap((d) => d.transactions), [timeline]);
  const tagOptions = useMemo(
    () => [...new Set(all.flatMap((t) => t.categoryTags))].sort(),
    [all]
  );

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = all.filter(
      (t) =>
        (!q || t.description.toLowerCase().includes(q)) &&
        (!typeFilter || t.type === typeFilter) &&
        (!categoryFilter || t.categoryTags.includes(categoryFilter)) &&
        (!recurringOnly || t.isRecurring)
    );
    const dir = sort.dir === "asc" ? 1 : -1;
    // Stable sort keeps same-day items in the order the projection applied them
    return [...filtered].sort((a, b) =>
      sort.key === "date"
        ? dir * a.date.localeCompare(b.date)
        : dir * (signedAmount(a) - signedAmount(b))
    );
  }, [all, search, typeFilter, categoryFilter, recurringOnly, sort]);

  const totalPages = Math.max(1, Math.ceil(rows.length / limit));
  const currentPage = Math.min(page, totalPages);
  const visible = rows.slice((currentPage - 1) * limit, currentPage * limit);

  function toggleSort(key: SortKey) {
    setSort((s) => ({ key, dir: s.key === key && s.dir === "asc" ? "desc" : "asc" }));
    setPage(1);
  }

  function sortButton(label: string, sortKey: SortKey) {
    const active = sort.key === sortKey;
    return (
      <Button variant="ghost" size="sm" className="-ml-2" onClick={() => toggleSort(sortKey)}>
        {label}
        {active && sort.dir === "asc" ? (
          <ArrowUp className="ml-1 h-3 w-3" />
        ) : active ? (
          <ArrowDown className="ml-1 h-3 w-3" />
        ) : (
          <ArrowUpDown className="ml-1 h-3 w-3" />
        )}
      </Button>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search transactions..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="pl-8"
          />
        </div>

        <Select
          value={typeFilter}
          onValueChange={(v) => {
            setTypeFilter(v === "_all" ? "" : v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[130px]">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">All types</SelectItem>
            <SelectItem value="credit">Credit</SelectItem>
            <SelectItem value="debit">Debit</SelectItem>
            <SelectItem value="transfer">Transfer</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={categoryFilter}
          onValueChange={(v) => {
            setCategoryFilter(v === "_all" ? "" : v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">All categories</SelectItem>
            {tagOptions.map((tag) => (
              <SelectItem key={tag} value={tag} className="capitalize">
                {tag.replace("_", " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          variant={recurringOnly ? "default" : "outline"}
          className="gap-1.5"
          onClick={() => {
            setRecurringOnly((v) => !v);
            setPage(1);
          }}
        >
          <Repeat className="h-3.5 w-3.5" />
          Recurring
        </Button>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={ListX}
          title="No transactions"
          description={
            all.length === 0
              ? "Nothing is scheduled in this range."
              : "No transactions match your current filters."
          }
        />
      ) : (
        <>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    {sortButton("Date", "date")}
                  </TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead />
                  <TableHead>
                    {sortButton("Amount", "amount")}
                  </TableHead>
                  <TableHead>
                    {/* Same three-track grid as the cells below, so the divider lines up */}
                    <div className={LEDGER_GRID} title="Totals right after each transaction">
                      <span className="text-right">Bank</span>
                      <span className="opacity-40">|</span>
                      <span>Credit</span>
                    </div>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((tx, i) => {
                  const account = accountMap[tx.accountId];
                  const toAccount = tx.toAccountId ? accountMap[tx.toAccountId] : undefined;
                  const reduced =
                    tx.originalAmount !== undefined && tx.originalAmount !== tx.amount;
                  return (
                    <TableRow
                      key={`${tx.date}-${tx.sourceTransactionId ?? tx.description}-${tx.accountId}-${i}`}
                      className={TYPE_STYLE[tx.type].row}
                    >
                      <TableCell>
                        <span className="text-muted-foreground text-sm">
                          {formatDate(tx.date)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="max-w-[200px]">
                          <p className="font-medium truncate">{tx.description}</p>
                          {reduced && (
                            <p className="text-xs text-muted-foreground truncate">
                              {tx.amount === 0 ? "Stopped" : "Reduced"} (see Alerts)
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {tx.type === "transfer" && tx.toAccountId ? (
                          <span className="text-sm flex items-center gap-1">
                            <span className={MONEY_OUT}>{account?.name ?? tx.accountId}</span>
                            <ArrowRightLeft className="h-3 w-3 text-muted-foreground" />
                            <span className={MONEY_IN}>{toAccount?.name ?? tx.toAccountId}</span>
                          </span>
                        ) : (
                          <span
                            className={cn("text-sm", tx.type === "credit" ? MONEY_IN : MONEY_OUT)}
                          >
                            {account?.name ?? tx.accountId}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {tx.isRecurring ? (
                          <Repeat className="h-3.5 w-3.5 text-muted-foreground" />
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-baseline gap-2">
                          {tx.type === "transfer" ? (
                            <CurrencyDisplay
                              cents={tx.amount}
                              className="font-mono text-sm text-muted-foreground"
                            />
                          ) : (
                            <CurrencyDisplay
                              cents={tx.type === "credit" ? tx.amount : -tx.amount}
                              colored
                              className="font-mono text-sm"
                            />
                          )}
                          {reduced && (
                            <CurrencyDisplay
                              cents={tx.originalAmount!}
                              className="font-mono text-xs text-muted-foreground line-through"
                            />
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-sm whitespace-nowrap">
                        {tx.ledger ? (
                          <div className={LEDGER_GRID}>
                            <CurrencyDisplay cents={tx.ledger.bank} className="text-right" />
                            <span className="text-muted-foreground opacity-40">|</span>
                            <CurrencyDisplay
                              cents={-tx.ledger.credit}
                              className="text-muted-foreground"
                            />
                          </div>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>Rows per page:</span>
              <Select
                value={String(limit)}
                onValueChange={(v) => {
                  setLimit(Number(v));
                  setPage(1);
                }}
              >
                <SelectTrigger className="h-8 w-16">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LIMIT_OPTIONS.map((l) => (
                    <SelectItem key={l} value={String(l)}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                Page {currentPage} of {totalPages} ({rows.length} total)
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(currentPage - 1)}
                disabled={currentPage <= 1}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(currentPage + 1)}
                disabled={currentPage >= totalPages}
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
