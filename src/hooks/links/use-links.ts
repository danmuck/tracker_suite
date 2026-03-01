"use client";

import useSWR from "swr";
import type { LinkItem, LinkFormData } from "@/types/links/link";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function useLinks(groupId?: string) {
  const url = groupId ? `/api/links?groupId=${groupId}` : null;
  const { data, error, isLoading, mutate } = useSWR(url, fetcher);
  return {
    links: (data || []) as LinkItem[],
    isLoading,
    isError: !!error,
    mutate,
  };
}

export async function createLink(data: LinkFormData) {
  const res = await fetch("/api/links", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to create link");
  }
  return res.json();
}

export async function updateLink(id: string, data: LinkFormData) {
  const res = await fetch(`/api/links/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to update link");
  }
  return res.json();
}

export async function deleteLink(id: string) {
  const res = await fetch(`/api/links/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to delete link");
  }
  return res.json();
}
