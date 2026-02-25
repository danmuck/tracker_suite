"use client";

import { Suspense } from "react";
import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Plus,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Repeat,
  Pencil,
  Trash2,
  ArrowRightLeft,
} from "lucide-react";
import { toast } from "sonner";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  type SortingState,
  type ColumnDef,
} from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageHeader } from "@/components/page-header";
import { LoadingState } from "@/components/loading-state";
import { EmptyState } from "@/components/empty-state";
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog";
import { TransactionForm } from "@/components/transaction-form";
import { CurrencyDisplay } from "@/components/currency-display";
import { CategoryBadge } from "@/components/category-badge";
import {
  useTransactions,
  createTransaction,
  updateTransaction,
  deleteTransaction,
} from "@/hooks/use-transactions";
import { useAccounts } from "@/hooks/use-accounts";
import { useCategories } from "@/hooks/use-categories";
import { formatDateShort } from "@/lib/formatters";
import type { Transaction, TransactionFormData } from "@/types/transaction";
import type { TransactionFilters } from "@/types/api";

const LIMIT_OPTIONS = [10, 25, 50, 100];

function TransactionsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  const [accountFilter, setAccountFilter] = useState(
    searchParams.get("accountId") ?? ""
  );
  const [typeFilter, setTypeFilter] = useState(
    searchParams.get("type") ?? ""
  );
  const [categoryFilter, setCategoryFilter] = useState(
    searchParams.get("category") ?? ""
  );
  const [page, setPage] = useState(Number(searchParams.get("page") ?? "1"));
  const [limit, setLimit] = useState(Number(searchParams.get("limit") ?? "25"));
  const [sorting, setSorting] = useState<SortingState>([
    { id: "date", desc: true },
  ]);

  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Transaction | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Transaction | null>(null);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Sync filters to URL
  useEffect(() => {
    const p = new URLSearchParams();
    if (debouncedSearch) p.set("search", debouncedSearch);
    if (accountFilter) p.set("accountId", accountFilter);
    if (typeFilter) p.set("type", typeFilter);
    if (categoryFilter) p.set("category", categoryFilter);
    if (page !== 1) p.set("page", String(page));
    if (limit !== 25) p.set("limit", String(limit));
    router.replace(`/transactions?${p.toString()}`, { scroll: false });
  }, [debouncedSearch, accountFilter, typeFilter, categoryFilter, page, limit, router]);

  const sortCol = sorting[0]?.id ?? "date";
  const sortOrder = sorting[0]?.desc ? "desc" : "asc";

  const filters: TransactionFilters = {
    search: debouncedSearch || undefined,
    accountId: accountFilter || undefined,
    type: typeFilter as TransactionFilters["type"] || undefined,
    category: categoryFilter || undefined,
    page,
    limit,
    sort: sortCol,
    order: sortOrder,
  };

  const { transactions, pagination, isLoading, mutate } = useTransactions(filters);
  const { accounts } = useAccounts();
  const { categories } = useCategories();

  const accountMap = Object.fromEntries(accounts.map((a) => [a._id, a]));

  const columns: ColumnDef<Transaction>[] = [
    {
      accessorKey: "date",
      header: ({ column }) => (
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2"
          onClick={() =>
            column.toggleSorting(column.getIsSorted() === "asc")
          }
        >
          Date
          {column.getIsSorted() === "asc" ? (
            <ArrowUp className="ml-1 h-3 w-3" />
          ) : column.getIsSorted() === "desc" ? (
            <ArrowDown className="ml-1 h-3 w-3" />
          ) : (
            <ArrowUpDown className="ml-1 h-3 w-3" />
          )}
        </Button>
      ),
      cell: ({ row }) => (
        <span className="text-muted-foreground text-sm">
          {formatDateShort(row.original.date)}
        </span>
      ),
    },
    {
      accessorKey: "description",
      header: "Description",
      cell: ({ row }) => (
        <div className="max-w-[200px]">
          <p className="font-medium truncate">{row.original.description}</p>
          {row.original.notes && (
            <p className="text-xs text-muted-foreground truncate">
              {row.original.notes}
            </p>
          )}
        </div>
      ),
    },
    {
      accessorKey: "accountId",
      header: "Account",
      cell: ({ row }) => {
        const account = accountMap[row.original.accountId];
        return (
          <span className="text-sm">{account?.name ?? row.original.accountId}</span>
        );
      },
    },
    {
      accessorKey: "categoryTags",
      header: "Categories",
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-1">
          {row.original.categoryTags.map((tag) => (
            <CategoryBadge key={tag} categoryName={tag} categories={categories} />
          ))}
        </div>
      ),
    },
    {
      accessorKey: "type",
      header: "Type",
      cell: ({ row }) => (
        <Badge
          variant={row.original.type === "credit" ? "default" : "secondary"}
          className="capitalize"
        >
          {row.original.type}
        </Badge>
      ),
    },
    {
      accessorKey: "isRecurring",
      header: "",
      cell: ({ row }) =>
        row.original.isRecurring ? (
          <Repeat className="h-3.5 w-3.5 text-muted-foreground" />
        ) : null,
    },
    {
      accessorKey: "amount",
      header: ({ column }) => (
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2"
          onClick={() =>
            column.toggleSorting(column.getIsSorted() === "asc")
          }
        >
          Amount
          {column.getIsSorted() === "asc" ? (
            <ArrowUp className="ml-1 h-3 w-3" />
          ) : column.getIsSorted() === "desc" ? (
            <ArrowDown className="ml-1 h-3 w-3" />
          ) : (
            <ArrowUpDown className="ml-1 h-3 w-3" />
          )}
        </Button>
      ),
      cell: ({ row }) => {
        const tx = row.original;
        const cents = tx.type === "credit" ? tx.amount : -tx.amount;
        return (
          <CurrencyDisplay cents={cents} colored className="font-mono text-sm" />
        );
      },
    },
    {
      id: "actions",
      cell: ({ row }) => (
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setEditTarget(row.original)}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-destructive hover:text-destructive"
            onClick={() => setDeleteTarget(row.original)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ),
    },
  ];

  const table = useReactTable({
    data: transactions,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    manualSorting: true,
    manualPagination: true,
  });

  async function handleCreate(data: TransactionFormData) {
    try {
      await createTransaction(data);
      await mutate();
      setCreateOpen(false);
      toast.success("Transaction created");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create transaction");
      throw err;
    }
  }

  async function handleEdit(data: TransactionFormData) {
    if (!editTarget) return;
    try {
      await updateTransaction(editTarget._id, data);
      await mutate();
      setEditTarget(null);
      toast.success("Transaction updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update transaction");
      throw err;
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    await deleteTransaction(deleteTarget._id);
    await mutate();
    setDeleteTarget(null);
    toast.success("Transaction deleted");
  }

  const totalPages = pagination?.totalPages ?? 1;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Transactions"
        description="Track and manage all your financial transactions"
        action={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Transaction
          </Button>
        }
      />

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
          value={accountFilter}
          onValueChange={(v) => {
            setAccountFilter(v === "_all" ? "" : v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="All accounts" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">All accounts</SelectItem>
            {accounts.map((a) => (
              <SelectItem key={a._id} value={a._id}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

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
            <SelectItem value="credit">Income</SelectItem>
            <SelectItem value="debit">Expense</SelectItem>
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
            {categories.map((c) => (
              <SelectItem key={c._id} value={c.name}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <LoadingState variant="table" />
      ) : transactions.length === 0 ? (
        <EmptyState
          icon={ArrowRightLeft}
          title="No transactions found"
          description="No transactions match your current filters."
          action={{ label: "Add Transaction", onClick: () => setCreateOpen(true) }}
        />
      ) : (
        <>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map((hg) => (
                  <TableRow key={hg.id}>
                    {hg.headers.map((header) => (
                      <TableHead key={header.id}>
                        {header.isPlaceholder
                          ? null
                          : typeof header.column.columnDef.header === "function"
                          ? header.column.columnDef.header(header.getContext())
                          : header.column.columnDef.header}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {typeof cell.column.columnDef.cell === "function"
                          ? cell.column.columnDef.cell(cell.getContext())
                          : cell.getValue() as React.ReactNode}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
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
                Page {page} of {totalPages}
                {pagination && ` (${pagination.total} total)`}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => p - 1)}
                disabled={page <= 1}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= totalPages}
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Transaction</DialogTitle>
          </DialogHeader>
          <TransactionForm
            onSubmit={handleCreate}
            onCancel={() => setCreateOpen(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog
        open={!!editTarget}
        onOpenChange={(o) => !o && setEditTarget(null)}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Transaction</DialogTitle>
          </DialogHeader>
          {editTarget && (
            <TransactionForm
              defaultValues={{
                description: editTarget.description,
                amount: editTarget.amount / 100,
                date: editTarget.date,
                accountId: editTarget.accountId,
                type: editTarget.type,
                categoryTags: editTarget.categoryTags,
                isRecurring: editTarget.isRecurring,
                recurrenceRule: editTarget.recurrenceRule,
                notes: editTarget.notes,
              }}
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
        title="Delete transaction"
        description={`Delete "${deleteTarget?.description}"? This cannot be undone.`}
      />
    </div>
  );
}

export default function TransactionsPage() {
  return (
    <Suspense fallback={<div className="p-6"><LoadingState variant="table" /></div>}>
      <TransactionsContent />
    </Suspense>
  );
}
