"use client";

import useSWR from "swr";
import { fetcher, send } from "@/hooks/request";
import type { ExerciseHistory, WorkoutLog, WorkoutLogFormData } from "@/types/figure/fitness";

export function useWorkoutLogs(params: { date?: string; limit?: number } = {}) {
  const qs = new URLSearchParams();
  if (params.date) qs.set("date", params.date);
  if (params.limit) qs.set("limit", String(params.limit));
  const { data, error, isLoading, mutate } = useSWR<WorkoutLog[]>(
    `/api/figure/workout-logs?${qs}`,
    fetcher
  );
  return { logs: data ?? [], isLoading, isError: !!error, mutate };
}

/** Most recent sets per exercise name (keyed lowercase), on or before `before` */
export function useExerciseHistory(names: string[], before?: string, excludeLogId?: string) {
  const qs = new URLSearchParams();
  [...new Set(names.map((n) => n.trim()).filter(Boolean))].sort().forEach((n) => qs.append("name", n));
  if (before) qs.set("before", before);
  if (excludeLogId) qs.set("excludeLogId", excludeLogId);
  const key = qs.has("name") ? `/api/figure/exercises/history?${qs}` : null;
  const { data, isLoading } = useSWR<Record<string, ExerciseHistory>>(key, fetcher, {
    keepPreviousData: true,
  });
  return { history: data ?? {}, isLoading };
}

export function useExerciseNames() {
  const { data } = useSWR<string[]>("/api/figure/exercises/names", fetcher);
  return data ?? [];
}

export const createWorkoutLog = (data: WorkoutLogFormData) =>
  send<WorkoutLog>("/api/figure/workout-logs", "POST", data);

export const updateWorkoutLog = (id: string, data: WorkoutLogFormData) =>
  send<WorkoutLog>(`/api/figure/workout-logs/${id}`, "PUT", data);

export const deleteWorkoutLog = (id: string) => send(`/api/figure/workout-logs/${id}`, "DELETE");
