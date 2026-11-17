"use client";

import useSWR from "swr";
import { fetcher } from "@/hooks/request";
import { FINANCE_SWR } from "@/hooks/finance/swr-options";
import type { Category } from "@/types/finance/category";


export function useCategories() {
  const { data, error, isLoading, mutate } = useSWR("/api/categories", fetcher, FINANCE_SWR);
  return {
    categories: (data?.data || []) as Category[],
    isLoading,
    isError: !!error,
    mutate,
  };
}
