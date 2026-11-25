"use client";

import useSWR from "swr";
import { fetcher } from "@/hooks/request";
import { NO_RETRY_ON_STATUS } from "@/hooks/swr-options";
import { apiPath } from "@/lib/edgectl/paths";
import type { Execution } from "@/types/edgectl/api";

export const executionKey = (commandId: string) => apiPath("executions", commandId);

/**
 * A command's execution record with its seed_result output, read by Mirage from the Ghost.
 * Pass "" to hold the request back (a command that has not run yet). Not polled: Mirage asks
 * the Ghost on every call, and a finished execution does not change.
 */
export function useExecution(commandId: string) {
  const { data, error, isLoading, mutate } = useSWR<Execution>(commandId ? executionKey(commandId) : null, fetcher, {
    ...NO_RETRY_ON_STATUS,
    revalidateOnFocus: false,
  });
  return { execution: data, isLoading, isError: !!error, error: error as unknown, mutate };
}
