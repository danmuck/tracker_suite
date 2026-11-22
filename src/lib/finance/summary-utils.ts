import { getDaysInMonth } from "date-fns";
import { fromDateStr } from "./dates";

export interface DayTotals {
  date: string; // yyyy-MM-dd
  totalCredits: number;
  totalDebits: number;
}

export interface WeekBucket {
  label: string; // "8–14" (day range within the month)
  totalCredits: number;
  totalDebits: number;
}

/** Group a month's daily totals into 7-day buckets (1–7, 8–14, …), in date order. */
export function monthWeekBuckets(days: DayTotals[]): WeekBucket[] {
  const buckets = new Map<number, WeekBucket>();
  for (const d of [...days].sort((a, b) => a.date.localeCompare(b.date))) {
    const date = fromDateStr(d.date);
    const dayOfMonth = Number(d.date.slice(8, 10));
    const index = Math.floor((dayOfMonth - 1) / 7);
    let bucket = buckets.get(index);
    if (!bucket) {
      const start = index * 7 + 1;
      const end = Math.min(start + 6, getDaysInMonth(date));
      bucket = { label: `${start}–${end}`, totalCredits: 0, totalDebits: 0 };
      buckets.set(index, bucket);
    }
    bucket.totalCredits += d.totalCredits;
    bucket.totalDebits += d.totalDebits;
  }
  return [...buckets.values()];
}
