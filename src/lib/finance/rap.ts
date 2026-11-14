import { paycheckOn, stepOn } from "./datasheet";
import type { FinanceProfileData } from "@/types/finance/datasheet";

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
