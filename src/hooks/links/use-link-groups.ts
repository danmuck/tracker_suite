"use client";

import useSWR from "swr";
import { fetcher, send } from "@/hooks/request";
import type { LinkGroup, LinkGroupFormData } from "@/types/links/link-group";

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
  return send("/api/link-groups", "POST", data);
}

export async function updateLinkGroup(id: string, data: LinkGroupFormData) {
  return send(`/api/link-groups/${encodeURIComponent(id)}`, "PUT", data);
}

export async function deleteLinkGroup(id: string) {
  return send(`/api/link-groups/${encodeURIComponent(id)}`, "DELETE");
}
