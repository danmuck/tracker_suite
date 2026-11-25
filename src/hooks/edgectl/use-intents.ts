"use client";

import useSWR from "swr";
import { fetcher, send } from "@/hooks/request";
import { NO_RETRY_ON_STATUS } from "@/hooks/swr-options";
import { FAST_REFRESH_MS } from "@/hooks/edgectl/use-mirage";
import { apiPath } from "@/lib/edgectl/paths";
import type { IntentRef, IntentSnapshot, IntentSummary, Issue, Report } from "@/types/edgectl/api";

export const INTENTS_KEY = apiPath("intents");
export const intentKey = (intentId: string) => apiPath("intents", intentId);

export function useIntents() {
  const { data, error, isLoading, mutate } = useSWR<{ intents: IntentSummary[] }>(INTENTS_KEY, fetcher, {
    ...NO_RETRY_ON_STATUS,
    refreshInterval: FAST_REFRESH_MS,
  });
  return { intents: data?.intents ?? [], hasData: data !== undefined, isLoading, isError: !!error, mutate };
}

export function useIntent(intentId: string) {
  const { data, error, isLoading, mutate } = useSWR<IntentSnapshot>(intentId ? intentKey(intentId) : null, fetcher, {
    ...NO_RETRY_ON_STATUS,
    refreshInterval: FAST_REFRESH_MS,
  });
  return { intent: data, isLoading, isError: !!error, error: error as unknown, mutate };
}

/** Submits an `issue` to Mirage */
export const submitIssue = (issue: Issue) => send<IntentRef>(INTENTS_KEY, "POST", issue);

/** Makes Mirage run one pending command of the intent; answers with its `report` */
export const reconcileIntent = (intentId: string) => send<Report>(apiPath("intents", intentId, "reconcile"), "POST");
