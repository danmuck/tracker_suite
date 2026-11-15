"use client";

import useSWR from "swr";
import type { ProjectionResult, Granularity } from "@/types/finance/projection";
import { formatDateISO } from "@/lib/finance/formatters";

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

  // Responses cached or served before the insight fields existed lack them; fill defaults
  const raw = data?.data as ProjectionResult | undefined;
  const projection: ProjectionResult | undefined = raw && {
    ...raw,
    summary: {
      ...raw.summary,
      lowestCash: raw.summary.lowestCash ?? null,
      payoffDates: raw.summary.payoffDates ?? {},
      interestCharged: raw.summary.interestCharged ?? 0,
      debtPayments: raw.summary.debtPayments ?? 0,
    },
  };

  return {
    projection,
    isLoading,
    isError: !!error,
  };
}
