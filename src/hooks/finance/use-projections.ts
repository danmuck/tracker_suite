"use client";

import useSWR from "swr";
import type { ProjectionResult, Granularity } from "@/types/finance/projection";
import { formatDateISO } from "@/lib/finance/formatters";
import { profileToDollars } from "@/lib/finance/finance-profile";
import { fetcher, send } from "@/hooks/request";
import { FINANCE_SWR } from "@/hooks/finance/swr-options";
import { pickProjection } from "@/hooks/finance/pick-projection";
import { sandboxChangeCount, type SandboxState } from "@/hooks/finance/use-projection-sandbox";

/** Sandbox projections are computed by POSTing the what-if changes; nothing is saved */
const sandboxFetcher = ([url, body]: [string, string]) => send(url, "POST", JSON.parse(body));

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
  const real = useSWR(`/api/projections?${new URLSearchParams(range).toString()}`, fetcher, FINANCE_SWR);
  const whatIf = useSWR(
    useSandbox
      ? [
          "/api/projections",
          JSON.stringify({
            ...range,
            sandbox: {
              added: sandbox.added,
              edited: sandbox.edited,
              removed: sandbox.removed,
              // The API takes Datasheet money in dollars
              profile: sandbox.profile ? profileToDollars(sandbox.profile) : null,
            },
          }),
        ]
      : null,
    sandboxFetcher,
    { ...FINANCE_SWR, keepPreviousData: true }
  );
  // A rejected what-if (e.g. a Datasheet the server refuses) shows no projection, not an
  // earlier what-if or the real one: see pickProjection
  const { data, isLoading, isError } = pickProjection({
    useSandbox,
    realData: real.data,
    realError: real.error,
    whatIfData: whatIf.data,
    whatIfError: whatIf.error,
    loading: real.isLoading || whatIf.isLoading,
  });

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
    // Taken from the real-data request, which is refreshed whenever real data changes
    dataVersion: real.data?.dataVersion as string | undefined,
    isLoading,
    isError,
  };
}
