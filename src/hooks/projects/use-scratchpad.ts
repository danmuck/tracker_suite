"use client";

import useSWR from "swr";
import { fetcher, send } from "@/hooks/request";
import { NO_RETRY_ON_STATUS } from "@/hooks/swr-options";
import type { Scratchpad } from "@/types/projects/scratchpad";

const scratchpadUrl = (projectId: string) => `/api/projects/${encodeURIComponent(projectId)}/scratchpad`;

export function useScratchpad(projectId: string) {
  const { data, error, isLoading, mutate } = useSWR<Scratchpad>(
    projectId ? scratchpadUrl(projectId) : null,
    fetcher,
    NO_RETRY_ON_STATUS
  );
  return {
    scratchpad: data,
    isLoading,
    isError: !!error,
    mutate,
  };
}

export const updateScratchpad = (projectId: string, content: string) =>
  send<Scratchpad>(scratchpadUrl(projectId), "PUT", { content });
