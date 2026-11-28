"use client";

import { useState } from "react";
import { useSWRConfig } from "swr";
import { ArrowRight, Pencil, Plus, Repeat, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { CategoryBadge } from "@/components/finance/category-badge";
import { CurrencyDisplay } from "@/components/finance/currency-display";
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog";
import { TransactionForm } from "@/components/finance/transaction-form";
import {
  createTransaction,
  deleteTransaction,
  fetchTransaction,
  updateTransaction,
} from "@/hooks/finance/use-transactions";
import { amountLabel, TX_TEXT } from "@/components/finance/calendar/month-grid";
import { bankBalance, signedAmount } from "@/lib/finance/calendar";
import { formatCurrency, parseDate } from "@/lib/finance/formatters";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import type { Account } from "@/types/finance/account";
import type { Category } from "@/types/finance/category";
import type { DaySummary } from "@/types/finance/summary";
import type { ProjectedTransaction } from "@/types/finance/projection";
import type { Transaction, TransactionFormData } from "@/types/finance/transaction";

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

/** Side panel listing one day's transactions and its end-of-day bank balance, with ways to add, edit and delete */
export function DaySheet({ date, day, accounts, categories, today, onClose }: DaySheetProps) {
  const names = Object.fromEntries(accounts.map((a) => [a._id, a.name]));
  const txs = day?.transactions ?? [];
  const net = txs.reduce((sum, t) => sum + signedAmount(t), 0);
  const upcoming = date != null && date > today;
  const [adding, setAdding] = useState(false);
  const [editTarget, setEditTarget] = useState<Transaction | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProjectedTransaction | null>(null);
  /** Source id of the transaction being loaded for editing */
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const { mutate } = useSWRConfig();

  async function handleCreate(data: TransactionFormData) {
    try {
      await createTransaction(data);
      // Balances, summaries and projections all change with a new transaction
      await mutate(() => true);
      setAdding(false);
      toast.success("Transaction created");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create transaction");
      throw err;
    }
  }

  // The day shows occurrences; editing works on the stored transaction behind one
  async function startEdit(id: string) {
    setLoadingId(id);
    try {
      setEditTarget(await fetchTransaction(id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load transaction");
    } finally {
      setLoadingId(null);
    }
  }

  async function handleEdit(data: TransactionFormData) {
    if (!editTarget) return;
    try {
      await updateTransaction(editTarget._id, data);
      await mutate(() => true);
      setEditTarget(null);
      toast.success("Transaction updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update transaction");
      throw err;
    }
  }

  async function handleDelete() {
    if (!deleteTarget?.sourceTransactionId) return;
    try {
      await deleteTransaction(deleteTarget.sourceTransactionId);
      await mutate(() => true);
      setDeleteTarget(null);
      toast.success("Transaction deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete transaction");
    }
  }

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
          <Button size="sm" variant="outline" onClick={() => setAdding(true)} disabled={date == null}>
            <Plus className="mr-1 h-4 w-4" /> Add transaction
          </Button>

          {/* Inside the panel so using the form does not count as clicking away from it */}
          <Dialog open={adding} onOpenChange={setAdding}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Add Transaction</DialogTitle>
              </DialogHeader>
              {date && (
                <TransactionForm
                  key={date}
                  defaultValues={{ date }}
                  onSubmit={handleCreate}
                  onCancel={() => setAdding(false)}
                />
              )}
            </DialogContent>
          </Dialog>

          <Dialog open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Edit Transaction</DialogTitle>
                {editTarget?.isRecurring && (
                  <DialogDescription>This is a recurring transaction: changes apply to every occurrence.</DialogDescription>
                )}
              </DialogHeader>
              {editTarget && (
                <TransactionForm
                  key={editTarget._id}
                  defaultValues={{
                    description: editTarget.description,
                    amount: editTarget.amount / 100,
                    date: editTarget.date,
                    accountId: editTarget.accountId,
                    toAccountId: editTarget.toAccountId,
                    type: editTarget.type,
                    categoryTags: editTarget.categoryTags,
                    isRecurring: editTarget.isRecurring,
                    recurrenceRule: editTarget.recurrenceRule,
                    notes: editTarget.notes,
                    amountSchedule: editTarget.amountSchedule,
                  }}
                  onSubmit={handleEdit}
                  onCancel={() => setEditTarget(null)}
                />
              )}
            </DialogContent>
          </Dialog>

          <DeleteConfirmDialog
            open={!!deleteTarget}
            onOpenChange={(o) => !o && setDeleteTarget(null)}
            onConfirm={handleDelete}
            title="Delete transaction"
            description={
              deleteTarget?.isRecurring
                ? `Delete "${deleteTarget.description}"? It is recurring, so every occurrence is removed, not only this day's. This cannot be undone.`
                : `Delete "${deleteTarget?.description}"? This cannot be undone.`
            }
          />

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
                  <div className="shrink-0 space-y-1 text-right">
                    <p className={cn("font-mono text-sm font-medium tabular-nums", TX_TEXT[t.type])}>{amountLabel(t)}</p>
                    {t.originalAmount != null && t.originalAmount !== t.amount && (
                      <p className="font-mono text-xs text-muted-foreground line-through">
                        {formatCurrency(t.originalAmount)}
                      </p>
                    )}
                    {/* Interest lines are worked out, not stored, so there is nothing to edit */}
                    {t.sourceTransactionId && (
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          aria-label={`Edit ${t.description}`}
                          disabled={loadingId != null}
                          onClick={() => startEdit(t.sourceTransactionId!)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 hover:text-destructive"
                          aria-label={`Delete ${t.description}`}
                          onClick={() => setDeleteTarget(t)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
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
