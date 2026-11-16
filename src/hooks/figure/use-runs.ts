"use client";

import useSWR from "swr";
import { fetcher, send } from "@/hooks/request";
import type { RunLog, RunLogFormData } from "@/types/figure/fitness";

export const RUNS_KEY = "/api/figure/runs";

export function useRuns() {
  const { data, error, isLoading, mutate } = useSWR<RunLog[]>(`${RUNS_KEY}?limit=500`, fetcher);
  return { runs: data ?? [], isLoading, isError: !!error, mutate };
}

export const createRun = (data: RunLogFormData) => send<RunLog>(RUNS_KEY, "POST", data);

export const updateRun = (id: string, data: RunLogFormData) =>
  send<RunLog>(`${RUNS_KEY}/${id}`, "PUT", data);

export const deleteRun = (id: string) => send(`${RUNS_KEY}/${id}`, "DELETE");
