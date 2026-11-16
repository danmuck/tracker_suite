"use client";

import useSWR from "swr";
import { fetcher } from "@/hooks/request";
import { todayDay } from "@/lib/figure/format";
import type { ExerciseProgressPoint, FitnessStats } from "@/lib/figure/stats";

export function useFitnessStats(weeks: number) {
  const { data, error, isLoading } = useSWR<FitnessStats>(
    `/api/figure/stats?weeks=${weeks}&today=${todayDay()}`,
    fetcher,
    { keepPreviousData: true }
  );
  return { stats: data, isLoading, isError: !!error };
}

export function useExerciseProgress(name: string | null, startDate?: string) {
  const qs = new URLSearchParams();
  if (name) qs.set("name", name);
  if (startDate) qs.set("startDate", startDate);
  const { data, isLoading } = useSWR<ExerciseProgressPoint[]>(
    name ? `/api/figure/exercises/progress?${qs}` : null,
    fetcher,
    { keepPreviousData: true }
  );
  return { points: data ?? [], isLoading };
}
