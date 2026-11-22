export type ScheduleEntry = { effectiveDate: string; amount: number; source?: "rap" };

/**
 * Manual entries plus generated RAP entries; a manual entry on the same date wins,
 * and RAP entries that repeat the amount already in effect are dropped. Sorted by date.
 */
export function mergeRapEntries(manual: ScheduleEntry[], rap: ScheduleEntry[]): ScheduleEntry[] {
  const manualClean = manual.map(({ effectiveDate, amount }) => ({ effectiveDate, amount }));
  const taken = new Set(manualClean.map((e) => e.effectiveDate));
  const merged: ScheduleEntry[] = [
    ...manualClean,
    ...rap.filter((e) => !taken.has(e.effectiveDate)).map((e) => ({ ...e, source: "rap" as const })),
  ].sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));
  // A generated entry that repeats the amount already in effect changes nothing
  return merged.filter((e, i) => !(e.source === "rap" && i > 0 && merged[i - 1].amount === e.amount));
}
