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

/** The `Date` itself when given one, else `new Date(value)` (stored dates may be ISO strings). */
export function asDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

/**
 * ISO string of a date that is about to be stored: what Mongoose's date cast
 * (`mongoose/lib/cast/date.js`) stores. A `Date` is used as is; a string whose
 * `Number()` is a number >= 275761 or < -271820 is read as milliseconds; any
 * other string goes through `new Date(value)`. An invalid date throws a plain
 * `Error` (never a `RangeError`, which the projections and summary handlers
 * turn into a 400; today these inputs are a Mongoose cast error, a 500).
 * Mongoose casts `""` to `null`, and every Finance field that can receive `""`
 * is then refused as required (500), so throwing gives the same result;
 * `buildRule` handles the one optional date (`endDate`) before calling this.
 */
export function toIso(value: Date | string): string {
  let date: Date;
  if (value instanceof Date) {
    date = value;
  } else {
    const n = Number(value);
    date = !isNaN(n) && (n >= 275761 || n < -271820) ? new Date(n) : new Date(value);
  }
  if (isNaN(date.getTime())) throw new Error("Invalid date: " + value);
  return date.toISOString();
}

/**
 * ISO string of a date that goes into a query filter (query-string bounds),
 * where today's code builds `new Date(value)` itself. Unlike `toIso` it does
 * not read numeric strings as milliseconds.
 */
export function filterDate(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new Error("Invalid date: " + value);
  return d.toISOString();
}

/** The calendar day (local time) of `now`, as yyyy-MM-dd. */
export function localDateStr(now: Date): string {
  return format(now, "yyyy-MM-dd");
}

/** The user's current calendar day (local time), as yyyy-MM-dd. */
export function localTodayStr(): string {
  return localDateStr(new Date());
}

/** The user's current calendar day as a stored date: UTC midnight of the local day of `now`, as an ISO string. */
export function todayStoredDate(now: Date): string {
  return localDateStr(now) + "T00:00:00.000Z";
}

/**
 * The first stored instant that is in the future: UTC midnight of the day after the local
 * calendar day of `now`. A stored date is in the future exactly when it is at or after this,
 * i.e. when its UTC calendar day is after the user's local calendar day.
 */
export function firstFutureInstant(now: Date): string {
  const d = new Date(todayStoredDate(now));
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString();
}

/**
 * Whether a transaction dated `date` (read as it will be stored, see `toIso`) is dated after
 * the user's local calendar day. An invalid date is not in the future, as before.
 */
export function isFutureDated(date: Date | string, now: Date): boolean {
  let stored: string;
  try {
    stored = toIso(date);
  } catch {
    return false;
  }
  return new Date(stored).getTime() >= new Date(firstFutureInstant(now)).getTime();
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
