export type ScheduleEntry = { effectiveDate: string; amount: number; source?: "rap" };

/** Manual entries plus generated RAP entries; a manual entry on the same date wins. Sorted by date. */
export function mergeRapEntries(manual: ScheduleEntry[], rap: ScheduleEntry[]): ScheduleEntry[] {
  const manualClean = manual.map(({ effectiveDate, amount }) => ({ effectiveDate, amount }));
  const taken = new Set(manualClean.map((e) => e.effectiveDate));
  return [
    ...manualClean,
    ...rap.filter((e) => !taken.has(e.effectiveDate)).map((e) => ({ ...e, source: "rap" as const })),
  ].sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));
}
