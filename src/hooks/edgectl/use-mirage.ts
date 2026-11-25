"use client";

import useSWR from "swr";
import { fetcher } from "@/hooks/request";
import { NO_RETRY_ON_STATUS } from "@/hooks/swr-options";
import { apiPath } from "@/lib/edgectl/paths";
import type { ConnectionState } from "@/types/edgectl/api";

export const STATUS_KEY = apiPath("status");

/** Cheap reads (Mirage's own memory): status, intents, reports */
export const FAST_REFRESH_MS = 5_000;
/** Reads that make Mirage probe every Ghost: Ghosts, Seeds */
export const SLOW_REFRESH_MS = 15_000;

/** Whether this app's server can reach Mirage, and Mirage's status when it can */
export function useMirage() {
  const { data, error, isLoading, mutate } = useSWR<ConnectionState>(STATUS_KEY, fetcher, {
    ...NO_RETRY_ON_STATUS,
    refreshInterval: FAST_REFRESH_MS,
  });
  return {
    connection: data,
    status: data?.state === "ok" ? data.status : undefined,
    isLoading,
    // This app's own server did not answer: not the same as Mirage being unreachable
    isError: !!error && data === undefined,
    mutate,
  };
}

/** SWR key filter: every edgectl read. Pass to SWR's global `mutate` after a change in Mirage. */
export const isEdgectlKey = (key: unknown) => typeof key === "string" && key.startsWith(apiPath());
