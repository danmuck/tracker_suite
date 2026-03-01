"use client";

import useSWR from "swr";
import type { Task, TaskFormData } from "@/types/projects/task";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function useTasks(projectId: string) {
  const { data, error, isLoading, mutate } = useSWR(
    projectId ? `/api/tasks?projectId=${projectId}` : null,
    fetcher
  );
  return {
    tasks: (data || []) as Task[],
    isLoading,
    isError: !!error,
    mutate,
  };
}

export async function createTask(data: TaskFormData) {
  const res = await fetch("/api/tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to create task");
  }
  return res.json();
}

export async function updateTask(id: string, data: Partial<TaskFormData>) {
  const res = await fetch(`/api/tasks/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to update task");
  }
  return res.json();
}

export async function deleteTask(id: string) {
  const res = await fetch(`/api/tasks/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to delete task");
  }
  return res.json();
}

export async function reorderTask(id: string, data: { status: string; order: number }) {
  const res = await fetch(`/api/tasks/${id}/reorder`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to reorder task");
  }
  return res.json();
}
