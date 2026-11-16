"use client";

import useSWR from "swr";
import { fetcher, send } from "@/hooks/request";
import type { Workout, WorkoutFormData } from "@/types/figure/fitness";

export function useWorkouts() {
  const { data, error, isLoading, mutate } = useSWR<Workout[]>("/api/figure/workouts", fetcher);
  return { workouts: data ?? [], isLoading, isError: !!error, mutate };
}

export const createWorkout = (data: WorkoutFormData) =>
  send<Workout>("/api/figure/workouts", "POST", data);

export const updateWorkout = (id: string, data: WorkoutFormData) =>
  send<Workout>(`/api/figure/workouts/${id}`, "PUT", data);

export const deleteWorkout = (id: string) => send(`/api/figure/workouts/${id}`, "DELETE");
