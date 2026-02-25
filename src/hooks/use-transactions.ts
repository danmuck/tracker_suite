"use client";

import useSWR from "swr";
import type { Transaction, TransactionFormData } from "@/types/transaction";
import type { TransactionFilters, PaginatedResponse } from "@/types/api";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function useTransactions(filters: TransactionFilters = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== "") {
      params.set(key, String(value));
    }
  });
  const queryString = params.toString();
  const url = `/api/transactions${queryString ? `?${queryString}` : ""}`;

  const { data, error, isLoading, mutate } = useSWR(url, fetcher);

  return {
    transactions: (data?.data || []) as Transaction[],
    pagination: data?.pagination as PaginatedResponse<Transaction>["pagination"] | undefined,
    isLoading,
    isError: !!error,
    mutate,
  };
}

export function useTransaction(id: string) {
  const { data, error, isLoading, mutate } = useSWR(
    id ? `/api/transactions/${id}` : null,
    fetcher
  );
  return {
    transaction: data?.data as Transaction | undefined,
    isLoading,
    isError: !!error,
    mutate,
  };
}

export async function createTransaction(data: TransactionFormData) {
  const res = await fetch("/api/transactions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to create transaction");
  }
  return res.json();
}

export async function updateTransaction(id: string, data: Partial<TransactionFormData>) {
  const res = await fetch(`/api/transactions/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to update transaction");
  }
  return res.json();
}

export async function deleteTransaction(id: string) {
  const res = await fetch(`/api/transactions/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to delete transaction");
  }
  return res.json();
}
