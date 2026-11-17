// Sample Finance data: invented accounts, merchants and round numbers, nothing real.
// Request bodies in the API's units (dollars, percent, yyyy-MM-dd); loadSampleData sends them
// through the real handlers so balances and every derived field are what the app produces.

import { addDays, addMonths, format, startOfMonth, startOfYear } from "date-fns";
import type { AccountFormData } from "@/types/finance/account";
import type { FinanceProfileData } from "@/types/finance/datasheet";
import type { TransactionFormData } from "@/types/finance/transaction";

export type FinanceSampleAccount = AccountFormData & { key: string };

export type FinanceSampleTransaction = Omit<TransactionFormData, "accountId" | "toAccountId" | "date"> & {
  /** Set on the recurring Salary and Rent transactions the profile links to */
  key?: string;
  /** `key` of the source account */
  account: string;
  /** `key` of the destination account (transfers) */
  toAccount?: string;
  date: string;
};

export interface FinanceSample {
  accounts: FinanceSampleAccount[];
  transactions: FinanceSampleTransaction[];
  profile: Omit<FinanceProfileData, "salaryTransactionId" | "rentTransactionId">;
}

export function financeSample(today: Date): FinanceSample {
  const day = (offset: number) => format(addDays(today, offset), "yyyy-MM-dd");
  const oneOff = (
    offset: number,
    type: TransactionFormData["type"],
    account: string,
    amount: number,
    description: string,
    categoryTags: string[],
    toAccount?: string,
  ): FinanceSampleTransaction => ({
    type,
    account,
    ...(toAccount ? { toAccount } : {}),
    amount,
    description,
    categoryTags,
    date: day(offset),
    isRecurring: false,
  });

  const salaryStart = day(-56);
  const rentStart = format(startOfMonth(addMonths(today, -3)), "yyyy-MM-dd");
  const lastYear = format(startOfYear(addMonths(today, -12)), "yyyy-MM-dd");

  return {
    accounts: [
      { key: "checking", name: "Everyday Checking (sample)", type: "bank", balance: 3200 },
      { key: "savings", name: "Rainy Day Savings (sample)", type: "bank", balance: 12500 },
      { key: "card", name: "Example Rewards Card", type: "credit_card", balance: 480, creditLimit: 4000, apr: 21.99, minimumPayment: 35 },
      { key: "loan", name: "Example Auto Loan", type: "debt", balance: 9800, isLoan: true, apr: 6.9, minimumPayment: 245 },
    ],
    transactions: [
      oneOff(-27, "debit", "checking", 86.4, "Groceries at Example Mart", ["spending"]),
      oneOff(-24, "debit", "card", 14.99, "StreamFlix (sample)", ["subscriptions"]),
      oneOff(-21, "debit", "checking", 120, "Electric bill (sample)", ["bills"]),
      oneOff(-18, "credit", "checking", 250, "Year-end bonus (sample)", ["bonus"]),
      oneOff(-15, "debit", "card", 62.3, "Dinner at Sample Bistro", ["spending"]),
      oneOff(-12, "transfer", "checking", 300, "Move to savings", ["transfer"], "savings"),
      oneOff(-9, "debit", "checking", 45, "Phone bill (sample)", ["bills"]),
      oneOff(-6, "transfer", "checking", 200, "Card payment", ["credit", "transfer"], "card"),
      oneOff(-4, "debit", "card", 38.75, "Example Hardware", ["other"]),
      oneOff(-2, "debit", "checking", 64.1, "Groceries at Example Mart", ["spending"]),
      oneOff(3, "debit", "checking", 55, "Internet bill (sample)", ["bills"]),
      oneOff(8, "transfer", "checking", 245, "Auto loan payment", ["loans", "transfer"], "loan"),
      {
        key: "salary",
        type: "credit",
        account: "checking",
        amount: 2150,
        description: "Salary (sample)",
        categoryTags: ["salary"],
        date: salaryStart,
        isRecurring: true,
        recurrenceRule: { frequency: "biweekly", startDate: salaryStart },
      },
      {
        key: "rent",
        type: "debit",
        account: "checking",
        amount: 1450,
        description: "Rent (sample)",
        categoryTags: ["bills"],
        date: rentStart,
        isRecurring: true,
        recurrenceRule: { frequency: "monthly", dayOfMonth: 1, startDate: rentStart },
      },
    ],
    profile: {
      filingStatus: "single",
      hoursPerWeek: 40,
      nycResident: false,
      raiseRate: 0.03,
      salarySteps: [{ effectiveDate: lastYear, annualGross: 78000 }],
      retirementSteps: [{ effectiveDate: lastYear, percent: 0.05 }],
      healthSteps: [{ effectiveDate: lastYear, perPaycheck: 90 }],
      rentSteps: [{ effectiveDate: rentStart, monthly: 1450 }],
      whatIfSalaries: [{ label: "Promotion (sample)", annualGross: 90000 }],
    },
  };
}
