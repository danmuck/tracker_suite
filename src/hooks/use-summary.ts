"use client";

import useSWR from "swr";
import type { SummaryResult, SummaryView } from "@/types/summary";
import { formatDateISO } from "@/lib/formatters";
import { fetcher } from "@/lib/fetcher";

export function useSummary(view: SummaryView, date: Date, accountId?: string) {
  const params = new URLSearchParams({
    view,
    date: formatDateISO(date),
  });
  if (accountId) params.set("accountId", accountId);

  const { data, error, isLoading } = useSWR(
    `/api/finance/summary?${params.toString()}`,
    fetcher
  );

  return {
    summary: data?.data as SummaryResult | undefined,
    isLoading,
    isError: !!error,
  };
}
