import { format, parse } from "date-fns";

const DAY = "yyyy-MM-dd";
const dollars = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const dollarsCents = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export const centsToDollars = (cents: number) => cents / 100;
export const dollarsToCents = (amount: number) => Math.round(amount * 100);

/** Whole-dollar money, e.g. $2,100 */
export const formatRent = (cents: number) => dollars.format(cents / 100);
/** Money with cents, e.g. $2.35 */
export const formatMoney = (cents: number) => dollarsCents.format(cents / 100);

export const formatPercent = (fraction: number) => `${Math.round(fraction * 100)}%`;

export function formatBeds(beds: number | undefined) {
  if (beds === undefined) return "—";
  return beds === 0 ? "Studio" : `${beds} bd`;
}

export const toDay = (d: Date) => format(d, DAY);
export const fromDay = (day: string) => parse(day, DAY, new Date());
export const todayDay = () => toDay(new Date());
export const formatDay = (day: string, pattern = "MMM d, yyyy") => format(fromDay(day), pattern);

/** "14:30" → "2:30 PM" */
export const formatTime = (time: string) => format(parse(time, "HH:mm", new Date()), "h:mm a");

/** Blank or non-numeric input → undefined */
export function parseOptionalNumber(raw: string): number | undefined {
  if (raw.trim() === "") return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}
