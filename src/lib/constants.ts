export const DEFAULT_CATEGORIES = [
  { name: "salary", color: "#22c55e", icon: "Banknote", isDefault: true },
  { name: "bills", color: "#ef4444", icon: "Receipt", isDefault: true },
  { name: "subscriptions", color: "#8b5cf6", icon: "Repeat", isDefault: true },
  { name: "auto", color: "#f59e0b", icon: "Car", isDefault: true },
  { name: "grocery", color: "#10b981", icon: "ShoppingCart", isDefault: true },
  { name: "credit", color: "#6366f1", icon: "CreditCard", isDefault: true },
  { name: "entertainment", color: "#ec4899", icon: "Gamepad2", isDefault: true },
  { name: "dining", color: "#f97316", icon: "UtensilsCrossed", isDefault: true },
  { name: "healthcare", color: "#06b6d4", icon: "HeartPulse", isDefault: true },
  { name: "transfer", color: "#64748b", icon: "ArrowLeftRight", isDefault: true },
  { name: "other", color: "#94a3b8", icon: "MoreHorizontal", isDefault: true },
] as const;

export const ACCOUNT_TYPES = ["bank", "credit_card", "debt"] as const;

export const TRANSACTION_TYPES = ["credit", "debit"] as const;

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

// 2024 Federal Tax Brackets
export const FEDERAL_TAX_BRACKETS = {
  single: [
    { min: 0, max: 11600, rate: 0.10 },
    { min: 11600, max: 47150, rate: 0.12 },
    { min: 47150, max: 100525, rate: 0.22 },
    { min: 100525, max: 191950, rate: 0.24 },
    { min: 191950, max: 243725, rate: 0.32 },
    { min: 243725, max: 609350, rate: 0.35 },
    { min: 609350, max: Infinity, rate: 0.37 },
  ],
  married_jointly: [
    { min: 0, max: 23200, rate: 0.10 },
    { min: 23200, max: 94300, rate: 0.12 },
    { min: 94300, max: 201050, rate: 0.22 },
    { min: 201050, max: 383900, rate: 0.24 },
    { min: 383900, max: 487450, rate: 0.32 },
    { min: 487450, max: 731200, rate: 0.35 },
    { min: 731200, max: Infinity, rate: 0.37 },
  ],
  married_separately: [
    { min: 0, max: 11600, rate: 0.10 },
    { min: 11600, max: 47150, rate: 0.12 },
    { min: 47150, max: 100525, rate: 0.22 },
    { min: 100525, max: 191950, rate: 0.24 },
    { min: 191950, max: 243725, rate: 0.32 },
    { min: 243725, max: 365600, rate: 0.35 },
    { min: 365600, max: Infinity, rate: 0.37 },
  ],
  head_of_household: [
    { min: 0, max: 16550, rate: 0.10 },
    { min: 16550, max: 63100, rate: 0.12 },
    { min: 63100, max: 100500, rate: 0.22 },
    { min: 100500, max: 191950, rate: 0.24 },
    { min: 191950, max: 243700, rate: 0.32 },
    { min: 243700, max: 609350, rate: 0.35 },
    { min: 609350, max: Infinity, rate: 0.37 },
  ],
} as const;

// FICA
export const SOCIAL_SECURITY_RATE = 0.062;
export const SOCIAL_SECURITY_WAGE_BASE = 168600;
export const MEDICARE_RATE = 0.0145;
export const MEDICARE_ADDITIONAL_RATE = 0.009;
export const MEDICARE_ADDITIONAL_THRESHOLD = 200000;

// Standard Deductions 2024
export const STANDARD_DEDUCTIONS = {
  single: 14600,
  married_jointly: 29200,
  married_separately: 14600,
  head_of_household: 21900,
} as const;
