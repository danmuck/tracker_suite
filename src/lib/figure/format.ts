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

/** 1530 → "25:30", 3900 → "1:05:00" */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

/**
 * "25:30" → 1530, "1:05:00" → 3900, "25" → 1500 (a bare number is minutes).
 * Returns undefined for anything else.
 */
export function parseDuration(input: string): number | undefined {
  const v = input.trim();
  if (!v) return undefined;
  if (/^\d+(\.\d+)?$/.test(v)) return Math.round(Number(v) * 60);
  const parts = v.split(":");
  if (parts.length < 2 || parts.length > 3 || parts.some((p) => !/^\d+$/.test(p))) return undefined;
  const nums = parts.map(Number);
  if (nums.slice(1).some((n) => n >= 60)) return undefined;
  return nums.length === 3 ? nums[0] * 3600 + nums[1] * 60 + nums[2] : nums[0] * 60 + nums[1];
}

/** Pace as "8:30 /mi" */
export function formatPace(durationSeconds: number, miles: number): string {
  if (!miles) return "—";
  return `${formatDuration(durationSeconds / miles)} /mi`;
}

export function formatMiles(miles: number): string {
  return `${Math.round(miles * 100) / 100} mi`;
}

/** The message to show for a failed request: the error's own, else `fallback` */
export function failureMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}
