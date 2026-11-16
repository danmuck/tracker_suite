"use client";

import useSWR from "swr";
import { fetcher, send } from "@/hooks/request";
import type { FutureSettings } from "@/types/future/apartments";

export const SETTINGS_KEY = "/api/future/settings";

export function useFutureSettings() {
  const { data, error, isLoading, mutate } = useSWR<FutureSettings>(SETTINGS_KEY, fetcher);
  return { settings: data ?? {}, isLoading, isError: !!error, mutate };
}

export const saveFutureSettings = (data: FutureSettings) => send<FutureSettings>(SETTINGS_KEY, "PUT", data);
