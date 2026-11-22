"use client";

import useSWR from "swr";
import { fetcher, send } from "@/hooks/request";
import { NO_RETRY_ON_STATUS } from "@/hooks/swr-options";
import type { Task, TaskFormData, TaskStatus } from "@/types/projects/task";

const TASKS_KEY = "/api/tasks";

export function useTasks(projectId: string) {
  const { data, error, isLoading, mutate } = useSWR<Task[]>(
    projectId ? `${TASKS_KEY}?projectId=${encodeURIComponent(projectId)}` : null,
    fetcher,
    NO_RETRY_ON_STATUS
  );
  return {
    tasks: data ?? [],
    // SWR keeps the last list when a background refresh fails: isError can be true with data to show
    hasData: data !== undefined,
    isLoading,
    isError: !!error,
    mutate,
  };
}

export const createTask = (data: TaskFormData) => send<Task>(TASKS_KEY, "POST", data);
export const updateTask = (id: string, data: Partial<TaskFormData>) => send<Task>(`${TASKS_KEY}/${encodeURIComponent(id)}`, "PUT", data);
export const deleteTask = (id: string) => send(`${TASKS_KEY}/${encodeURIComponent(id)}`, "DELETE");
export const reorderTask = (id: string, data: { status: TaskStatus; order: number }) =>
  send<Task>(`${TASKS_KEY}/${encodeURIComponent(id)}/reorder`, "PATCH", data);
