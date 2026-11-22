// Which projection response the projections hook shows. Pure.

/** What the most recently settled what-if request left behind, whatever sandbox state it was for */
export interface WhatIfHistory<T> {
  /** The last successfully loaded what-if response */
  data: T | undefined;
  /** The most recently settled what-if request ended in an error (HTTP or network) */
  failed: boolean;
}

export const NO_WHAT_IF: WhatIfHistory<never> = { data: undefined, failed: false };

export const whatIfSucceeded = <T>(data: T): WhatIfHistory<T> => ({ data, failed: false });
export const whatIfFailed = <T>(prev: WhatIfHistory<T>): WhatIfHistory<T> => ({ data: prev.data, failed: true });

export interface ProjectionSources<T> {
  /** The sandbox has changes, so the what-if projection is the one asked for */
  useSandbox: boolean;
  realData: T | undefined;
  realError: unknown;
  /** Data for the CURRENT sandbox state's request only (no keepPreviousData) */
  whatIfData: T | undefined;
  /** The current sandbox state's request error */
  whatIfError: unknown;
  lastWhatIf: WhatIfHistory<T>;
  /** Either request is loading */
  loading: boolean;
}

/**
 * Sandbox off: the real projection. Sandbox on, never showing a projection of another sandbox
 * state right after a failure:
 * - data for the current state: shown, even when its latest revalidation failed;
 * - else the current state's request failed: nothing;
 * - else (still in flight): nothing if the last settled what-if failed, otherwise the last
 *   successful what-if, otherwise the real projection.
 */
export function pickProjection<T>(s: ProjectionSources<T>): {
  data: T | undefined;
  isLoading: boolean;
  isError: boolean;
} {
  if (!s.useSandbox) {
    return { data: s.realData, isLoading: !s.realData && s.loading, isError: !!s.realError };
  }
  if (s.whatIfData !== undefined) return { data: s.whatIfData, isLoading: false, isError: !!s.whatIfError };
  if (s.whatIfError || s.lastWhatIf.failed) return { data: undefined, isLoading: false, isError: true };
  const data = s.lastWhatIf.data ?? s.realData;
  return { data, isLoading: !data && s.loading, isError: false };
}
