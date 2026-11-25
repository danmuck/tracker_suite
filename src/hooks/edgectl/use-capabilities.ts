"use client";

import useSWR from "swr";
import { fetcher } from "@/hooks/request";
import { NO_RETRY_ON_STATUS } from "@/hooks/swr-options";
import { apiPath } from "@/lib/edgectl/paths";
import type { Capabilities } from "@/types/edgectl/api";

/** Which features that need server configuration are usable. Changes only when the server's environment does. */
export function useCapabilities() {
  const { data, isLoading } = useSWR<Capabilities>(apiPath("capabilities"), fetcher, {
    ...NO_RETRY_ON_STATUS,
    revalidateOnFocus: false,
  });
  return { capabilities: data, isLoading };
}
