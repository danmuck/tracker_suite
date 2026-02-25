import { z } from "zod";

export const accountSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  type: z.enum(["bank", "credit_card", "debt"]),
  balance: z.number(),
  creditLimit: z.number().optional(),
  isLoan: z.boolean().optional(),
  linkedAccountId: z.string().optional(),
  currency: z.string().default("USD"),
  notes: z.string().max(500).optional(),
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
  type: z.enum(["credit", "debit"]),
  isRecurring: z.boolean().default(false),
  recurrenceRule: recurrenceRuleSchema.optional(),
  categoryTags: z.array(z.string()).default([]),
  notes: z.string().max(500).optional(),
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
