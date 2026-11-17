// Transaction routes (R11–R15) as store-backed handlers, shared by the server and browser data modes.
// Same signs and caps as src/app/api/transactions/route.ts and [transactionId]/route.ts. A PUT
// resolves and checks the new state before its first write (a refused edit changes nothing), and
// drops the fields the new state does not use: toAccountId off a transfer, recurrenceRule off a
// recurring transaction (bug 2).
// Pure: no framework, browser or server imports (browser-reachable).

import { fail, isId, notFound, ok, type ApiResult, type Handler } from "@/lib/data/api";
import type { Collection } from "@/lib/data/store";
import { filterDate, isFutureDated, toIso } from "@/lib/finance/dates";
import { transactionSchema, type TransactionInput } from "@/lib/finance/validators";
import {
  accounts,
  assertId,
  buildRule,
  isDebtType,
  requiredText,
  shapeAccount,
  shapeTransaction,
  transactions,
  type AccountDoc,
  type TransactionDoc,
} from "./docs";
import { clearTransactionLinks } from "./links";

const TRANSACTION = "Transaction";

/** Largest `limit` a list request may ask for. */
const MAX_LIMIT = 500;
/**
 * Scalar fields a list may sort by: the transactions table's server-side sorts (date, amount)
 * and createdAt (creation order, read by the parity tooling).
 */
const SORT_FIELDS: readonly string[] = ["date", "amount", "createdAt"];


/** `Account.findById` as a hydrated document: shaped, or null. */
async function findAccount(acc: Collection<AccountDoc>, id: string): Promise<AccountDoc | null> {
  const raw = await acc.findById(id);
  return raw ? shapeAccount(raw) : null;
}

/** `transactionSchema.parse`; a ZodError is the routes' 400 with the error as JSON in `details`. */
function parseTransaction(body: unknown): { data: TransactionInput } | { result: ApiResult } {
  try {
    return { data: transactionSchema.parse(body) };
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") {
      return { result: fail(400, "Validation failed", JSON.parse(JSON.stringify(error))) };
    }
    throw error;
  }
}

/**
 * The stored fields of `{ ...validated, amount, balanceApplied }` as Mongoose casts them
 * (T4 / T19): dates to ISO instants, text trimmed, ids checked, the rule with its defaults.
 * Optional fields absent from the body are absent here, so an update keeps them.
 */
function transactionFields(v: TransactionInput, amount: number, balanceApplied: boolean): Record<string, unknown> {
  const doc: Record<string, unknown> = {
    amount,
    date: toIso(v.date),
    description: requiredText(v.description, "description"),
    accountId: v.accountId,
    type: v.type,
    isRecurring: v.isRecurring,
    categoryTags: v.categoryTags.map((tag) => tag.trim()),
    balanceApplied,
  };
  if (v.toAccountId !== undefined) {
    assertId(v.toAccountId);
    doc.toAccountId = v.toAccountId;
  }
  if (v.notes !== undefined) doc.notes = v.notes.trim();
  if (v.recurrenceRule !== undefined) doc.recurrenceRule = buildRule(v.recurrenceRule);
  return doc;
}

/** A balance change to one account. */
interface BalanceChange {
  accountId: string;
  delta: number;
}

/**
 * The balance changes that undo an applied transaction (PUT and DELETE share them): the opposite
 * signs of the apply paths. Reads only; `applyChanges` writes them.
 */
async function reversalOf(acc: Collection<AccountDoc>, existing: TransactionDoc): Promise<BalanceChange[]> {
  if (existing.type === "transfer" && existing.toAccountId) {
    if (existing.amount <= 0) return [];
    const oldSource = await findAccount(acc, existing.accountId); // T10 / T21
    const oldDest = await findAccount(acc, existing.toAccountId); // T11 / T22
    const oldIsDebtSource = isDebtType(oldSource?.type);
    const oldIsDebtDest = isDebtType(oldDest?.type);
    return [
      { accountId: existing.accountId, delta: oldIsDebtSource ? -existing.amount : existing.amount },
      { accountId: existing.toAccountId, delta: oldIsDebtDest ? existing.amount : -existing.amount },
    ];
  }
  const oldAcct = await findAccount(acc, existing.accountId); // T13 / T24
  const oldIsDebt = isDebtType(oldAcct?.type);
  let reversal: number;
  if (oldIsDebt) {
    reversal = existing.type === "credit" ? existing.amount : -existing.amount;
  } else {
    reversal = existing.type === "credit" ? -existing.amount : existing.amount;
  }
  return [{ accountId: existing.accountId, delta: reversal }];
}

/** Writes balance changes: one change as a single update, two as one batch (T12 / T23, T14 / T25). */
async function applyChanges(acc: Collection<AccountDoc>, changes: BalanceChange[]): Promise<void> {
  if (changes.length === 1) {
    await acc.updateById(changes[0].accountId, { $inc: { balance: changes[0].delta } });
  } else if (changes.length > 1) {
    await acc.batchUpdate(changes.map((c) => ({ filter: { _id: c.accountId }, update: { $inc: { balance: c.delta } } })));
  }
}

/** `account` with `changes` to it applied in memory (the balance it has once they are written). */
function afterChanges(account: AccountDoc, changes: BalanceChange[]): AccountDoc {
  const delta = changes.filter((c) => c.accountId === account._id).reduce((sum, c) => sum + c.delta, 0);
  return delta === 0 ? account : { ...account, balance: account.balance + delta };
}

/** GET /api/transactions — filters, sort and paging; `data` is the stored documents as they are. */
export const listTransactions: Handler = async ({ store, query }) => {
  const accountId = query.get("accountId");
  const startDate = query.get("startDate");
  const endDate = query.get("endDate");
  const type = query.get("type");
  const category = query.get("category");
  const isRecurring = query.get("isRecurring");
  const search = query.get("search");
  const pageParam = query.get("page") || "1";
  const limitParam = query.get("limit") || "20";
  const sort = query.get("sort") || "date";
  const order = query.get("order") || "desc";

  // Read-only, so the order of these checks does not matter
  const page = /^\d+$/.test(pageParam) ? Number(pageParam) : NaN;
  if (!(page >= 1) || !Number.isSafeInteger(page)) return fail(400, "Invalid page");
  const limit = /^\d+$/.test(limitParam) ? Number(limitParam) : NaN;
  if (!(limit >= 1 && limit <= MAX_LIMIT)) return fail(400, "Invalid limit");
  if (!SORT_FIELDS.includes(sort)) return fail(400, "Invalid sort");
  if (order !== "asc" && order !== "desc") return fail(400, "Invalid order");

  const filter: Record<string, unknown> = {};

  if (accountId) {
    assertId(accountId);
    // Only a transfer has a destination: a debit or credit stored with a stale toAccountId is not listed there
    filter.$or = [{ accountId }, { toAccountId: accountId, type: "transfer" }];
  }

  if (startDate || endDate) {
    const date: Record<string, unknown> = {};
    if (startDate) date.$gte = filterDate(startDate);
    if (endDate) date.$lte = filterDate(endDate);
    filter.date = date;
  }

  if (type) filter.type = type;
  if (category) filter.categoryTags = category;
  if (isRecurring) filter.isRecurring = isRecurring === "true";
  if (search) filter.description = { $regex: search, $options: "i" };

  const skip = (page - 1) * limit;
  const sortOrder = order === "asc" ? 1 : -1;

  const txs = transactions(store);
  // T1, T2
  const [data, total] = await Promise.all([
    txs.find(filter, { sort: { [sort]: sortOrder }, skip, limit }),
    txs.count(filter),
  ]);

  const totalPages = Math.ceil(total / limit);

  return ok({ data, pagination: { page, limit, total, totalPages } });
};

/** POST /api/transactions — caps, insert, then the balance effect unless recurring or future. */
export const createTransaction: Handler = async ({ store, body, now }) => {
  const parsed = parseTransaction(body);
  if ("result" in parsed) return parsed.result;
  const validated = parsed.data;
  assertId(validated.accountId);
  if (validated.toAccountId !== undefined) assertId(validated.toAccountId);

  const acc = accounts(store);
  const amountInCents = Math.round(validated.amount * 100);

  let finalAmountInCents = amountInCents;
  let sourceAccount: AccountDoc | null = null;
  let destAccount: AccountDoc | null = null;

  if (validated.type === "transfer") {
    // T3
    [sourceAccount, destAccount] = await Promise.all([
      findAccount(acc, validated.accountId),
      findAccount(acc, validated.toAccountId as string),
    ]);

    if (!sourceAccount || !destAccount) return fail(400, "Source or destination account not found");

    if (!validated.isRecurring) {
      // Credit limit cap: positive balance = amount owed, so available = creditLimit - balance
      if (sourceAccount.type === "credit_card" && sourceAccount.creditLimit) {
        const availableCredit = sourceAccount.creditLimit - sourceAccount.balance;
        if (availableCredit <= 0) {
          finalAmountInCents = 0;
        } else {
          finalAmountInCents = Math.min(finalAmountInCents, availableCredit);
        }
      }

      // Debt cap: a credit card or debt destination is capped at what is still owed
      if (destAccount.type === "credit_card" || destAccount.type === "debt") {
        const owed = destAccount.balance;
        if (owed <= 0) {
          finalAmountInCents = 0;
        } else {
          finalAmountInCents = Math.min(finalAmountInCents, owed);
        }
      }
    }
  }

  const isFuture = isFutureDated(validated.date, now);

  // T4
  const transaction = await transactions(store).insert(
    transactionFields(validated, finalAmountInCents, !isFuture && !validated.isRecurring) as Omit<
      TransactionDoc,
      "_id" | "createdAt" | "updatedAt"
    >,
  );

  // Only non-recurring, non-future transactions change balances
  if (!validated.isRecurring && !isFuture) {
    if (validated.type === "transfer") {
      if (finalAmountInCents > 0) {
        const isDebtSource = isDebtType(sourceAccount?.type);
        const isDebtDest = isDebtType(destAccount?.type);
        // T5: a debt/card source owes more (+), a bank source pays out (-);
        // a debt/card destination owes less (-), a bank destination receives (+)
        await acc.batchUpdate([
          { filter: { _id: validated.accountId }, update: { $inc: { balance: isDebtSource ? finalAmountInCents : -finalAmountInCents } } },
          { filter: { _id: validated.toAccountId }, update: { $inc: { balance: isDebtDest ? -finalAmountInCents : finalAmountInCents } } },
        ]);
      }
    } else {
      const account = await findAccount(acc, validated.accountId); // T6
      const isDebt = isDebtType(account?.type);
      // Debt/card: a credit (payment) lowers what is owed, a debit (charge) raises it; bank: the reverse
      let balanceChange: number;
      if (isDebt) {
        balanceChange = validated.type === "credit" ? -finalAmountInCents : finalAmountInCents;
      } else {
        balanceChange = validated.type === "credit" ? finalAmountInCents : -finalAmountInCents;
      }
      await acc.updateById(validated.accountId, { $inc: { balance: balanceChange } }); // T7
    }
  }

  return ok(shapeTransaction(transaction), 201);
};

/** GET /api/transactions/:transactionId — the stored document as it is. */
export const getTransaction: Handler = async ({ store, params }) => {
  if (!isId(params.transactionId)) return notFound(TRANSACTION);
  const transaction = await transactions(store).findById(params.transactionId); // T8
  return transaction ? ok(transaction) : notFound(TRANSACTION);
};

/**
 * PUT /api/transactions/:transactionId — reverse the old effect, apply the new one, then update.
 * Everything that can refuse the edit (ids, the new accounts, the stored fields) is checked
 * before the first write, so a refused edit leaves balances and the transaction as they were.
 */
export const updateTransaction: Handler = async ({ store, params, body, now }) => {
  if (!isId(params.transactionId)) return notFound(TRANSACTION);
  const transactionId = params.transactionId;
  const txs = transactions(store);
  const raw = await txs.findById(transactionId); // T9
  if (!raw) return notFound(TRANSACTION);
  const existing = shapeTransaction(raw);

  const parsed = parseTransaction(body);
  if ("result" in parsed) return parsed.result;
  const validated = parsed.data;

  const acc = accounts(store);
  const newAmountInCents = Math.round(validated.amount * 100);
  const newIsFuture = isFutureDated(validated.date, now);
  const shouldApplyNew = !validated.isRecurring && !newIsFuture;
  const isTransfer = validated.type === "transfer" && !validated.isRecurring;

  // Resolve and check the new state before any write: malformed ids and unusable fields throw
  // (the route's 500), a missing transfer account is the 400. The amount is set below.
  assertId(validated.accountId);
  const fields = transactionFields(validated, newAmountInCents, shouldApplyNew); // asserts toAccountId when present
  const toAccountId = validated.toAccountId as string;
  let sourceAccount: AccountDoc | null = null;
  let destAccount: AccountDoc | null = null;
  if (isTransfer) {
    // T15 (the schema requires toAccountId for a transfer, so it was asserted above)
    [sourceAccount, destAccount] = await Promise.all([findAccount(acc, validated.accountId), findAccount(acc, toAccountId)]);
    if (!sourceAccount || !destAccount) return fail(400, "Source or destination account not found");
  }

  // The old effect is undone only if it was applied to balances
  const reversal = existing.balanceApplied ? await reversalOf(acc, existing) : [];

  let finalNewAmount = newAmountInCents;
  let newEffect: BalanceChange[] = [];

  if (isTransfer && sourceAccount && destAccount) {
    // Caps see the balances as they are once the old effect is undone
    const source = afterChanges(sourceAccount, reversal);
    const dest = afterChanges(destAccount, reversal);
    const isDebtSource = isDebtType(source.type);
    const isDebtDest = isDebtType(dest.type);

    // Credit limit cap (positive balance = owed, available = limit - owed)
    if (source.type === "credit_card" && source.creditLimit) {
      const availableCredit = source.creditLimit - source.balance;
      if (availableCredit <= 0) {
        finalNewAmount = 0;
      } else {
        finalNewAmount = Math.min(finalNewAmount, availableCredit);
      }
    }

    // Debt cap (positive balance = owed)
    if (isDebtDest) {
      const owed = dest.balance;
      if (owed <= 0) {
        finalNewAmount = 0;
      } else {
        finalNewAmount = Math.min(finalNewAmount, owed);
      }
    }

    if (shouldApplyNew && finalNewAmount > 0) {
      newEffect = [
        { accountId: validated.accountId, delta: isDebtSource ? finalNewAmount : -finalNewAmount },
        { accountId: toAccountId, delta: isDebtDest ? -finalNewAmount : finalNewAmount },
      ];
    }
  } else if (shouldApplyNew) {
    const newAcct = await findAccount(acc, validated.accountId); // T17
    const newIsDebt = isDebtType(newAcct?.type);
    let delta: number;
    if (newIsDebt) {
      delta = validated.type === "credit" ? -newAmountInCents : newAmountInCents;
    } else {
      delta = validated.type === "credit" ? newAmountInCents : -newAmountInCents;
    }
    newEffect = [{ accountId: validated.accountId, delta }];
  }

  // Fields the new state does not use are removed, not kept from the old one (bug 2). A managed
  // amountSchedule stays: the Datasheet or payment plan that wrote it still owns it.
  const unset: Record<string, 1> = {};
  if (validated.type !== "transfer") {
    delete fields.toAccountId;
    unset.toAccountId = 1;
  }
  if (!validated.isRecurring) {
    delete fields.recurrenceRule;
    unset.recurrenceRule = 1;
  }

  // Writes: the reversal, the new effect (T16 / T18), then the document (T19)
  await applyChanges(acc, reversal);
  await applyChanges(acc, newEffect);
  fields.amount = validated.type === "transfer" ? finalNewAmount : newAmountInCents;
  const updated = await txs.updateById(transactionId, {
    $set: fields,
    ...(Object.keys(unset).length ? { $unset: unset } : {}),
  });
  return ok(updated);
};

/** DELETE /api/transactions/:transactionId — reverse if applied, delete, then clear every link to it. */
export const deleteTransaction: Handler = async ({ store, params }) => {
  if (!isId(params.transactionId)) return notFound(TRANSACTION);
  const transactionId = params.transactionId;
  const txs = transactions(store);
  const raw = await txs.findById(transactionId); // T20
  if (!raw) return notFound(TRANSACTION);
  const transaction = shapeTransaction(raw);

  const acc = accounts(store);
  // Only reverse the balance if it was applied
  if (transaction.balanceApplied) await applyChanges(acc, await reversalOf(acc, transaction));

  await txs.deleteById(transactionId); // T26
  // A deleted payment-plan transfer leaves no plan behind (T27); the Datasheet loses its link (bug 7)
  await clearTransactionLinks(store, [transactionId]);

  return ok({ message: "Transaction deleted successfully" });
};
