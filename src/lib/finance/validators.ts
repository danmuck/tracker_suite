import { z } from "zod";

export const accountSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  type: z.enum(["bank", "credit_card", "debt"]),
  balance: z.number(),
  creditLimit: z.number().optional(),
  isLoan: z.boolean().optional(),
  linkedAccountId: z.string().optional(),
  /** Create only: deposit the loan amount into the linked bank account */
  depositFunds: z.boolean().optional(),
  currency: z.string().default("USD"),
  notes: z.string().max(500).optional(),
  apr: z.number().min(0).max(100).nullable().optional(), // percent
  minimumPayment: z.number().min(0).nullable().optional(), // dollars
});

export const accountArchiveSchema = z.object({
  isArchived: z.boolean(),
});

export const recurrenceRuleSchema = z.object({
  frequency: z.enum(["daily", "weekly", "biweekly", "monthly", "semi_monthly", "annually", "custom"]),
  interval: z.number().int().min(1).optional(),
  startDate: z.string(),
  endDate: z.string().nullable().optional(),
  dayOfWeek: z.number().int().min(0).max(6).optional(),
  dayOfMonth: z.number().int().min(1).max(31).optional(),
  daysOfMonth: z.array(z.number().int().min(1).max(31)).optional(),
});

export const transactionSchema = z.object({
  amount: z.number().positive("Amount must be positive"),
  date: z.string(),
  description: z.string().min(1, "Description is required").max(200),
  accountId: z.string().min(1, "Account is required"),
  toAccountId: z.string().optional(),
  type: z.enum(["credit", "debit", "transfer"]),
  isRecurring: z.boolean().default(false),
  recurrenceRule: recurrenceRuleSchema.optional(),
  categoryTags: z.array(z.string()).default([]),
  notes: z.string().max(500).optional(),
}).superRefine((data, ctx) => {
  if (data.type === "transfer") {
    if (!data.toAccountId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Destination account is required for transfers",
        path: ["toAccountId"],
      });
    } else if (data.toAccountId === data.accountId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Cannot transfer to the same account",
        path: ["toAccountId"],
      });
    }
  }
});

export const categorySchema = z.object({
  name: z.string().min(1, "Name is required").max(50),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Must be a valid hex color"),
  icon: z.string().min(1),
  isDefault: z.boolean().default(false),
});

export type AccountInput = z.infer<typeof accountSchema>;
export type TransactionInput = z.infer<typeof transactionSchema>;
export type CategoryInput = z.infer<typeof categorySchema>;

// ── Finance profile (Datasheet). Money arrives in dollars; the API converts to cents. ──
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be yyyy-MM-dd");
const dollars = z.number().min(0).max(100_000_000);

function uniqueDates(kind: string) {
  return (steps: { effectiveDate: string }[], ctx: z.RefinementCtx) => {
    const seen = new Set<string>();
    for (const s of steps) {
      if (seen.has(s.effectiveDate)) {
        ctx.addIssue({ code: "custom", message: `Duplicate date in ${kind} changes` });
        return;
      }
      seen.add(s.effectiveDate);
    }
  };
}

export const financeProfileSchema = z.object({
  filingStatus: z.enum(["single", "married_jointly", "married_separately", "head_of_household"]),
  hoursPerWeek: z.number().min(1).max(80),
  nycResident: z.boolean(),
  raiseRate: z.number().min(0).max(0.5),
  salaryTransactionId: z.string().nullable().optional(),
  rentTransactionId: z.string().nullable().optional(),
  salarySteps: z
    .array(z.object({ effectiveDate: isoDate, annualGross: dollars }))
    .min(1, "Add at least one salary")
    .superRefine(uniqueDates("salary")),
  retirementSteps: z
    .array(z.object({ effectiveDate: isoDate, percent: z.number().min(0).max(1) }))
    .superRefine(uniqueDates("401(k)")),
  healthSteps: z
    .array(z.object({ effectiveDate: isoDate, perPaycheck: dollars }))
    .superRefine(uniqueDates("health")),
  rentSteps: z
    .array(z.object({ effectiveDate: isoDate, monthly: dollars }))
    .superRefine(uniqueDates("rent")),
  whatIfSalaries: z.array(z.object({ label: z.string().max(50).optional(), annualGross: dollars })).max(20),
});

export type FinanceProfileInput = z.infer<typeof financeProfileSchema>;

// ── Debt / credit card payment plans. Money in dollars, rates in percent. ──
export const paymentPlanSetupSchema = z.object({
  fromAccountId: z.string().min(1, "Choose the account payments come from"),
  dayOfMonth: z.number().int().min(1).max(28),
  startDate: isoDate,
  firstAmount: z.number().min(0),
});

export const paymentPlanUpdateSchema = z.object({
  schedule: z
    .array(z.object({ effectiveDate: isoDate, amount: z.number().min(0) }))
    .superRefine(uniqueDates("payment"))
    .optional(),
  subLoans: z
    .array(z.object({ name: z.string().trim().min(1).max(60), balance: z.number().min(0), apr: z.number().min(0).max(100) }))
    .max(30)
    .optional(),
  rap: z
    .object({
      enabled: z.boolean(),
      autoSchedule: z.boolean(),
      recertDate: z.string().regex(/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, "Recert date must be MM-dd"),
      dependents: z.number().int().min(0).max(20),
    })
    .optional(),
});
