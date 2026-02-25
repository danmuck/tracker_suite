"use client";

import useSWR from "swr";
import type { Category } from "@/types/category";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function useCategories() {
  const { data, error, isLoading, mutate } = useSWR("/api/categories", fetcher);
  return {
    categories: (data?.data || []) as Category[],
    isLoading,
    isError: !!error,
    mutate,
  };
}
