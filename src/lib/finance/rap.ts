import { addDays, differenceInCalendarDays } from "date-fns";
import { paycheckOn, stepOn } from "./datasheet";
import { fromDateStr, toDateStr } from "./dates";
import { expandRecurrence } from "./recurrence";
import type { FinanceProfileData } from "@/types/finance/datasheet";
import type { RecurrenceRule } from "@/types/finance/transaction";

export const RAP_MIN_PAYMENT = 1_000; // $10/month
const DEPENDENT_REDUCTION = 5_000; // $50/month per dependent

/** RAP monthly payment in cents from AGI (cents): 1–10% of AGI by $10k tier, less $50/dependent, min $10. */
export function rapMonthlyPayment(agiCents: number, dependents: number): number {
  const agi = agiCents / 100;
  if (agi <= 10_000) return RAP_MIN_PAYMENT;
  const ratePercent = Math.min(10, Math.ceil((agi - 10_000) / 10_000));
  const monthly = Math.round((agiCents * ratePercent) / 100 / 12) - DEPENDENT_REDUCTION * Math.max(0, dependents);
  return Math.max(RAP_MIN_PAYMENT, monthly);
}

/**
 * Estimated AGI (cents) for a calendar year: per-paycheck gross − 401(k) − health,
 * summed over that year's paydays. Null when no salary step covers any of them.
 */
export function priorYearAgi(
  p: FinanceProfileData,
  paydays: string[],
  year: number,
  periodsPerYear: number
): number | null {
  let total = 0;
  let counted = 0;
  for (const day of paydays) {
    if (!day.startsWith(`${year}-`)) continue;
    const salary = stepOn(p.salarySteps, day);
    if (!salary) continue;
    const { perPeriod } = paycheckOn(salary.annualGross, p, day, periodsPerYear);
    total += perPeriod.gross - perPeriod.retirement - perPeriod.health;
    counted++;
  }
  return counted > 0 ? total : null;
}

/** Automatic RAP entries: each recert date after `today` (through `years` years), priced from the prior year's AGI. */
export function rapScheduleEntries(args: {
  recertDate: string; // "MM-dd"
  dependents: number;
  today: string;
  years: number;
  agiForYear: (year: number) => number | null;
}): { effectiveDate: string; amount: number; source: "rap" }[] {
  const start = Number(args.today.slice(0, 4));
  const entries: { effectiveDate: string; amount: number; source: "rap" }[] = [];
  for (let year = start; year <= start + args.years; year++) {
    const effectiveDate = `${year}-${args.recertDate}`;
    if (effectiveDate <= args.today) continue;
    const agi = args.agiForYear(year - 1);
    if (agi === null) continue;
    entries.push({ effectiveDate, amount: rapMonthlyPayment(agi, args.dependents), source: "rap" });
  }
  return entries;
}

const FIXED_STEP_DAYS: Partial<Record<RecurrenceRule["frequency"], number>> = {
  daily: 1,
  weekly: 7,
  biweekly: 14,
  custom: 1,
};

/**
 * All paydays in `year` on the rule's rhythm, including ones before the
 * transaction's start date (salary steps decide which of them count).
 */
export function paydaysInYear(rule: RecurrenceRule, year: number): string[] {
  const yearStart = fromDateStr(`${year}-01-01`);
  const yearEnd = fromDateStr(`${year}-12-31`);
  const start = fromDateStr(toDateStr(rule.startDate));
  let anchor: Date;

  const fixed = FIXED_STEP_DAYS[rule.frequency];
  if (fixed !== undefined) {
    const step = rule.frequency === "biweekly" ? 14 : fixed * (rule.interval || 1);
    // Move the anchor back a whole number of periods so it lands on or before Jan 1
    const periodsBack = Math.max(0, Math.ceil(differenceInCalendarDays(start, yearStart) / step));
    anchor = addDays(start, -periodsBack * step);
  } else if (rule.frequency === "annually") {
    anchor = fromDateStr(`${year}-${toDateStr(rule.startDate).slice(5)}`);
  } else {
    // monthly / semi_monthly: keep the day(s) of month, start from January
    anchor = fromDateStr(`${year}-01-${toDateStr(rule.startDate).slice(8, 10)}`);
  }

  return expandRecurrence(
    { ...rule, startDate: anchor.toISOString(), dayOfMonth: rule.dayOfMonth ?? start.getDate() },
    yearStart,
    yearEnd
  ).map(toDateStr);
}
