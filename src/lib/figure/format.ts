import { format, parse } from "date-fns";
import type { LoggedSet } from "@/types/figure/fitness";

/** Date → yyyy-MM-dd in local time */
export function toDay(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

/** yyyy-MM-dd → local Date at midnight */
export function fromDay(day: string): Date {
  return parse(day, "yyyy-MM-dd", new Date());
}

export function todayDay(): string {
  return toDay(new Date());
}

export function formatDay(day: string, pattern = "EEE, MMM d"): string {
  return format(fromDay(day), pattern);
}

export function formatWeight(w: number | undefined): string {
  if (w === undefined || w === null) return "";
  return `${Number.isInteger(w) ? w : w.toFixed(1)} lb`;
}

/**
 * Compact summary of sets: identical sets collapse ("3×8 @ 185 lb"),
 * otherwise list each ("8×185, 8×185, 6×185").
 */
export function summarizeSets(sets: LoggedSet[]): string {
  const done = sets.filter((s) => s.done !== false);
  if (done.length === 0) return "no sets";
  const allSame = done.every((s) => s.reps === done[0].reps && s.weight === done[0].weight);
  if (allSame) {
    const { reps, weight } = done[0];
    return weight ? `${done.length}×${reps} @ ${formatWeight(weight)}` : `${done.length}×${reps}`;
  }
  return done.map((s) => (s.weight ? `${s.reps}×${s.weight}` : `${s.reps}`)).join(", ");
}

/** Parse a number input; empty → undefined */
export function parseOptionalNumber(v: string): number | undefined {
  if (v.trim() === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** "2 lb", "1.5 cup", "3" — empty when there's no quantity or unit */
export function formatQuantity(quantity?: number, unit?: string): string {
  const q =
    quantity === undefined || quantity === null
      ? ""
      : Number.isInteger(quantity)
        ? String(quantity)
        : String(Math.round(quantity * 100) / 100);
  return [q, unit ?? ""].filter(Boolean).join(" ");
}
