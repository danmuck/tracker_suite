"use client";

import useSWR from "swr";
import { fetcher, send } from "@/hooks/request";
import { NO_RETRY_ON_STATUS } from "@/hooks/swr-options";
import type { RunLog, RunLogFormData } from "@/types/figure/fitness";

export const RUNS_KEY = "/api/figure/runs";

export function useRuns() {
  const { data, error, isLoading, mutate } = useSWR<RunLog[]>(`${RUNS_KEY}?limit=500`, fetcher, NO_RETRY_ON_STATUS);
  return {
    runs: data ?? [],
    // SWR keeps the last list when a background refresh fails: isError can be true with data to show
    hasData: data !== undefined,
    isLoading,
    isError: !!error,
    mutate,
  };
}

export const createRun = (data: RunLogFormData) => send<RunLog>(RUNS_KEY, "POST", data);

export const updateRun = (id: string, data: RunLogFormData) =>
  send<RunLog>(`${RUNS_KEY}/${id}`, "PUT", data);

export const deleteRun = (id: string) => send(`${RUNS_KEY}/${id}`, "DELETE");
