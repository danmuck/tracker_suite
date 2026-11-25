"use client";

import useSWR from "swr";
import { fetcher } from "@/hooks/request";
import { NO_RETRY_ON_STATUS } from "@/hooks/swr-options";
import { FAST_REFRESH_MS } from "@/hooks/edgectl/use-mirage";
import { apiPath } from "@/lib/edgectl/paths";
import type { GhostEvent, GhostStatus, VerificationRecord } from "@/types/edgectl/api";

// One Ghost, read through Mirage. Each read is one call from Mirage to that Ghost.

export function useGhostStatus(ghostId: string) {
  const { data, error, isLoading } = useSWR<GhostStatus>(ghostId ? apiPath("ghosts", ghostId, "status") : null, fetcher, {
    ...NO_RETRY_ON_STATUS,
    refreshInterval: FAST_REFRESH_MS,
  });
  return { status: data, isLoading, error: error as unknown };
}

export function useGhostEvents(ghostId: string, limit: number) {
  const { data, error, isLoading } = useSWR<{ events: GhostEvent[] }>(
    ghostId ? `${apiPath("ghosts", ghostId, "events")}?limit=${limit}` : null,
    fetcher,
    { ...NO_RETRY_ON_STATUS, refreshInterval: FAST_REFRESH_MS },
  );
  return { events: data?.events ?? [], hasData: data !== undefined, isLoading, isError: !!error };
}

export function useGhostVerification(ghostId: string, limit: number) {
  const { data, error, isLoading } = useSWR<{ records: VerificationRecord[] }>(
    ghostId ? `${apiPath("ghosts", ghostId, "verification")}?limit=${limit}` : null,
    fetcher,
    { ...NO_RETRY_ON_STATUS, refreshInterval: FAST_REFRESH_MS },
  );
  return { records: data?.records ?? [], hasData: data !== undefined, isLoading, isError: !!error };
}
