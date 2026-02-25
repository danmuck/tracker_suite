import {
  FEDERAL_TAX_BRACKETS,
  SOCIAL_SECURITY_RATE,
  SOCIAL_SECURITY_WAGE_BASE,
  MEDICARE_RATE,
  MEDICARE_ADDITIONAL_RATE,
  MEDICARE_ADDITIONAL_THRESHOLD,
  STANDARD_DEDUCTIONS,
  type FILING_STATUSES,
} from "./constants";

type FilingStatus = (typeof FILING_STATUSES)[number];

export interface TaxBreakdown {
  gross: number;
  federalTax: number;
  socialSecurity: number;
  medicare: number;
  stateTax: number;
  totalDeductions: number;
  net: number;
  effectiveRate: number;
  marginalRate: number;
}

export interface SalaryResult {
  annual: TaxBreakdown;
  perPeriod: TaxBreakdown;
  periodsPerYear: number;
}

function calculateFederalTax(taxableIncome: number, filingStatus: FilingStatus): { tax: number; marginalRate: number } {
  const brackets = FEDERAL_TAX_BRACKETS[filingStatus];
  let tax = 0;
  let marginalRate = 0;

  for (const bracket of brackets) {
    if (taxableIncome <= bracket.min) break;
    const taxable = Math.min(taxableIncome, bracket.max) - bracket.min;
    tax += taxable * bracket.rate;
    marginalRate = bracket.rate;
  }

  return { tax, marginalRate };
}

function calculateFICA(grossAnnual: number) {
  const ssWages = Math.min(grossAnnual, SOCIAL_SECURITY_WAGE_BASE);
  const socialSecurity = ssWages * SOCIAL_SECURITY_RATE;

  let medicare = grossAnnual * MEDICARE_RATE;
  if (grossAnnual > MEDICARE_ADDITIONAL_THRESHOLD) {
    medicare += (grossAnnual - MEDICARE_ADDITIONAL_THRESHOLD) * MEDICARE_ADDITIONAL_RATE;
  }

  return { socialSecurity, medicare };
}

function getPeriodsPerYear(payCycle: string): number {
  switch (payCycle) {
    case "weekly": return 52;
    case "biweekly": return 26;
    case "semi_monthly": return 24;
    case "monthly": return 12;
    case "annually": return 1;
    default: return 12;
  }
}

function divideBreakdown(breakdown: TaxBreakdown, periods: number): TaxBreakdown {
  return {
    gross: Math.round(breakdown.gross / periods),
    federalTax: Math.round(breakdown.federalTax / periods),
    socialSecurity: Math.round(breakdown.socialSecurity / periods),
    medicare: Math.round(breakdown.medicare / periods),
    stateTax: Math.round(breakdown.stateTax / periods),
    totalDeductions: Math.round(breakdown.totalDeductions / periods),
    net: Math.round(breakdown.net / periods),
    effectiveRate: breakdown.effectiveRate,
    marginalRate: breakdown.marginalRate,
  };
}

export function calculateSalary(
  grossAnnual: number,
  payCycle: string,
  filingStatus: FilingStatus,
  stateRate = 0
): SalaryResult {
  const standardDeduction = STANDARD_DEDUCTIONS[filingStatus];
  const taxableIncome = Math.max(0, grossAnnual - standardDeduction);

  const { tax: federalTax, marginalRate } = calculateFederalTax(taxableIncome, filingStatus);
  const { socialSecurity, medicare } = calculateFICA(grossAnnual);
  const stateTax = grossAnnual * stateRate;

  const totalDeductions = federalTax + socialSecurity + medicare + stateTax;
  const net = grossAnnual - totalDeductions;
  const effectiveRate = grossAnnual > 0 ? totalDeductions / grossAnnual : 0;

  const annual: TaxBreakdown = {
    gross: Math.round(grossAnnual),
    federalTax: Math.round(federalTax),
    socialSecurity: Math.round(socialSecurity),
    medicare: Math.round(medicare),
    stateTax: Math.round(stateTax),
    totalDeductions: Math.round(totalDeductions),
    net: Math.round(net),
    effectiveRate,
    marginalRate,
  };

  const periodsPerYear = getPeriodsPerYear(payCycle);

  return {
    annual,
    perPeriod: divideBreakdown(annual, periodsPerYear),
    periodsPerYear,
  };
}
