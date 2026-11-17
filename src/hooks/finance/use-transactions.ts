"use client";

import useSWR from "swr";
import type { Transaction, TransactionFormData } from "@/types/finance/transaction";
import type { TransactionFilters, PaginatedResponse } from "@/types/api";
import { fetcher, send } from "@/hooks/request";
import { FINANCE_SWR } from "@/hooks/finance/swr-options";

export function useTransactions(filters: TransactionFilters = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== "") {
      params.set(key, String(value));
    }
  });
  const queryString = params.toString();
  const url = `/api/transactions${queryString ? `?${queryString}` : ""}`;

  const { data, error, isLoading, mutate } = useSWR(url, fetcher, FINANCE_SWR);

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
    fetcher,
    FINANCE_SWR
  );
  return {
    transaction: data?.data as Transaction | undefined,
    isLoading,
    isError: !!error,
    mutate,
  };
}

export async function createTransaction(data: TransactionFormData) {
  return send("/api/transactions", "POST", data);
}

export async function updateTransaction(id: string, data: Partial<TransactionFormData>) {
  return send(`/api/transactions/${id}`, "PUT", data);
}

export async function deleteTransaction(id: string) {
  return send(`/api/transactions/${id}`, "DELETE");
}
