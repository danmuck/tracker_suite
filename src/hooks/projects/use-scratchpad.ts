"use client";

import useSWR from "swr";
import type { Scratchpad } from "@/types/projects/scratchpad";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function useScratchpad(projectId: string) {
  const { data, error, isLoading, mutate } = useSWR(
    projectId ? `/api/projects/${projectId}/scratchpad` : null,
    fetcher
  );
  return {
    scratchpad: data as Scratchpad | undefined,
    isLoading,
    isError: !!error,
    mutate,
  };
}

export async function updateScratchpad(projectId: string, content: string) {
  const res = await fetch(`/api/projects/${projectId}/scratchpad`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to update scratchpad");
  }
  return res.json();
}
