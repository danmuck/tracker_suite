"use client";

import useSWR from "swr";
import { fetcher, send } from "@/hooks/request";
import { NO_RETRY_ON_STATUS } from "@/hooks/swr-options";
import type { Workout, WorkoutFormData } from "@/types/figure/fitness";

export function useWorkouts() {
  const { data, error, isLoading, mutate } = useSWR<Workout[]>("/api/figure/workouts", fetcher, NO_RETRY_ON_STATUS);
  return {
    workouts: data ?? [],
    // SWR keeps the last list when a background refresh fails: isError can be true with data to show
    hasData: data !== undefined,
    isLoading,
    isError: !!error,
    mutate,
  };
}

export const createWorkout = (data: WorkoutFormData) =>
  send<Workout>("/api/figure/workouts", "POST", data);

export const updateWorkout = (id: string, data: WorkoutFormData) =>
  send<Workout>(`/api/figure/workouts/${id}`, "PUT", data);

export const deleteWorkout = (id: string) => send(`/api/figure/workouts/${id}`, "DELETE");
