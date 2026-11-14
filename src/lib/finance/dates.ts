import { addDays, format, getDay, getDaysInMonth } from "date-fns";

/**
 * Calendar-date helpers.
 *
 * Transaction dates are calendar dates stored at UTC midnight (the form sends
 * `yyyy-MM-dd`). Interpreting them with local-time date-fns functions on a
 * server west of UTC shifts them back a day, so all date math goes through
 * `yyyy-MM-dd` strings and noon-UTC Date objects, which land on the same
 * calendar day in any timezone from UTC-11 to UTC+11.
 */

/** UTC calendar date (yyyy-MM-dd) of a stored date or ISO string. */
export function toDateStr(d: Date | string): string {
  return new Date(d).toISOString().slice(0, 10);
}

/** Noon-UTC Date for a yyyy-MM-dd string; safe for local date-fns math. */
export function fromDateStr(s: string): Date {
  return new Date(s.slice(0, 10) + "T12:00:00.000Z");
}

/** Re-anchor any stored date to noon UTC on its calendar day. */
export function normalizeDate(d: Date | string): Date {
  return fromDateStr(toDateStr(d));
}

/** The user's current calendar day (local time), as yyyy-MM-dd. */
export function localTodayStr(): string {
  return format(new Date(), "yyyy-MM-dd");
}

export interface DateRangeStr {
  startStr: string;
  endStr: string;
}

/** First and last day of the month containing `dateStr`. */
export function monthBounds(dateStr: string): DateRangeStr {
  const ym = dateStr.slice(0, 7);
  const last = getDaysInMonth(fromDateStr(`${ym}-01`));
  return { startStr: `${ym}-01`, endStr: `${ym}-${String(last).padStart(2, "0")}` };
}

/** Jan 1 – Dec 31 of the year containing `dateStr`. */
export function yearBounds(dateStr: string): DateRangeStr {
  const y = dateStr.slice(0, 4);
  return { startStr: `${y}-01-01`, endStr: `${y}-12-31` };
}

/** Sunday–Saturday week containing `dateStr`. */
export function weekBounds(dateStr: string): DateRangeStr {
  const d = fromDateStr(dateStr);
  const start = addDays(d, -getDay(d));
  return { startStr: toDateStr(start), endStr: toDateStr(addDays(start, 6)) };
}
