"use client";

import { useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowRightLeft,
  ArrowUp,
  ArrowUpDown,
  FlaskConical,
  ListX,
  Lock,
  Pencil,
  Plus,
  Repeat,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TransactionForm } from "@/components/finance/transaction-form";
import {
  isSandboxId,
  projectionSandbox,
  type SandboxState,
} from "@/hooks/finance/use-projection-sandbox";
import type { Transaction, TransactionFormData } from "@/types/finance/transaction";
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
  sandbox,
  lockedIds,
}: {
  timeline: ProjectionDay[];
  accounts: Account[];
  sandbox: SandboxState;
  /** Transactions driven by the Datasheet (Salary, Rent): changed on the Sandbox tab, not here */
  lockedIds: Set<string>;
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<{ id: string; values: Partial<TransactionFormData> } | null>(null);

  /** Open the form for the transaction behind a row, using its sandbox version if it has one */
  async function openEdit(id: string) {
    const local = sandbox.added.find((a) => a.id === id)?.data ?? sandbox.edited[id];
    if (local) {
      setEditTarget({ id, values: local });
      return;
    }
    try {
      const res = await fetch(`/api/transactions/${id}`);
      // This endpoint returns the transaction itself, not wrapped in { data }
      const tx = (await res.json()) as Transaction;
      if (!res.ok || !tx?._id) throw new Error();
      setEditTarget({
        id,
        values: {
          description: tx.description,
          amount: tx.amount / 100,
          date: tx.date,
          accountId: tx.accountId,
          toAccountId: tx.toAccountId,
          type: tx.type,
          categoryTags: tx.categoryTags,
          isRecurring: tx.isRecurring,
          recurrenceRule: tx.recurrenceRule,
          notes: tx.notes,
        },
      });
    } catch {
      toast.error("Could not load that transaction");
    }
  }

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

        <Button className="gap-1.5" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          Add to sandbox
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
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((tx, i) => {
                  const account = accountMap[tx.accountId];
                  const toAccount = tx.toAccountId ? accountMap[tx.toAccountId] : undefined;
                  const reduced =
                    tx.originalAmount !== undefined && tx.originalAmount !== tx.amount;
                  const sourceId = tx.sourceTransactionId;
                  const inSandbox =
                    !!sourceId && (isSandboxId(sourceId) || sourceId in sandbox.edited);
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
                          <p className="font-medium truncate flex items-center gap-1.5">
                            <span className="truncate">{tx.description}</span>
                            {inSandbox && (
                              <span title="Sandbox change, not in your real data">
                                <FlaskConical className="h-3 w-3 shrink-0 text-primary" />
                              </span>
                            )}
                          </p>
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
                      <TableCell>
                        {/* Projected interest lines have no transaction behind them to change */}
                        {sourceId && lockedIds.has(sourceId) ? (
                          <span
                            className="flex h-7 w-7 items-center justify-center text-muted-foreground"
                            title="Managed by the Datasheet. Change it on the Sandbox tab."
                          >
                            <Lock className="h-3.5 w-3.5" />
                          </span>
                        ) : sourceId ? (
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              title={tx.isRecurring ? "Edit in sandbox (whole series)" : "Edit in sandbox"}
                              onClick={() => openEdit(sourceId)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              title={
                                tx.isRecurring
                                  ? "Remove from sandbox projection (whole series)"
                                  : "Remove from sandbox projection"
                              }
                              onClick={() => {
                                projectionSandbox.remove(sourceId);
                                toast.success(`"${tx.description}" left out of the sandbox projection`);
                              }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
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

      {/* Add to sandbox */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Sandbox Transaction</DialogTitle>
            <DialogDescription>
              Used only for this projection. It is not saved to your transactions.
            </DialogDescription>
          </DialogHeader>
          <TransactionForm
            onSubmit={async (data) => {
              projectionSandbox.add(data);
              setCreateOpen(false);
              toast.success("Added to the sandbox");
            }}
            onCancel={() => setCreateOpen(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Edit in sandbox */}
      <Dialog open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit in Sandbox</DialogTitle>
            <DialogDescription>
              Changes apply to this projection only. Your real transaction stays as it is.
            </DialogDescription>
          </DialogHeader>
          {editTarget && (
            <TransactionForm
              defaultValues={editTarget.values}
              onSubmit={async (data) => {
                projectionSandbox.edit(editTarget.id, data);
                setEditTarget(null);
                toast.success("Sandbox updated");
              }}
              onCancel={() => setEditTarget(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
