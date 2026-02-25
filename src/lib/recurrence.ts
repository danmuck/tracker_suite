import {
  addDays,
  addWeeks,
  addMonths,
  addYears,
  isWithinInterval,
  isBefore,
  isAfter,
  startOfDay,
  setDate,
  getDaysInMonth,
  getDay,
} from "date-fns";
import type { RecurrenceRule } from "@/types/transaction";

function clampDayOfMonth(date: Date, targetDay: number): Date {
  const maxDay = getDaysInMonth(date);
  const day = Math.min(targetDay, maxDay);
  return setDate(date, day);
}

export function expandRecurrence(
  rule: RecurrenceRule,
  windowStart: Date,
  windowEnd: Date
): Date[] {
  const dates: Date[] = [];
  const start = startOfDay(new Date(rule.startDate));
  const end = rule.endDate ? startOfDay(new Date(rule.endDate)) : null;
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
      let current = start;
      if (rule.dayOfWeek !== undefined) {
        const diff = (rule.dayOfWeek - getDay(current) + 7) % 7;
        current = addDays(current, diff);
      }
      while (!isAfter(current, effectiveEnd)) {
        if (!isBefore(current, windowStart)) {
          dates.push(new Date(current));
        }
        current = addWeeks(current, interval);
      }
      break;
    }

    case "biweekly": {
      let current = start;
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
      let current = new Date(start.getFullYear(), start.getMonth(), 1);
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
