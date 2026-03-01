"use client";

import useSWR from "swr";
import type { LinkGroup, LinkGroupFormData } from "@/types/links/link-group";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function useLinkGroups() {
  const { data, error, isLoading, mutate } = useSWR("/api/link-groups", fetcher);
  return {
    groups: (data || []) as LinkGroup[],
    isLoading,
    isError: !!error,
    mutate,
  };
}

export async function createLinkGroup(data: LinkGroupFormData) {
  const res = await fetch("/api/link-groups", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to create link group");
  }
  return res.json();
}

export async function updateLinkGroup(id: string, data: LinkGroupFormData) {
  const res = await fetch(`/api/link-groups/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to update link group");
  }
  return res.json();
}

export async function deleteLinkGroup(id: string) {
  const res = await fetch(`/api/link-groups/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to delete link group");
  }
  return res.json();
}
