import { addDays } from "date-fns";
import { expandRecurrence } from "./recurrence";
import { amountOn, type AmountStep } from "./amount-schedule";
import { fromDateStr, toDateStr } from "./dates";
import type { RecurrenceRule } from "@/types/finance/transaction";

export interface DueOccurrence {
  date: string; // yyyy-MM-dd
  amount: number; // cents, before balance caps
}

/**
 * Occurrences of a recurring transaction that are due (dated on or before `today`)
 * and not yet posted (after `postedThrough`), with the scheduled amount on each date.
 */
export function dueOccurrences(
  rule: RecurrenceRule,
  schedule: AmountStep[] | undefined,
  baseAmount: number,
  postedThrough: string | null,
  today: string
): DueOccurrence[] {
  const from = postedThrough ? addDays(fromDateStr(postedThrough), 1) : fromDateStr(toDateStr(rule.startDate));
  const to = fromDateStr(today);
  if (from > to) return [];
  return expandRecurrence(rule, from, to).map((d) => {
    const date = toDateStr(d);
    return { date, amount: amountOn(baseAmount, schedule, date) };
  });
}
