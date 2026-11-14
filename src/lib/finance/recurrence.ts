import {
  addDays,
  addWeeks,
  addMonths,
  addYears,
  isBefore,
  isAfter,
  setDate,
  getDaysInMonth,
  getDay,
} from "date-fns";
import type { RecurrenceRule } from "@/types/finance/transaction";
import { fromDateStr, normalizeDate } from "./dates";

function clampDayOfMonth(date: Date, targetDay: number): Date {
  const maxDay = getDaysInMonth(date);
  const day = Math.min(targetDay, maxDay);
  return setDate(date, day);
}

function snapToDayOfWeek(date: Date, dayOfWeek: number | undefined): Date {
  if (dayOfWeek === undefined || dayOfWeek === null) return date;
  return addDays(date, (dayOfWeek - getDay(date) + 7) % 7);
}

/**
 * Expand a recurrence rule into occurrence dates within [windowStart, windowEnd].
 * All dates are treated as calendar days and returned at noon UTC (see ./dates).
 */
export function expandRecurrence(
  rule: RecurrenceRule,
  rawWindowStart: Date,
  rawWindowEnd: Date
): Date[] {
  const dates: Date[] = [];
  const windowStart = normalizeDate(rawWindowStart);
  const windowEnd = normalizeDate(rawWindowEnd);
  const start = normalizeDate(rule.startDate);
  const end = rule.endDate ? normalizeDate(rule.endDate) : null;
  const interval = rule.interval || 1;

  if (end && isBefore(end, windowStart)) return dates;
  if (isAfter(start, windowEnd)) return dates;

  const effectiveEnd = end && isBefore(end, windowEnd) ? end : windowEnd;

  switch (rule.frequency) {
    case "daily": {
      let current = start;
      while (!isAfter(current, effectiveEnd)) {
        if (!isBefore(current, windowStart)) {
          dates.push(new Date(current));
        }
        current = addDays(current, interval);
      }
      break;
    }

    case "weekly": {
      let current = snapToDayOfWeek(start, rule.dayOfWeek);
      while (!isAfter(current, effectiveEnd)) {
        if (!isBefore(current, windowStart)) {
          dates.push(new Date(current));
        }
        current = addWeeks(current, interval);
      }
      break;
    }

    case "biweekly": {
      let current = snapToDayOfWeek(start, rule.dayOfWeek);
      while (!isAfter(current, effectiveEnd)) {
        if (!isBefore(current, windowStart)) {
          dates.push(new Date(current));
        }
        current = addWeeks(current, 2);
      }
      break;
    }

    case "monthly": {
      let current = start;
      const targetDay = rule.dayOfMonth || start.getDate();
      current = clampDayOfMonth(current, targetDay);
      while (!isAfter(current, effectiveEnd)) {
        if (!isBefore(current, windowStart)) {
          dates.push(new Date(current));
        }
        current = addMonths(current, interval);
        current = clampDayOfMonth(current, targetDay);
      }
      break;
    }

    case "semi_monthly": {
      const days = rule.daysOfMonth || [1, 15];
      let current = fromDateStr(
        `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-01`
      );
      while (!isAfter(current, effectiveEnd)) {
        for (const day of days) {
          const d = clampDayOfMonth(current, day);
          if (
            !isBefore(d, start) &&
            !isBefore(d, windowStart) &&
            !isAfter(d, effectiveEnd)
          ) {
            dates.push(new Date(d));
          }
        }
        current = addMonths(current, 1);
      }
      break;
    }

    case "annually": {
      let current = start;
      while (!isAfter(current, effectiveEnd)) {
        if (!isBefore(current, windowStart)) {
          dates.push(new Date(current));
        }
        current = addYears(current, interval);
      }
      break;
    }

    case "custom": {
      let current = start;
      while (!isAfter(current, effectiveEnd)) {
        if (!isBefore(current, windowStart)) {
          dates.push(new Date(current));
        }
        current = addDays(current, interval);
      }
      break;
    }
  }

  return dates;
}
