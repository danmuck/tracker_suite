import { addDays, addWeeks, differenceInCalendarDays, format, startOfWeek } from "date-fns";
import { fromDay, toDay } from "@/lib/figure/format";
import type { LoggedSet } from "@/types/figure/fitness";

/** Minimal shapes the stats need, so this works on lean Mongo docs and API types alike */
export interface StatsLog {
  date: string;
  name: string;
  exercises: { name: string; sets: LoggedSet[] }[];
}
export interface StatsRun {
  date: string;
  distance: number;
  durationSeconds: number;
  type: string;
}

export interface WeekPoint {
  weekStart: string;
  label: string;
  sessions: number;
  sets: number;
  volume: number;
  runs: number;
  miles: number;
  runSeconds: number;
}

export interface DayPoint {
  date: string;
  lifts: number;
  runs: number;
}

export interface PacePoint {
  date: string;
  label: string;
  distance: number;
  paceSeconds: number;
  type: string;
}

export interface WeekTotals {
  sessions: number;
  miles: number;
  runs: number;
  volume: number;
}

export interface FitnessStats {
  range: { start: string; end: string; weeks: number };
  weeks: WeekPoint[];
  days: DayPoint[];
  paces: PacePoint[];
  thisWeek: WeekTotals;
  lastWeek: WeekTotals;
  streak: { current: number; longest: number };
  topExercises: { name: string; sessions: number }[];
}

export interface ExerciseProgressPoint {
  date: string;
  label: string;
  topWeight: number;
  topReps: number;
  e1rm: number;
  volume: number;
}

/** Training weeks run Sunday to Saturday, so a weekend spans two weeks */
export const WEEK_OPTS = { weekStartsOn: 0 } as const;

const doneSets = (sets: LoggedSet[]) => sets.filter((s) => s.done !== false);

export function setVolume(sets: LoggedSet[]): number {
  return doneSets(sets).reduce((n, s) => n + s.reps * s.weight, 0);
}

/** Epley estimated one-rep max; a single rep is its own max */
export function estimateOneRepMax(weight: number, reps: number): number {
  if (weight <= 0 || reps <= 0) return 0;
  return reps === 1 ? weight : weight * (1 + reps / 30);
}

/** First day of the window: Sunday of the week `weeks - 1` weeks before `today`'s week */
export function rangeStart(today: Date, weeks: number): string {
  return toDay(addWeeks(startOfWeek(today, WEEK_OPTS), -(weeks - 1)));
}

/** A rest day ends the streak when it follows another rest day in the same week, or is the third in its week */
const MAX_RESTS_PER_WEEK = 2;

/**
 * Day-streaks of activity (a lift or a run), in Sunday–Saturday weeks. A streak survives single
 * rest days: it breaks on the second rest day in a row within one week, or on a third rest day in
 * the same week (counting only rest days since the streak began). Two rest days in a row across
 * weeks (Saturday and Sunday, a weekend off) do not break it. Its length is the days from
 * its first active day to its last, rest days inside included.
 *
 * Today counts only once something is logged: until then it is not a rest day, so the current
 * streak still stands if it was alive at the end of yesterday. Days after `today` are ignored.
 */
export function computeStreak(activeDays: Set<string>, today: Date): { current: number; longest: number } {
  const todayKey = toDay(today);
  const past = [...activeDays].filter((d) => d <= todayKey).sort();
  if (past.length === 0) return { current: 0, longest: 0 };

  let longest = 0;
  let start: Date | null = null;
  let lastActive: Date | null = null;
  let rests: Date[] = [];
  const span = () => (start && lastActive ? differenceInCalendarDays(lastActive, start) + 1 : 0);

  for (let d = fromDay(past[0]); toDay(d) < todayKey; d = addDays(d, 1)) {
    if (activeDays.has(toDay(d))) {
      start ??= d;
      lastActive = d;
      longest = Math.max(longest, span());
      continue;
    }
    if (!start) continue;
    const week = toDay(startOfWeek(d, WEEK_OPTS));
    const restsThisWeek = rests.filter((r) => toDay(startOfWeek(r, WEEK_OPTS)) === week);
    const afterRest = restsThisWeek.some((r) => differenceInCalendarDays(d, r) === 1);
    if (afterRest || restsThisWeek.length + 1 > MAX_RESTS_PER_WEEK) {
      start = null;
      lastActive = null;
      rests = [];
    } else {
      rests.push(d);
    }
  }

  if (activeDays.has(todayKey)) {
    start ??= fromDay(todayKey);
    lastActive = fromDay(todayKey);
    longest = Math.max(longest, span());
  }
  return { current: span(), longest };
}

/**
 * Weekly and daily series for the dashboard.
 * `logs`/`runs` should cover the window; `allActiveDays` (any time) feeds the streak.
 */
export function computeFitnessStats(
  logs: StatsLog[],
  runs: StatsRun[],
  allActiveDays: Set<string>,
  today: Date,
  weeks: number
): FitnessStats {
  const start = rangeStart(today, weeks);
  const end = toDay(today);
  const inRange = (d: string) => d >= start && d <= end;

  const weekMap = new Map<string, WeekPoint>();
  for (let i = 0; i < weeks; i++) {
    const ws = addWeeks(fromDay(start), i);
    const key = toDay(ws);
    weekMap.set(key, {
      weekStart: key,
      label: format(ws, "MMM d"),
      sessions: 0,
      sets: 0,
      volume: 0,
      runs: 0,
      miles: 0,
      runSeconds: 0,
    });
  }
  const weekOf = (d: string) => weekMap.get(toDay(startOfWeek(fromDay(d), WEEK_OPTS)));

  const dayMap = new Map<string, DayPoint>();
  for (let d = fromDay(start); toDay(d) <= end; d = addDays(d, 1)) {
    dayMap.set(toDay(d), { date: toDay(d), lifts: 0, runs: 0 });
  }

  const exerciseCounts = new Map<string, { name: string; sessions: number }>();

  for (const log of logs) {
    if (!inRange(log.date)) continue;
    const w = weekOf(log.date);
    if (w) {
      w.sessions++;
      for (const ex of log.exercises) {
        w.sets += doneSets(ex.sets).length;
        w.volume += setVolume(ex.sets);
      }
    }
    const day = dayMap.get(log.date);
    if (day) day.lifts++;
    for (const ex of new Set(log.exercises.map((e) => e.name.trim()))) {
      const key = ex.toLowerCase();
      const entry = exerciseCounts.get(key) ?? { name: ex, sessions: 0 };
      entry.sessions++;
      exerciseCounts.set(key, entry);
    }
  }

  const paces: PacePoint[] = [];
  for (const run of runs) {
    if (!inRange(run.date)) continue;
    const w = weekOf(run.date);
    if (w) {
      w.runs++;
      w.miles += run.distance;
      w.runSeconds += run.durationSeconds;
    }
    const day = dayMap.get(run.date);
    if (day) day.runs++;
    if (run.distance > 0) {
      paces.push({
        date: run.date,
        label: format(fromDay(run.date), "MMM d"),
        distance: run.distance,
        paceSeconds: Math.round(run.durationSeconds / run.distance),
        type: run.type,
      });
    }
  }
  paces.sort((a, b) => a.date.localeCompare(b.date));

  const weekList = [...weekMap.values()];
  for (const w of weekList) {
    w.miles = Math.round(w.miles * 100) / 100;
    w.volume = Math.round(w.volume);
  }

  const totalsFor = (w?: WeekPoint): WeekTotals => ({
    sessions: w?.sessions ?? 0,
    miles: w?.miles ?? 0,
    runs: w?.runs ?? 0,
    volume: w?.volume ?? 0,
  });

  return {
    range: { start, end, weeks },
    weeks: weekList,
    days: [...dayMap.values()],
    paces,
    thisWeek: totalsFor(weekList[weekList.length - 1]),
    lastWeek: totalsFor(weekList[weekList.length - 2]),
    streak: computeStreak(allActiveDays, today),
    topExercises: [...exerciseCounts.values()].sort((a, b) => b.sessions - a.sessions || a.name.localeCompare(b.name)),
  };
}

/** One point per session that included the exercise (name matched case-insensitively) */
export function computeExerciseProgress(logs: StatsLog[], exerciseName: string): ExerciseProgressPoint[] {
  const target = exerciseName.trim().toLowerCase();
  const points: ExerciseProgressPoint[] = [];
  for (const log of [...logs].sort((a, b) => a.date.localeCompare(b.date))) {
    const sets = log.exercises
      .filter((e) => e.name.trim().toLowerCase() === target)
      .flatMap((e) => doneSets(e.sets));
    if (sets.length === 0) continue;
    let best = sets[0];
    let bestE1rm = estimateOneRepMax(best.weight, best.reps);
    for (const s of sets) {
      const e = estimateOneRepMax(s.weight, s.reps);
      if (e > bestE1rm || (e === bestE1rm && s.weight > best.weight)) {
        best = s;
        bestE1rm = e;
      }
    }
    points.push({
      date: log.date,
      label: format(fromDay(log.date), "MMM d"),
      topWeight: best.weight,
      topReps: best.reps,
      e1rm: Math.round(bestE1rm * 10) / 10,
      volume: Math.round(setVolume(sets)),
    });
  }
  return points;
}
