import { format, formatDistanceToNow } from "date-fns";

export function formatCurrency(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(cents / 100);
}

// Parses dates as local time to avoid UTC timezone shift.
// Handles both YYYY-MM-DD strings and full ISO strings (e.g. from MongoDB serialization).
export function parseDate(date: Date | string): Date {
  if (typeof date === "string") {
    const m = date.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }
  return new Date(date);
}

export function formatDate(date: Date | string): string {
  return format(parseDate(date), "MMM d, yyyy");
}

export function formatDateShort(date: Date | string): string {
  return format(parseDate(date), "MMM d");
}

export function formatDateRelative(date: Date | string): string {
  return formatDistanceToNow(parseDate(date), { addSuffix: true });
}

export function formatDateISO(date: Date | string): string {
  return format(parseDate(date), "yyyy-MM-dd");
}

export function formatMonth(date: Date | string): string {
  return format(parseDate(date), "MMMM yyyy");
}

export function formatDayOfWeek(date: Date | string): string {
  return format(parseDate(date), "EEE");
}

export function formatDayOfMonth(date: Date | string): string {
  return format(parseDate(date), "d");
}

export function centsToDollars(cents: number): number {
  return cents / 100;
}

export function dollarsToCents(dollars: number): number {
  return Math.round(dollars * 100);
}
