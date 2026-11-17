// Which projection response the projections hook shows. Pure.

export interface ProjectionSources<T> {
  /** The sandbox has changes, so the what-if projection is the one asked for */
  useSandbox: boolean;
  realData: T | undefined;
  realError: unknown;
  /** With keepPreviousData: the previous what-if response while a new one is in flight */
  whatIfData: T | undefined;
  whatIfError: unknown;
  /** Either request is loading */
  loading: boolean;
}

/**
 * Sandbox off: the real projection. Sandbox on: the what-if projection, the previous one while a
 * new one is in flight, or the real one until the first arrives. A rejected what-if shows no
 * projection at all (as when the error response arrived as data without a `data` property),
 * never an earlier what-if or the real one, which would not match the sandbox on screen.
 */
export function pickProjection<T>(s: ProjectionSources<T>): {
  data: T | undefined;
  isLoading: boolean;
  isError: boolean;
} {
  if (s.useSandbox && s.whatIfError) return { data: undefined, isLoading: false, isError: true };
  const data = s.useSandbox ? s.whatIfData ?? s.realData : s.realData;
  const error = s.useSandbox ? s.whatIfError : s.realError;
  return { data, isLoading: !data && s.loading, isError: !!error };
}
