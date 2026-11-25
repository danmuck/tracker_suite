"use client";

import useSWR from "swr";
import { fetcher } from "@/hooks/request";
import { NO_RETRY_ON_STATUS } from "@/hooks/swr-options";
import { FAST_REFRESH_MS } from "@/hooks/edgectl/use-mirage";
import { apiPath } from "@/lib/edgectl/paths";
import type { Report } from "@/types/edgectl/api";

export const REPORTS_KEY = apiPath("reports");

/** Recent reports as Mirage returns them; `limit` absent uses Mirage's default */
export function useReports(limit?: number) {
  const key = limit ? `${REPORTS_KEY}?limit=${limit}` : REPORTS_KEY;
  const { data, error, isLoading, mutate } = useSWR<{ reports: Report[] }>(key, fetcher, {
    ...NO_RETRY_ON_STATUS,
    refreshInterval: FAST_REFRESH_MS,
  });
  return { reports: data?.reports ?? [], hasData: data !== undefined, isLoading, isError: !!error, mutate };
}
