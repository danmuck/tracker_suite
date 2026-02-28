"use client";

import { useState } from "react";
import { Plus, Pencil, Trash2, CreditCard, Wallet, TrendingDown } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
} from "@/hooks/finance/use-accounts";
import type { Account, AccountFormData } from "@/types/finance/account";

const typeLabels: Record<string, string> = {
  bank: "Bank",
  credit_card: "Credit Card",
  debt: "Debt",
};

function accountTypeLabel(account: Account): string {
  if (account.isCash) return "Cash";
  return typeLabels[account.type] ?? account.type;
}

const typeIcons = {
  bank: Wallet,
  credit_card: CreditCard,
  debt: TrendingDown,
};

export default function AccountsPage() {
  const { accounts, isLoading, mutate } = useAccounts();
  const [tab, setTab] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Account | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Account | null>(null);

  const filtered =
    tab === "all" ? accounts : accounts.filter((a) => a.type === tab);

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

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="bank">Bank</TabsTrigger>
          <TabsTrigger value="credit_card">Credit Cards</TabsTrigger>
          <TabsTrigger value="debt">Debt</TabsTrigger>
        </TabsList>
      </Tabs>

      {isLoading ? (
        <LoadingState variant="cards" />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="No accounts yet"
          description="Add your first account to start tracking your finances."
          action={{ label: "Add Account", onClick: () => setCreateOpen(true) }}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((account) => {
            const Icon = typeIcons[account.type] ?? Wallet;
            const utilization =
              account.type === "credit_card" && account.creditLimit
                ? (account.balance / account.creditLimit) * 100
                : null;

            return (
              <Card key={account._id}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      <CardTitle className="text-base">{account.name}</CardTitle>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => setEditTarget(account)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      {!account.isCash && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => setDeleteTarget(account)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                  <Badge variant="secondary" className="w-fit text-xs">
                    {accountTypeLabel(account)}
                  </Badge>
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
                        <CurrencyDisplay
                          cents={account.creditLimit!}
                          currency={account.currency}
                        />
                      </p>
                    </div>
                  )}

                  {account.notes && (
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {account.notes}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Account</DialogTitle>
          </DialogHeader>
          <AccountForm
            onSubmit={handleCreate}
            onCancel={() => setCreateOpen(false)}
          />
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
