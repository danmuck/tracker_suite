"use client";

import useSWR from "swr";
import { fetcher } from "@/hooks/request";
import { NO_RETRY_ON_STATUS } from "@/hooks/swr-options";
import { SLOW_REFRESH_MS } from "@/hooks/edgectl/use-mirage";
import { apiPath } from "@/lib/edgectl/paths";
import type { Route, Service } from "@/types/edgectl/api";

// Both make Mirage probe every Ghost: polled at the slow rate.

export function useRouting() {
  const { data, error, isLoading } = useSWR<{ routes: Route[] }>(apiPath("routing"), fetcher, {
    ...NO_RETRY_ON_STATUS,
    refreshInterval: SLOW_REFRESH_MS,
  });
  return { routes: data?.routes ?? [], hasData: data !== undefined, isLoading, isError: !!error };
}

export function useServices() {
  const { data, error, isLoading } = useSWR<{ services: Service[] }>(apiPath("services"), fetcher, {
    ...NO_RETRY_ON_STATUS,
    refreshInterval: SLOW_REFRESH_MS,
  });
  return { services: data?.services ?? [], hasData: data !== undefined, isLoading, isError: !!error };
}
