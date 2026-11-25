"use client";

import useSWR from "swr";
import { fetcher, send } from "@/hooks/request";
import { NO_RETRY_ON_STATUS } from "@/hooks/swr-options";
import { SLOW_REFRESH_MS } from "@/hooks/edgectl/use-mirage";
import { apiPath } from "@/lib/edgectl/paths";
import type { AttachRequest, Ghost, GhostRouteRef, SpawnRequest, SpawnResult } from "@/types/edgectl/api";

export const GHOSTS_KEY = apiPath("ghosts");

export function useGhosts() {
  const { data, error, isLoading, mutate } = useSWR<{ ghosts: Ghost[] }>(GHOSTS_KEY, fetcher, {
    ...NO_RETRY_ON_STATUS,
    refreshInterval: SLOW_REFRESH_MS,
  });
  return { ghosts: data?.ghosts ?? [], hasData: data !== undefined, isLoading, isError: !!error, mutate };
}

// Neither is idempotent in Mirage: call once per click, never retry.
export const attachGhost = (body: AttachRequest) => send<GhostRouteRef>(apiPath("ghosts", "attach"), "POST", body);
export const spawnLocalGhost = (body: SpawnRequest) =>
  send<SpawnResult>(apiPath("ghosts", "spawn-local"), "POST", body);
