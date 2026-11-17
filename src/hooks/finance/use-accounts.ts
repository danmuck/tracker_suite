"use client";

import useSWR from "swr";
import type { Account, AccountFormData } from "@/types/finance/account";
import { dollarsToCents } from "@/lib/finance/formatters";
import { fetcher, send } from "@/hooks/request";

export function useAccounts(
  type?: string,
  options: { includeArchived?: boolean } = {}
) {
  const search = new URLSearchParams();
  if (type) search.set("type", type);
  if (options.includeArchived) search.set("includeArchived", "true");
  const qs = search.toString();
  const { data, error, isLoading, mutate } = useSWR(
    `/api/accounts${qs ? `?${qs}` : ""}`,
    fetcher
  );
  return {
    accounts: (data || []) as Account[],
    isLoading,
    isError: !!error,
    mutate,
  };
}

export function useAccount(id: string) {
  const { data, error, isLoading, mutate } = useSWR(
    id ? `/api/accounts/${id}` : null,
    fetcher
  );
  return {
    account: data as Account | undefined,
    isLoading,
    isError: !!error,
    mutate,
  };
}

export async function createAccount(data: AccountFormData) {
  return send("/api/accounts", "POST", {
    ...data,
    balance: data.balance,
    creditLimit: data.creditLimit,
  });
}

export async function updateAccount(id: string, data: Partial<AccountFormData>) {
  return send(`/api/accounts/${id}`, "PUT", {
    ...data,
    balance: data.balance,
    creditLimit: data.creditLimit,
  });
}

export async function deleteAccount(id: string) {
  return send(`/api/accounts/${id}`, "DELETE");
}

export async function setAccountArchived(id: string, isArchived: boolean) {
  return send(`/api/accounts/${id}`, "PATCH", { isArchived });
}
