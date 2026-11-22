"use client";

import useSWR from "swr";
import type { Category } from "@/types/category";
import { fetcher } from "@/lib/fetcher";

export function useCategories() {
  const { data, error, isLoading, mutate } = useSWR("/api/finance/categories", fetcher);
  return {
    categories: (data?.data || []) as Category[],
    isLoading,
    isError: !!error,
    mutate,
  };
}
