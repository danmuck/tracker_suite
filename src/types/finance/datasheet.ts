import type { FilingStatus } from "@/lib/finance/tax-calculator";

// All money in cents, dates as "yyyy-MM-dd"
export interface SalaryStep { effectiveDate: string; annualGross: number }
export interface RetirementStep { effectiveDate: string; percent: number } // 0.06 = 6%
export interface HealthStep { effectiveDate: string; perPaycheck: number }
export interface RentStep { effectiveDate: string; monthly: number }
export interface WhatIfSalary { label?: string; annualGross: number }

export interface FinanceProfileData {
  filingStatus: FilingStatus;
  hoursPerWeek: number;
  nycResident: boolean;
  raiseRate: number; // 0.03 = 3%, 10-year table only
  salaryTransactionId?: string | null;
  rentTransactionId?: string | null;
  salarySteps: SalaryStep[];
  retirementSteps: RetirementStep[];
  healthSteps: HealthStep[];
  rentSteps: RentStep[];
  whatIfSalaries: WhatIfSalary[];
}

export interface SalaryRow {
  hourly: number;
  weeklyGross: number;
  monthlyGross: number;
  annualGross: number;
  weeklyNet: number;
  monthlyNet: number;
  annualNet: number;
}

export interface ScheduleEntry {
  effectiveDate: string;
  amount: number;
}
