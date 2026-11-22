"use client";

import useSWR from "swr";
import { fetcher, send } from "@/hooks/request";
import type { LinkItem, LinkFormData } from "@/types/links/link";

export function useLinks(groupId?: string) {
  const url = groupId ? `/api/links?groupId=${encodeURIComponent(groupId)}` : null;
  const { data, error, isLoading, mutate } = useSWR(url, fetcher);
  return {
    links: (data || []) as LinkItem[],
    isLoading,
    isError: !!error,
    mutate,
  };
}

export async function createLink(data: LinkFormData) {
  return send("/api/links", "POST", data);
}

export async function updateLink(id: string, data: LinkFormData) {
  return send(`/api/links/${encodeURIComponent(id)}`, "PUT", data);
}

export async function deleteLink(id: string) {
  return send(`/api/links/${encodeURIComponent(id)}`, "DELETE");
}
