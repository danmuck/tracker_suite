"use client";

import useSWR from "swr";
import type { Account, AccountFormData } from "@/types/account";
import { dollarsToCents } from "@/lib/formatters";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function useAccounts(type?: string) {
  const params = type ? `?type=${type}` : "";
  const { data, error, isLoading, mutate } = useSWR(`/api/accounts${params}`, fetcher);
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
  const res = await fetch("/api/accounts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...data,
      balance: data.balance,
      creditLimit: data.creditLimit,
    }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to create account");
  }
  return res.json();
}

export async function updateAccount(id: string, data: Partial<AccountFormData>) {
  const res = await fetch(`/api/accounts/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...data,
      balance: data.balance,
      creditLimit: data.creditLimit,
    }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to update account");
  }
  return res.json();
}

export async function deleteAccount(id: string) {
  const res = await fetch(`/api/accounts/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to delete account");
  }
  return res.json();
}
