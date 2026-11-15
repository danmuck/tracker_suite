"use client";

import useSWR from "swr";
import type { ProjectionResult, Granularity } from "@/types/finance/projection";
import { formatDateISO } from "@/lib/finance/formatters";
import { sandboxChangeCount, type SandboxState } from "@/hooks/finance/use-projection-sandbox";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

/** Sandbox projections are computed by POSTing the what-if changes; nothing is saved */
const sandboxFetcher = ([url, body]: [string, string]) =>
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  }).then((r) => r.json());

export function useProjections(
  startDate: Date,
  endDate: Date,
  granularity: Granularity,
  accountId?: string,
  sandbox?: SandboxState
) {
  const range = {
    startDate: formatDateISO(startDate),
    endDate: formatDateISO(endDate),
    granularity,
    ...(accountId ? { accountId } : {}),
  };
  const useSandbox = !!sandbox && sandboxChangeCount(sandbox) > 0;

  // Always loaded: it is the projection when the sandbox is empty, and the
  // fallback shown while a sandbox projection is still being calculated
  const real = useSWR(`/api/projections?${new URLSearchParams(range).toString()}`, fetcher);
  const whatIf = useSWR(
    useSandbox
      ? [
          "/api/projections",
          JSON.stringify({
            ...range,
            sandbox: { added: sandbox.added, edited: sandbox.edited, removed: sandbox.removed },
          }),
        ]
      : null,
    sandboxFetcher,
    { keepPreviousData: true }
  );
  const data = useSandbox ? whatIf.data ?? real.data : real.data;
  const error = useSandbox ? whatIf.error : real.error;
  const isLoading = !data && (real.isLoading || whatIf.isLoading);

  // Responses cached or served before the insight fields existed lack them; fill defaults
  const raw = data?.data as ProjectionResult | undefined;
  const projection: ProjectionResult | undefined = raw && {
    ...raw,
    summary: {
      ...raw.summary,
      lowestCash: raw.summary.lowestCash ?? null,
      payoffDates: raw.summary.payoffDates ?? {},
      interestCharged: raw.summary.interestCharged ?? 0,
      debtPayments: raw.summary.debtPayments ?? 0,
    },
  };

  return {
    projection,
    /** Fingerprint of the real data behind this projection */
    dataVersion: data?.dataVersion as string | undefined,
    isLoading,
    isError: !!error || !!data?.error,
  };
}
