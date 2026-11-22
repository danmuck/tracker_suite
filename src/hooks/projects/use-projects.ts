"use client";

import useSWR from "swr";
import { fetcher, send } from "@/hooks/request";
import { NO_RETRY_ON_STATUS } from "@/hooks/swr-options";
import type { Project, ProjectFormData } from "@/types/projects/project";

export const PROJECTS_KEY = "/api/projects";

export function useProjects(status?: string) {
  const params = status ? `?status=${status}` : "";
  const { data, error, isLoading, mutate } = useSWR<Project[]>(`${PROJECTS_KEY}${params}`, fetcher, NO_RETRY_ON_STATUS);
  return {
    projects: data ?? [],
    // SWR keeps the last list when a background refresh fails: isError can be true with data to show
    hasData: data !== undefined,
    isLoading,
    isError: !!error,
    mutate,
  };
}

export function useProject(id: string) {
  const { data, error, isLoading, mutate } = useSWR<Project>(
    id ? `${PROJECTS_KEY}/${encodeURIComponent(id)}` : null,
    fetcher,
    NO_RETRY_ON_STATUS
  );
  return {
    project: data,
    isLoading,
    isError: !!error,
    error: error as unknown,
    mutate,
  };
}

export const createProject = (data: ProjectFormData) => send<Project>(PROJECTS_KEY, "POST", data);
export const updateProject = (id: string, data: Partial<ProjectFormData>) =>
  send<Project>(`${PROJECTS_KEY}/${encodeURIComponent(id)}`, "PUT", data);
export const deleteProject = (id: string) => send(`${PROJECTS_KEY}/${encodeURIComponent(id)}`, "DELETE");
