import type { FinanceProfileData } from "@/types/finance/datasheet";

/** API shape: same as FinanceProfileData but money in dollars. */
export type FinanceProfileDollars = FinanceProfileData;

const toCents = (d: number) => Math.round(d * 100);
const toDollars = (c: number) => c / 100;

export const DEFAULT_PROFILE: FinanceProfileData = {
  filingStatus: "single",
  hoursPerWeek: 40,
  nycResident: false,
  raiseRate: 0.03,
  salaryTransactionId: null,
  rentTransactionId: null,
  salarySteps: [],
  retirementSteps: [],
  healthSteps: [],
  rentSteps: [],
  whatIfSalaries: [],
};

function convert(p: FinanceProfileData, money: (n: number) => number): FinanceProfileData {
  return {
    ...p,
    salarySteps: p.salarySteps.map((s) => ({ ...s, annualGross: money(s.annualGross) })),
    retirementSteps: p.retirementSteps.map((s) => ({ ...s })),
    healthSteps: p.healthSteps.map((s) => ({ ...s, perPaycheck: money(s.perPaycheck) })),
    rentSteps: p.rentSteps.map((s) => ({ ...s, monthly: money(s.monthly) })),
    whatIfSalaries: p.whatIfSalaries.map((w) => ({ ...w, annualGross: money(w.annualGross) })),
  };
}

export function profileFromDollars(p: FinanceProfileDollars): FinanceProfileData {
  return convert(p, toCents);
}

export function profileToDollars(p: FinanceProfileData): FinanceProfileDollars {
  return convert(p, toDollars);
}
