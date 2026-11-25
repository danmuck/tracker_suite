"use client";

import useSWR from "swr";
import { fetcher } from "@/hooks/request";
import { NO_RETRY_ON_STATUS } from "@/hooks/swr-options";
import { SLOW_REFRESH_MS } from "@/hooks/edgectl/use-mirage";
import { apiPath } from "@/lib/edgectl/paths";
import type { GhostSeedCatalog } from "@/types/edgectl/api";

export const SEEDS_KEY = apiPath("seeds");

/** The Seed catalog of every Ghost. `enabled: false` holds the request back (a closed dialog). */
export function useSeeds(enabled = true) {
  const { data, error, isLoading, mutate } = useSWR<{ ghosts: GhostSeedCatalog[] }>(
    enabled ? SEEDS_KEY : null,
    fetcher,
    { ...NO_RETRY_ON_STATUS, refreshInterval: SLOW_REFRESH_MS },
  );
  return { catalogs: data?.ghosts ?? [], hasData: data !== undefined, isLoading, isError: !!error, mutate };
}
