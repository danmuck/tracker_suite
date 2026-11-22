"use client";

import useSWR from "swr";
import { fetcher } from "@/hooks/request";
import { FINANCE_SWR } from "@/hooks/finance/swr-options";
import type { SummaryResult, SummaryView } from "@/types/finance/summary";
import { formatDateISO } from "@/lib/finance/formatters";


export function useSummary(view: SummaryView, date: Date, accountId?: string) {
  const params = new URLSearchParams({
    view,
    date: formatDateISO(date),
  });
  if (accountId) params.set("accountId", accountId);

  const { data, error, isLoading } = useSWR(
    `/api/summary?${params.toString()}`,
    fetcher,
    FINANCE_SWR
  );

  return {
    summary: data?.data as SummaryResult | undefined,
    isLoading,
    isError: !!error,
  };
}
