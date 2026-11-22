// The transactions page's paging read from its URL, clamped to values the list API accepts, so a
// hand-edited `?page=` or `?limit=` never turns into a 400. Pure: browser-reachable.

/** Page sizes the transactions page offers */
export const LIMIT_OPTIONS = [10, 25, 50, 100] as const;
export const DEFAULT_LIMIT = 25;

/** `?page=`: a whole number ≥ 1, else 1. */
export function pageFromParam(raw: string | null): number {
  if (raw === null || !/^\d+$/.test(raw)) return 1;
  const page = Number(raw);
  return Number.isSafeInteger(page) && page >= 1 ? page : 1;
}

/** `?limit=`: one of LIMIT_OPTIONS, else the default. */
export function limitFromParam(raw: string | null): number {
  const limit = raw !== null && /^\d+$/.test(raw) ? Number(raw) : NaN;
  return (LIMIT_OPTIONS as readonly number[]).includes(limit) ? limit : DEFAULT_LIMIT;
}
