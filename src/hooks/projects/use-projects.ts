"use client";

import useSWR from "swr";
import type { Project, ProjectFormData } from "@/types/projects/project";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function useProjects(status?: string) {
  const params = status ? `?status=${status}` : "";
  const { data, error, isLoading, mutate } = useSWR(`/api/projects${params}`, fetcher);
  return {
    projects: (data || []) as Project[],
    isLoading,
    isError: !!error,
    mutate,
  };
}

export function useProject(id: string) {
  const { data, error, isLoading, mutate } = useSWR(
    id ? `/api/projects/${id}` : null,
    fetcher
  );
  return {
    project: data as Project | undefined,
    isLoading,
    isError: !!error,
    mutate,
  };
}

export async function createProject(data: ProjectFormData) {
  const res = await fetch("/api/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to create project");
  }
  return res.json();
}

export async function updateProject(id: string, data: Partial<ProjectFormData>) {
  const res = await fetch(`/api/projects/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to update project");
  }
  return res.json();
}

export async function deleteProject(id: string) {
  const res = await fetch(`/api/projects/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to delete project");
  }
  return res.json();
}
