import { z } from "zod";
import { transactionSchema, type TransactionInput } from "./validators";

/**
 * What-if changes layered over real transactions for a projection.
 * Nothing here is ever written to the database.
 */
export const sandboxSchema = z.object({
  /** New transactions that exist only in the sandbox */
  added: z.array(z.object({ id: z.string().min(1).max(64), data: transactionSchema })).max(200).default([]),
  /** Replacement values for real transactions, keyed by transaction id */
  edited: z.record(z.string(), transactionSchema).default({}),
  /** Real transactions left out of the projection */
  removed: z.array(z.string()).max(500).default([]),
});

export type SandboxInput = z.infer<typeof sandboxSchema>;

/** The fields the projection engine reads from a transaction */
export interface SandboxBaseTx {
  _id: { toString(): string };
  amount: number;
  balanceApplied?: boolean;
  amountSchedule?: unknown[];
}

/** Turn form-style input (dollars, ISO date strings) into the shape the engine reads */
export function toEngineTransaction(id: string, data: TransactionInput, base?: SandboxBaseTx) {
  const amount = Math.round(data.amount * 100);
  const rule = data.isRecurring ? data.recurrenceRule : undefined;
  return {
    _id: id,
    amount,
    date: new Date(data.date),
    description: data.description,
    accountId: data.accountId,
    toAccountId: data.type === "transfer" ? data.toAccountId : undefined,
    type: data.type,
    isRecurring: !!rule,
    recurrenceRule: rule && {
      frequency: rule.frequency,
      interval: rule.interval ?? 1,
      startDate: new Date(rule.startDate),
      endDate: rule.endDate ? new Date(rule.endDate) : null,
      dayOfWeek: rule.dayOfWeek,
      dayOfMonth: rule.dayOfMonth,
      daysOfMonth: rule.daysOfMonth ?? [],
    },
    categoryTags: data.categoryTags,
    // A sandbox change never touched stored balances; an edit keeps what the original did
    balanceApplied: base?.balanceApplied ?? false,
    // Datasheet / payment-plan amounts still apply unless the amount itself was changed
    amountSchedule: base && base.amount === amount ? base.amountSchedule : undefined,
  };
}

/** Real transactions with the sandbox applied: removals dropped, edits swapped in, additions appended */
export function applySandbox<T extends SandboxBaseTx>(transactions: T[], sandbox: SandboxInput) {
  const removed = new Set(sandbox.removed);
  const out: (T | ReturnType<typeof toEngineTransaction>)[] = [];
  for (const t of transactions) {
    const id = t._id.toString();
    if (removed.has(id)) continue;
    const edit = sandbox.edited[id];
    out.push(edit ? toEngineTransaction(id, edit, t) : t);
  }
  for (const a of sandbox.added) out.push(toEngineTransaction(a.id, a.data));
  return out;
}
