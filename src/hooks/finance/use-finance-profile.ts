"use client";

import useSWR from "swr";
import { profileFromDollars, profileToDollars } from "@/lib/finance/finance-profile";
import type { FinanceProfileData } from "@/types/finance/datasheet";
import { fetcher, send } from "@/hooks/request";
import { FINANCE_SWR } from "@/hooks/finance/swr-options";

/** Datasheet profile, converted to cents for the calculation libs. */
export function useFinanceProfile() {
  const { data, error, isLoading, mutate } = useSWR("/api/finance-profile", fetcher, FINANCE_SWR);
  return {
    profile: data?.data ? profileFromDollars(data.data) : undefined,
    isLoading,
    isError: !!error,
    mutate,
  };
}

type ProfileWrite = { data: FinanceProfileData; updated: { salary: boolean; rent: boolean } };

export async function saveFinanceProfile(profile: FinanceProfileData) {
  return send<ProfileWrite>("/api/finance-profile", "PUT", profileToDollars(profile));
}

export async function mergeRent(keepId: string, mergeId: string) {
  return send<ProfileWrite>("/api/finance-profile/merge-rent", "POST", { keepId, mergeId });
}
