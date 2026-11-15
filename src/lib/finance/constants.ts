export const DEFAULT_CATEGORIES = [
  { name: "salary", color: "#22c55e", icon: "Banknote", isDefault: true },
  { name: "bonus", color: "#14b8a6", icon: "Gift", isDefault: true },
  { name: "bills", color: "#ef4444", icon: "Receipt", isDefault: true },
  { name: "subscriptions", color: "#8b5cf6", icon: "Repeat", isDefault: true },
  { name: "spending", color: "#f59e0b", icon: "ShoppingCart", isDefault: true },
  { name: "credit", color: "#6366f1", icon: "CreditCard", isDefault: true },
  { name: "loans", color: "#06b6d4", icon: "Landmark", isDefault: true },
  { name: "transfer", color: "#64748b", icon: "ArrowLeftRight", isDefault: true },
  { name: "other", color: "#94a3b8", icon: "MoreHorizontal", isDefault: true },
] as const;

export const ACCOUNT_TYPES = ["bank", "credit_card", "debt"] as const;

export const TRANSACTION_TYPES = ["credit", "debit", "transfer"] as const;

export const RECURRENCE_FREQUENCIES = [
  "daily",
  "weekly",
  "biweekly",
  "monthly",
  "semi_monthly",
  "annually",
  "custom",
] as const;

export const PAY_CYCLES = [
  "weekly",
  "biweekly",
  "semi_monthly",
  "monthly",
  "annually",
] as const;

export const FILING_STATUSES = ["single", "married_jointly", "married_separately", "head_of_household"] as const;

export const TAX_YEAR = 2026;

/** Progressive bracket: `rate` applies to income up to `upTo` (dollars), above the previous bracket. */
export interface TaxBracket {
  upTo: number;
  rate: number;
}

type FilingStatusKey = (typeof FILING_STATUSES)[number];

function brackets(rates: number[], bounds: number[]): TaxBracket[] {
  return rates.map((rate, i) => ({ upTo: bounds[i] ?? Infinity, rate }));
}

const FED_RATES = [0.10, 0.12, 0.22, 0.24, 0.32, 0.35, 0.37];

// 2026 federal brackets (IRS, OBBBA inflation adjustments)
export const FEDERAL_TAX_BRACKETS: Record<FilingStatusKey, TaxBracket[]> = {
  single: brackets(FED_RATES, [12400, 50400, 105700, 201775, 256225, 640600]),
  married_jointly: brackets(FED_RATES, [24800, 100800, 211400, 403550, 512450, 768700]),
  married_separately: brackets(FED_RATES, [12400, 50400, 105700, 201775, 256225, 384350]),
  head_of_household: brackets(FED_RATES, [17700, 67450, 105700, 201750, 256200, 640600]),
};

export const STANDARD_DEDUCTIONS: Record<FilingStatusKey, number> = {
  single: 16100,
  married_jointly: 32200,
  married_separately: 16100,
  head_of_household: 24150,
};

// FICA (2026)
export const SOCIAL_SECURITY_RATE = 0.062;
export const SOCIAL_SECURITY_WAGE_BASE = 184500;
export const MEDICARE_RATE = 0.0145;
export const MEDICARE_ADDITIONAL_RATE = 0.009;
export const MEDICARE_ADDITIONAL_THRESHOLD = 200000;

// New York State (2026)
const NY_RATES = [0.039, 0.044, 0.0515, 0.054, 0.059, 0.0685, 0.0965, 0.103, 0.109];
const NY_SINGLE_BOUNDS = [8500, 11700, 13900, 80650, 215400, 1077550, 5000000, 25000000];

export const NY_TAX_BRACKETS: Record<FilingStatusKey, TaxBracket[]> = {
  single: brackets(NY_RATES, NY_SINGLE_BOUNDS),
  married_separately: brackets(NY_RATES, NY_SINGLE_BOUNDS),
  married_jointly: brackets(NY_RATES, [17150, 23600, 27900, 161550, 323200, 2155350, 5000000, 25000000]),
  head_of_household: brackets(NY_RATES, [12800, 17650, 20900, 107650, 269300, 1616450, 5000000, 25000000]),
};

export const NY_STANDARD_DEDUCTIONS: Record<FilingStatusKey, number> = {
  single: 8000,
  married_jointly: 16050,
  married_separately: 8000,
  head_of_household: 11200,
};

// New York City resident tax
const NYC_RATES = [0.03078, 0.03762, 0.03819, 0.03876];

export const NYC_TAX_BRACKETS: Record<FilingStatusKey, TaxBracket[]> = {
  single: brackets(NYC_RATES, [12000, 25000, 50000]),
  married_separately: brackets(NYC_RATES, [12000, 25000, 50000]),
  married_jointly: brackets(NYC_RATES, [21600, 45000, 90000]),
  head_of_household: brackets(NYC_RATES, [14400, 30000, 60000]),
};

// NY Disability (SDI) and Paid Family Leave employee contributions (2026)
export const NY_SDI_RATE = 0.005;
export const NY_SDI_ANNUAL_MAX = 31.2; // $0.60/week × 52
export const NY_PFL_RATE = 0.00432;
export const NY_PFL_ANNUAL_MAX = 411.91;
