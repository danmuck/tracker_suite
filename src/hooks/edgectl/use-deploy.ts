"use client";

import useSWR from "swr";
import { fetcher, send } from "@/hooks/request";
import { NO_RETRY_ON_STATUS } from "@/hooks/swr-options";
import { apiPath } from "@/lib/edgectl/paths";
import type { DeployRequest, DeployResult, DeployTarget } from "@/types/edgectl/api";

/** The remote Ghosts Mirage is configured to deploy; read while `enabled` */
export function useDeployTargets(enabled: boolean) {
  const { data, error, isLoading } = useSWR<{ targets: DeployTarget[] }>(
    enabled ? apiPath("ghosts", "deploy-targets") : null,
    fetcher,
    NO_RETRY_ON_STATUS,
  );
  return { targets: data?.targets ?? [], hasData: data !== undefined, isLoading, isError: !!error };
}

// Not idempotent and takes minutes: one call per click, never retried.
export const deployGhost = (body: DeployRequest) => send<DeployResult>(apiPath("ghosts", "deploy"), "POST", body);
