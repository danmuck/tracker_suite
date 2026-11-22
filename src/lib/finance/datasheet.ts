import { calculatePaycheck, type PaycheckBreakdown } from "./tax-calculator";
import type { FinanceProfileData, SalaryRow, ScheduleEntry } from "@/types/finance/datasheet";

const WEEKS_PER_YEAR = 52;

function byDate<T extends { effectiveDate: string }>(steps: T[]): T[] {
  return [...steps].sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));
}

/** Latest step dated on or before `dateStr`, if any. */
export function stepOn<T extends { effectiveDate: string }>(steps: T[], dateStr: string): T | undefined {
  let found: T | undefined;
  for (const step of byDate(steps)) {
    if (step.effectiveDate <= dateStr) found = step;
  }
  return found;
}

export function hourlyToAnnual(hourlyCents: number, hoursPerWeek: number): number {
  return Math.round(hourlyCents * hoursPerWeek * WEEKS_PER_YEAR);
}

/** Paycheck breakdown for `annualGross` using the 401(k)/health steps in effect on `onDate`. */
export function paycheckOn(
  annualGross: number,
  p: FinanceProfileData,
  onDate: string,
  periodsPerYear: number
): PaycheckBreakdown {
  return calculatePaycheck({
    annualGross,
    retirementPercent: stepOn(p.retirementSteps, onDate)?.percent ?? 0,
    healthPerPaycheck: stepOn(p.healthSteps, onDate)?.perPaycheck ?? 0,
    periodsPerYear,
    filingStatus: p.filingStatus,
    nycResident: p.nycResident,
  });
}

/** Net pay per paycheck from each dated change onward, starting at the earliest salary step. */
export function buildSalarySchedule(p: FinanceProfileData, periodsPerYear: number): ScheduleEntry[] {
  const salarySteps = byDate(p.salarySteps);
  if (salarySteps.length === 0) return [];
  const first = salarySteps[0].effectiveDate;

  const dates = [
    ...new Set(
      [...p.salarySteps, ...p.retirementSteps, ...p.healthSteps]
        .map((s) => s.effectiveDate)
        .filter((d) => d >= first)
    ),
  ].sort();

  const schedule: ScheduleEntry[] = [];
  for (const date of dates) {
    const gross = stepOn(salarySteps, date)!.annualGross;
    const amount = paycheckOn(gross, p, date, periodsPerYear).perPeriod.net;
    if (schedule.length === 0 || schedule[schedule.length - 1].amount !== amount) {
      schedule.push({ effectiveDate: date, amount });
    }
  }
  return schedule;
}

export function buildRentSchedule(p: FinanceProfileData): ScheduleEntry[] {
  return byDate(p.rentSteps).map((s) => ({ effectiveDate: s.effectiveDate, amount: s.monthly }));
}

/** Spreadsheet-style row: hourly, weekly/monthly/annual gross and net. */
export function salaryRow(
  annualGross: number,
  p: FinanceProfileData,
  onDate: string,
  periodsPerYear: number
): SalaryRow {
  const annualNet = paycheckOn(annualGross, p, onDate, periodsPerYear).annual.net;
  return {
    hourly: p.hoursPerWeek > 0 ? Math.round(annualGross / (p.hoursPerWeek * WEEKS_PER_YEAR)) : 0,
    weeklyGross: Math.round(annualGross / WEEKS_PER_YEAR),
    monthlyGross: Math.round(annualGross / 12),
    annualGross,
    weeklyNet: Math.round(annualNet / WEEKS_PER_YEAR),
    monthlyNet: Math.round(annualNet / 12),
    annualNet,
  };
}

/** Row 0 = starting salary; rows 1..years compound `raiseRate` annually. */
export function tenYearRows(
  startAnnualGross: number,
  p: FinanceProfileData,
  onDate: string,
  periodsPerYear: number,
  years = 10
): SalaryRow[] {
  return Array.from({ length: years + 1 }, (_, k) =>
    salaryRow(Math.round(startAnnualGross * Math.pow(1 + p.raiseRate, k)), p, onDate, periodsPerYear)
  );
}
