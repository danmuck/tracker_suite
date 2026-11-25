"use client";

import useSWR from "swr";
import { fetcher } from "@/hooks/request";
import { NO_RETRY_ON_STATUS } from "@/hooks/swr-options";
import { FAST_REFRESH_MS } from "@/hooks/edgectl/use-mirage";
import { apiPath } from "@/lib/edgectl/paths";
import type { ActivityKind, ActivityRecord } from "@/types/edgectl/api";

/** Mirage's recent audit or custody records, oldest first as Mirage returns them */
export function useActivity(kind: ActivityKind, limit: number) {
  const { data, error, isLoading } = useSWR<{ records: ActivityRecord[] }>(
    `${apiPath("activity")}?kind=${kind}&limit=${limit}`,
    fetcher,
    { ...NO_RETRY_ON_STATUS, refreshInterval: FAST_REFRESH_MS },
  );
  return { records: data?.records ?? [], hasData: data !== undefined, isLoading, isError: !!error };
}
