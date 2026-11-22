"use client";

import useSWR from "swr";
import type { ProjectionResult, Granularity } from "@/types/projection";
import { formatDateISO } from "@/lib/formatters";
import { fetcher } from "@/lib/fetcher";

export function useProjections(
  startDate: Date,
  endDate: Date,
  granularity: Granularity,
  accountId?: string
) {
  const params = new URLSearchParams({
    startDate: formatDateISO(startDate),
    endDate: formatDateISO(endDate),
    granularity,
  });
  if (accountId) params.set("accountId", accountId);

  const { data, error, isLoading } = useSWR(
    `/api/finance/projections?${params.toString()}`,
    fetcher
  );

  return {
    projection: data?.data as ProjectionResult | undefined,
    isLoading,
    isError: !!error,
  };
}
