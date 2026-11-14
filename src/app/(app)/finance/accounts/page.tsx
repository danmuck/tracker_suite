"use client";

import { useState } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  Wallet,
  Archive,
  ArchiveRestore,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { LoadingState } from "@/components/loading-state";
import { EmptyState } from "@/components/empty-state";
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog";
import { AccountForm } from "@/components/finance/account-form";
import { CurrencyDisplay } from "@/components/finance/currency-display";
import {
  useAccounts,
  createAccount,
  updateAccount,
  deleteAccount,
  setAccountArchived,
} from "@/hooks/finance/use-accounts";
import {
  accountTypeGroupLabels,
  accountTypeIcons,
  accountTypeLabel,
  computeAccountTotals,
  sortAccounts,
} from "@/lib/finance/account-utils";
import { formatCurrency } from "@/lib/finance/formatters";
import { ACCOUNT_TYPES } from "@/lib/finance/constants";
import type { Account, AccountFormData, AccountType } from "@/types/finance/account";

type TabValue = "all" | AccountType;

export default function AccountsPage() {
  const [showArchived, setShowArchived] = useState(false);
  // Always fetch archived accounts so the page knows when a view holds only archived ones
  const { accounts, isLoading, mutate } = useAccounts(undefined, { includeArchived: true });
  const [tab, setTab] = useState<TabValue>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Account | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Account | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<Account | null>(null);
  const [archiving, setArchiving] = useState(false);

  const inTab = sortAccounts(
    tab === "all" ? accounts : accounts.filter((a) => a.type === tab)
  );
  const active = inTab.filter((a) => !a.isArchived);
  const archivedInTab = inTab.filter((a) => a.isArchived);
  const archived = showArchived ? archivedInTab : [];
  const totals = computeAccountTotals(active);

  async function handleCreate(data: AccountFormData) {
    try {
      await createAccount(data);
      await mutate();
      setCreateOpen(false);
      toast.success("Account created");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create account");
      throw err;
    }
  }

  async function handleEdit(data: AccountFormData) {
    if (!editTarget) return;
    try {
      await updateAccount(editTarget._id, data);
      await mutate();
      setEditTarget(null);
      toast.success("Account updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update account");
      throw err;
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    await deleteAccount(deleteTarget._id);
    await mutate();
    setDeleteTarget(null);
    toast.success("Account deleted");
  }

  async function handleArchive() {
    if (!archiveTarget) return;
    setArchiving(true);
    try {
      await setAccountArchived(archiveTarget._id, true);
      await mutate();
      toast.success(`"${archiveTarget.name}" archived`);
      setArchiveTarget(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to archive account");
    } finally {
      setArchiving(false);
    }
  }

  async function handleUnarchive(account: Account) {
    try {
      await setAccountArchived(account._id, false);
      await mutate();
      toast.success(`"${account.name}" restored`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to restore account");
    }
  }

  function renderCard(account: Account) {
    const Icon = accountTypeIcons[account.type] ?? Wallet;
    const utilization =
      account.type === "credit_card" && account.creditLimit
        ? (account.balance / account.creditLimit) * 100
        : null;

    return (
      <Card key={account._id} className={cn(account.isArchived && "opacity-60")}>
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <Icon className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base">{account.name}</CardTitle>
            </div>
            <div className="flex gap-1">
              {!account.isArchived && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setEditTarget(account)}
                  aria-label="Edit account"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              )}
              {!account.isCash &&
                (account.isArchived ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => handleUnarchive(account)}
                    aria-label="Unarchive account"
                    title="Unarchive"
                  >
                    <ArchiveRestore className="h-3.5 w-3.5" />
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setArchiveTarget(account)}
                    aria-label="Archive account"
                    title="Archive"
                  >
                    <Archive className="h-3.5 w-3.5" />
                  </Button>
                ))}
              {!account.isCash && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive hover:text-destructive"
                  onClick={() => setDeleteTarget(account)}
                  aria-label="Delete account"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </div>
          <div className="flex gap-1">
            <Badge variant="secondary" className="w-fit text-xs">
              {accountTypeLabel(account)}
            </Badge>
            {account.isArchived && (
              <Badge variant="outline" className="w-fit text-xs">
                Archived
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <p className="text-xs text-muted-foreground">Balance</p>
            <CurrencyDisplay
              cents={account.balance}
              currency={account.currency}
              accountType={account.type}
              creditLimit={account.creditLimit}
              className="text-xl font-bold"
            />
          </div>

          {utilization !== null && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Credit Used</span>
                <span>{utilization.toFixed(0)}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    utilization >= 100 ? "bg-red-500" : "bg-blue-500"
                  )}
                  style={{ width: `${Math.min(utilization, 100)}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Limit:{" "}
                <CurrencyDisplay cents={account.creditLimit!} currency={account.currency} />
              </p>
            </div>
          )}

          {account.notes && (
            <p className="text-xs text-muted-foreground line-clamp-2">{account.notes}</p>
          )}
        </CardContent>
      </Card>
    );
  }

  function renderGrid(list: Account[]) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {list.map(renderCard)}
      </div>
    );
  }

  function renderSection(title: string, list: Account[], subtotal?: number) {
    if (list.length === 0) return null;
    return (
      <section key={title} className="space-y-3">
        <div className="flex items-baseline justify-between border-b pb-2">
          <h2 className="font-semibold">
            {title}{" "}
            <span className="text-sm font-normal text-muted-foreground">
              ({list.length})
            </span>
          </h2>
          {subtotal !== undefined && (
            <CurrencyDisplay cents={subtotal} className="text-sm font-medium" />
          )}
        </div>
        {renderGrid(list)}
      </section>
    );
  }

  function sumBalances(list: Account[]) {
    return list.reduce((s, a) => s + a.balance, 0);
  }

  const stats: { label: string; cents?: number; text?: string; className?: string }[] =
    tab === "all"
      ? [
          { label: "Assets", cents: totals.assets },
          { label: "Liabilities", cents: totals.liabilities },
          {
            label: "Net Worth",
            cents: totals.netWorth,
            className: totals.netWorth < 0 ? "text-red-600 dark:text-red-400" : undefined,
          },
          ...(totals.creditUtilization !== null
            ? [{ label: "Credit Utilization", text: `${totals.creditUtilization.toFixed(0)}%` }]
            : []),
        ]
      : tab === "bank"
        ? [{ label: "Total Balance", cents: totals.assets }]
        : tab === "credit_card"
          ? [
              { label: "Total Balance", cents: totals.creditBalance },
              { label: "Total Limit", cents: totals.creditLimit },
              ...(totals.creditUtilization !== null
                ? [{ label: "Utilization", text: `${totals.creditUtilization.toFixed(0)}%` }]
                : []),
            ]
          : [{ label: "Total Owed", cents: totals.liabilities }];

  const tabHasArchivedOnly = active.length === 0 && archivedInTab.length > 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Accounts"
        description="Manage your bank accounts, credit cards, and debts"
        action={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Account
          </Button>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={tab} onValueChange={(v) => setTab(v as TabValue)}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="bank">Bank</TabsTrigger>
            <TabsTrigger value="credit_card">Credit Cards</TabsTrigger>
            <TabsTrigger value="debt">Debt</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex items-center gap-2">
          <Switch
            id="show-archived"
            checked={showArchived}
            onCheckedChange={setShowArchived}
          />
          <Label htmlFor="show-archived" className="text-sm">
            Show archived
          </Label>
        </div>
      </div>

      {isLoading ? (
        <LoadingState variant="cards" />
      ) : active.length === 0 && archived.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title={tabHasArchivedOnly ? "No active accounts" : "No accounts yet"}
          description={
            tabHasArchivedOnly
              ? "All accounts in this view are archived. Turn on Show archived to see them."
              : "Add your first account to start tracking your finances."
          }
          action={{ label: "Add Account", onClick: () => setCreateOpen(true) }}
        />
      ) : (
        <>
          {active.length > 0 && (
            <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
              {stats.map((stat) => (
                <Card key={stat.label} className="py-4">
                  <CardContent className="px-4">
                    <p className="text-xs text-muted-foreground">{stat.label}</p>
                    {stat.cents !== undefined ? (
                      <p className={cn("text-lg font-bold mt-1", stat.className)}>
                        {formatCurrency(stat.cents)}
                      </p>
                    ) : (
                      <p className="text-lg font-bold mt-1">{stat.text}</p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {tab === "all" ? (
            <div className="space-y-6">
              {ACCOUNT_TYPES.map((type) => {
                const group = active.filter((a) => a.type === type);
                return renderSection(accountTypeGroupLabels[type], group, sumBalances(group));
              })}
            </div>
          ) : (
            active.length > 0 && renderGrid(active)
          )}

          {archived.length > 0 && renderSection("Archived", archived)}
        </>
      )}

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Account</DialogTitle>
          </DialogHeader>
          <AccountForm onSubmit={handleCreate} onCancel={() => setCreateOpen(false)} />
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Account</DialogTitle>
          </DialogHeader>
          {editTarget && (
            <AccountForm
              defaultValues={{
                name: editTarget.name,
                type: editTarget.type,
                balance: editTarget.balance / 100,
                creditLimit: editTarget.creditLimit
                  ? editTarget.creditLimit / 100
                  : undefined,
                isLoan: editTarget.isLoan,
                linkedAccountId: editTarget.linkedAccountId,
                currency: editTarget.currency,
                notes: editTarget.notes,
              }}
              isCash={editTarget.isCash}
              onSubmit={handleEdit}
              onCancel={() => setEditTarget(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Archive dialog */}
      <Dialog
        open={!!archiveTarget}
        onOpenChange={(o) => !o && !archiving && setArchiveTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Archive account</DialogTitle>
            <DialogDescription>
              &quot;{archiveTarget?.name}&quot; will be hidden from account lists and pickers.
              Its transaction history is kept, and you can restore it at any time.
            </DialogDescription>
          </DialogHeader>
          {archiveTarget && archiveTarget.balance !== 0 && (
            <p className="rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
              This account has a balance of{" "}
              {formatCurrency(archiveTarget.balance, archiveTarget.currency)}. It will no
              longer count toward net worth or projections.
            </p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setArchiveTarget(null)}
              disabled={archiving}
            >
              Cancel
            </Button>
            <Button onClick={handleArchive} disabled={archiving}>
              {archiving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Archive
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete dialog */}
      <DeleteConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete account"
        description={`Are you sure you want to delete "${deleteTarget?.name}"? All associated transactions will also be deleted.`}
      />
    </div>
  );
}
