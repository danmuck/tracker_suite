import {
  FEDERAL_TAX_BRACKETS,
  STANDARD_DEDUCTIONS,
  SOCIAL_SECURITY_RATE,
  SOCIAL_SECURITY_WAGE_BASE,
  MEDICARE_RATE,
  MEDICARE_ADDITIONAL_RATE,
  MEDICARE_ADDITIONAL_THRESHOLD,
  NY_TAX_BRACKETS,
  NY_STANDARD_DEDUCTIONS,
  NYC_TAX_BRACKETS,
  NY_SDI_RATE,
  NY_SDI_ANNUAL_MAX,
  NY_PFL_RATE,
  NY_PFL_ANNUAL_MAX,
  type FILING_STATUSES,
  type TaxBracket,
} from "./constants";

export type FilingStatus = (typeof FILING_STATUSES)[number];

export interface PaycheckInput {
  annualGross: number; // cents
  retirementPercent: number; // traditional 401(k), fraction of gross (0.06)
  healthPerPaycheck: number; // cents, pre-tax incl. FICA
  periodsPerYear: number;
  filingStatus: FilingStatus;
  nycResident: boolean;
}

/** All values in cents. */
export interface PaycheckLines {
  gross: number;
  retirement: number;
  health: number;
  federal: number;
  socialSecurity: number;
  medicare: number;
  nyState: number;
  nyc: number;
  sdi: number;
  pfl: number;
  net: number;
}

export interface PaycheckBreakdown {
  annual: PaycheckLines;
  perPeriod: PaycheckLines;
  effectiveTaxRate: number; // taxes (excl. 401k/health) ÷ gross
  periodsPerYear: number;
}

const DEDUCTION_KEYS = [
  "retirement",
  "health",
  "federal",
  "socialSecurity",
  "medicare",
  "nyState",
  "nyc",
  "sdi",
  "pfl",
] as const;

export function getPeriodsPerYear(frequency: string): number {
  switch (frequency) {
    case "weekly": return 52;
    case "biweekly": return 26;
    case "semi_monthly": return 24;
    case "monthly": return 12;
    case "annually": return 1;
    default: return 26;
  }
}

/** Progressive tax in cents on a taxable amount in cents; bracket bounds are dollars. */
function bracketTax(taxableCents: number, table: TaxBracket[]): number {
  let tax = 0;
  let lower = 0;
  for (const { upTo, rate } of table) {
    const upper = upTo * 100;
    if (taxableCents <= lower) break;
    tax += (Math.min(taxableCents, upper) - lower) * rate;
    lower = upper;
  }
  return tax;
}

export function calculatePaycheck(input: PaycheckInput): PaycheckBreakdown {
  const { annualGross: gross, retirementPercent, healthPerPaycheck, periodsPerYear, filingStatus, nycResident } = input;

  const retirement = Math.round(gross * retirementPercent);
  const health = Math.min(gross, healthPerPaycheck * periodsPerYear);
  const ficaWages = Math.max(0, gross - health);
  const incomeTaxWages = Math.max(0, gross - health - retirement);

  const federalTaxable = Math.max(0, incomeTaxWages - STANDARD_DEDUCTIONS[filingStatus] * 100);
  const nyTaxable = Math.max(0, incomeTaxWages - NY_STANDARD_DEDUCTIONS[filingStatus] * 100);

  const medicareExtra = Math.max(0, ficaWages - MEDICARE_ADDITIONAL_THRESHOLD * 100) * MEDICARE_ADDITIONAL_RATE;

  const lines = {
    gross,
    retirement,
    health,
    federal: Math.round(bracketTax(federalTaxable, FEDERAL_TAX_BRACKETS[filingStatus])),
    socialSecurity: Math.round(Math.min(ficaWages, SOCIAL_SECURITY_WAGE_BASE * 100) * SOCIAL_SECURITY_RATE),
    medicare: Math.round(ficaWages * MEDICARE_RATE + medicareExtra),
    nyState: Math.round(bracketTax(nyTaxable, NY_TAX_BRACKETS[filingStatus])),
    nyc: nycResident ? Math.round(bracketTax(nyTaxable, NYC_TAX_BRACKETS[filingStatus])) : 0,
    sdi: Math.round(Math.min(gross * NY_SDI_RATE, NY_SDI_ANNUAL_MAX * 100)),
    pfl: Math.round(Math.min(ficaWages * NY_PFL_RATE, NY_PFL_ANNUAL_MAX * 100)),
  };

  const annual: PaycheckLines = { ...lines, net: gross - sumDeductions(lines) };

  const periodLines = { gross: Math.round(gross / periodsPerYear) } as Omit<PaycheckLines, "net">;
  for (const key of DEDUCTION_KEYS) periodLines[key] = Math.round(lines[key] / periodsPerYear);
  const perPeriod: PaycheckLines = { ...periodLines, net: periodLines.gross - sumDeductions(periodLines) };

  const taxes = annual.federal + annual.socialSecurity + annual.medicare + annual.nyState + annual.nyc + annual.sdi + annual.pfl;

  return {
    annual,
    perPeriod,
    effectiveTaxRate: gross > 0 ? taxes / gross : 0,
    periodsPerYear,
  };
}

function sumDeductions(l: Omit<PaycheckLines, "net">): number {
  return DEDUCTION_KEYS.reduce((sum, key) => sum + l[key], 0);
}
