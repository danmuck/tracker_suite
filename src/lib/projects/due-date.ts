// A task's due date is a calendar day. The task form sends it as "yyyy-MM-dd", which both stores
// keep as that day's UTC midnight ("2026-11-18T00:00:00.000Z"). Read in local time, that instant
// is the evening before anywhere west of UTC, so every display and form input goes through here:
// the day is always the stored instant's UTC calendar day, whatever the browser's time zone.
// Pure: no framework, browser or server imports.

import { format } from "date-fns";

/** The stored due date's calendar day as "yyyy-MM-dd" (a date input's value), or "" for none. */
export function dueDay(dueDate: string | null | undefined): string {
  if (!dueDate) return "";
  const date = new Date(dueDate);
  if (Number.isNaN(date.valueOf())) return "";
  return date.toISOString().slice(0, 10);
}

/** The stored due date's calendar day formatted with date-fns (default "MMM d"), or "" for none. */
export function formatDueDay(dueDate: string | null | undefined, pattern = "MMM d"): string {
  const day = dueDay(dueDate);
  if (!day) return "";
  const [y, m, d] = day.split("-").map(Number);
  // Local midnight of that calendar day, so date-fns (which formats in local time) prints that day
  return format(new Date(y, m - 1, d), pattern);
}
