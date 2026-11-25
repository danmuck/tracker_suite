"use client";

import useSWR from "swr";
import { fetcher, send } from "@/hooks/request";
import { NO_RETRY_ON_STATUS } from "@/hooks/swr-options";
import { FAST_REFRESH_MS } from "@/hooks/edgectl/use-mirage";
import { apiPath } from "@/lib/edgectl/paths";
import type { DependencyProposal, IntentPreview, PreparedApproval } from "@/types/edgectl/api";

export const PROPOSALS_KEY = apiPath("dependencies", "proposals");
export const proposalKey = (id: string) => apiPath("dependencies", "proposals", id);

export function useProposals() {
  const { data, error, isLoading } = useSWR<{ proposals: DependencyProposal[] }>(PROPOSALS_KEY, fetcher, {
    ...NO_RETRY_ON_STATUS,
    refreshInterval: FAST_REFRESH_MS,
  });
  return { proposals: data?.proposals ?? [], hasData: data !== undefined, isLoading, isError: !!error };
}

export function useProposal(id: string) {
  const { data, error, isLoading } = useSWR<DependencyProposal>(id ? proposalKey(id) : null, fetcher, {
    ...NO_RETRY_ON_STATUS,
    refreshInterval: FAST_REFRESH_MS,
  });
  return { proposal: data, isLoading, error: error as unknown };
}

interface Selection {
  ghost_id: string;
  seed_ids: string[];
}

/** What a proposal would install. Signs nothing. */
export const previewIntent = (body: Selection) => send<IntentPreview>(apiPath("dependencies", "intent"), "POST", body);

/** Signs the intent as the operator and records a pending proposal in Mirage */
export const proposeDependencies = (body: Selection) => send<DependencyProposal>(PROPOSALS_KEY, "POST", body);

/** Step one of approving: the server builds the payload and answers with its digest. Signs nothing. */
export const prepareApproval = (id: string) =>
  send<PreparedApproval>(apiPath("dependencies", "proposals", id, "approval"), "POST");

/** Step two: sign the prepared payload as the second operator, only if `digest` is the one shown */
export const approveProposal = (id: string, digest: string) =>
  send<DependencyProposal>(apiPath("dependencies", "proposals", id, "approve"), "POST", { digest });

/** Installs the approved steps on the Ghost's host. One call per confirmation; never retried. */
export const executeProposal = (id: string) =>
  send<DependencyProposal>(apiPath("dependencies", "proposals", id, "execute"), "POST", { confirm: id });
