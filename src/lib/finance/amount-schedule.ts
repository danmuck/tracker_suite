import { toDateStr } from "./dates";

export interface AmountStep {
  effectiveDate: Date | string;
  amount: number; // cents
}

/** Amount in effect on `dateStr` (yyyy-MM-dd): the latest step dated on or before it, else `base`. */
export function amountOn(base: number, schedule: AmountStep[] | undefined, dateStr: string): number {
  let best: { date: string; amount: number } | null = null;
  for (const step of schedule ?? []) {
    const date = toDateStr(step.effectiveDate);
    if (date <= dateStr && (!best || date >= best.date)) best = { date, amount: step.amount };
  }
  return best ? best.amount : base;
}
