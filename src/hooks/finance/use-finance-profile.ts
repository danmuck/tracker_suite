"use client";

import useSWR from "swr";
import { profileFromDollars, profileToDollars } from "@/lib/finance/finance-profile";
import type { FinanceProfileData } from "@/types/finance/datasheet";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

/** Datasheet profile, converted to cents for the calculation libs. */
export function useFinanceProfile() {
  const { data, error, isLoading, mutate } = useSWR("/api/finance-profile", fetcher);
  return {
    profile: data?.data ? profileFromDollars(data.data) : undefined,
    isLoading,
    isError: !!error,
    mutate,
  };
}

async function send(url: string, method: string, body: unknown) {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Request failed");
  return json as { data: FinanceProfileData; updated: { salary: boolean; rent: boolean } };
}

export async function saveFinanceProfile(profile: FinanceProfileData) {
  return send("/api/finance-profile", "PUT", profileToDollars(profile));
}

export async function mergeRent(keepId: string, mergeId: string) {
  return send("/api/finance-profile/merge-rent", "POST", { keepId, mergeId });
}
