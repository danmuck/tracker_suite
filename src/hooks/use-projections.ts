"use client";

import useSWR from "swr";
import type { ProjectionResult, Granularity } from "@/types/projection";
import { formatDateISO } from "@/lib/formatters";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

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
    `/api/projections?${params.toString()}`,
    fetcher
  );

  return {
    projection: data?.data as ProjectionResult | undefined,
    isLoading,
    isError: !!error,
  };
}
