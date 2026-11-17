// Account routes (R1–R6) as store-backed handlers, shared by the server and browser data modes.
// Same order of reads and writes as src/app/api/accounts/route.ts and [accountId]/route.ts.
// Pure: no framework, browser or server imports (browser-reachable).

import { fail, invalid, isId, notFound, ok, type Handler } from "@/lib/data/api";
import { planFieldsToDb } from "@/lib/finance/account-plan-fields";
import { startOfTomorrow } from "@/lib/finance/dates";
import { accountArchiveSchema, accountSchema } from "@/lib/finance/validators";
import { accounts, assertId, requiredText, shapeAccount, shapeTransaction, transactions, type AccountDoc } from "./docs";
import { postDuePayments } from "./post-payments";

const ACCOUNT = "Account";

const isDebtType = (type: string | undefined) => type === "credit_card" || type === "debt";

/** GET /api/accounts — post due payments, apply pending transactions, then list. */
export const listAccounts: Handler = async ({ store, query, now }) => {
  await postDuePayments(store, now);

  const type = query.get("type");
  const includeArchived = query.get("includeArchived") === "true";
  const filter: Record<string, unknown> = {};
  if (type) filter.type = type;
  if (!includeArchived) filter.isArchived = { $ne: true };

  const acc = accounts(store);
  const txs = transactions(store);

  // Apply any pending transactions whose date has arrived (A1)
  const pending = (
    await txs.find({ balanceApplied: false, isRecurring: { $ne: true }, date: { $lt: startOfTomorrow(now).toISOString() } })
  ).map(shapeTransaction);

  for (const tx of pending) {
    if (tx.amount === 0) {
      await txs.updateById(tx._id, { $set: { balanceApplied: true } }); // A2
      continue;
    }

    if (tx.type === "transfer" && tx.toAccountId) {
      const [sourceRaw, destRaw] = await Promise.all([acc.findById(tx.accountId), acc.findById(tx.toAccountId)]); // A3
      const source = sourceRaw ? shapeAccount(sourceRaw) : null;
      const dest = destRaw ? shapeAccount(destRaw) : null;
      const isDebtSource = isDebtType(source?.type);
      const isDebtDest = isDebtType(dest?.type);
      // A4
      await acc.batchUpdate([
        { filter: { _id: tx.accountId }, update: { $inc: { balance: isDebtSource ? tx.amount : -tx.amount } } },
        { filter: { _id: tx.toAccountId }, update: { $inc: { balance: isDebtDest ? -tx.amount : tx.amount } } },
      ]);
    } else {
      const raw = await acc.findById(tx.accountId); // A5
      const isDebt = isDebtType(raw ? shapeAccount(raw).type : undefined);
      let balanceChange: number;
      if (isDebt) {
        balanceChange = tx.type === "credit" ? -tx.amount : tx.amount;
      } else {
        balanceChange = tx.type === "credit" ? tx.amount : -tx.amount;
      }
      await acc.updateById(tx.accountId, { $inc: { balance: balanceChange } }); // A6
    }

    await txs.updateById(tx._id, { $set: { balanceApplied: true } }); // A7
  }

  const list = await acc.find(filter, { sort: { createdAt: -1 } }); // A8
  return ok(list.map(shapeAccount));
};

/** POST /api/accounts — create; a new loan asked to deposit funds credits its linked account. */
export const createAccount: Handler = async ({ store, body, now }) => {
  const parsed = accountSchema.safeParse(body);
  if (!parsed.success) return invalid(parsed.error);

  const data = parsed.data;
  const balanceInCents = Math.round(data.balance * 100);

  // A9: the stored document as Account.create builds it (depositFunds and dollar apr /
  // minimumPayment are not stored; schema defaults written; trim applied).
  const doc: Record<string, unknown> = {
    name: requiredText(data.name, "name"),
    type: data.type,
    balance: balanceInCents,
    currency: data.currency,
    isCash: false,
    isArchived: false,
  };
  if (data.creditLimit !== undefined) doc.creditLimit = Math.round(data.creditLimit * 100);
  if (data.isLoan !== undefined) doc.isLoan = data.isLoan;
  if (data.linkedAccountId !== undefined) {
    assertId(data.linkedAccountId);
    doc.linkedAccountId = data.linkedAccountId;
  }
  if (data.notes !== undefined) doc.notes = data.notes.trim();
  Object.assign(doc, planFieldsToDb(data).set);

  const acc = accounts(store);
  const account = await acc.insert(doc as Omit<AccountDoc, "_id" | "createdAt" | "updatedAt">);

  // Side-effect: loan disbursement, only when asked
  if (data.depositFunds === true && account.type === "debt" && account.isLoan === true && account.linkedAccountId) {
    const linkedAccount = await acc.findById(account.linkedAccountId); // A10
    if (!linkedAccount) return fail(400, "Linked account not found for loan disbursement");

    await acc.updateById(account.linkedAccountId, { $inc: { balance: balanceInCents } }); // A11

    // A12
    await transactions(store).insert({
      accountId: account._id,
      toAccountId: account.linkedAccountId,
      type: "transfer",
      amount: balanceInCents,
      description: `Loan disbursement from ${account.name}`,
      categoryTags: ["transfer"],
      date: now.toISOString(),
      isRecurring: false,
      balanceApplied: true,
    });
  }

  return ok(shapeAccount(account), 201);
};

/** GET /api/accounts/:accountId — post due payments first, then look up. */
export const getAccount: Handler = async ({ store, params, now }) => {
  await postDuePayments(store, now);
  if (!isId(params.accountId)) return notFound(ACCOUNT);
  const account = await accounts(store).findById(params.accountId); // A13
  return account ? ok(shapeAccount(account)) : notFound(ACCOUNT);
};

/** PUT /api/accounts/:accountId — fields left out of the body are kept; apr / minimumPayment null are removed. */
export const updateAccount: Handler = async ({ store, params, body }) => {
  if (!isId(params.accountId)) return notFound(ACCOUNT);
  const acc = accounts(store);
  const raw = await acc.findById(params.accountId); // A14
  if (!raw) return notFound(ACCOUNT);
  const existing = shapeAccount(raw);

  // Prevent changing the type of the Cash account. Reads the raw body as today: a JSON null
  // body throws here for the Cash account (500); an unparseable body (undefined) skips it.
  if (
    existing.isCash &&
    body !== undefined &&
    (body as { type?: unknown }).type &&
    (body as { type?: unknown }).type !== "bank"
  ) {
    return fail(400, "Cannot change the type of the Cash account");
  }

  const parsed = accountSchema.safeParse(body);
  if (!parsed.success) return invalid(parsed.error);

  const data = parsed.data;
  const plan = planFieldsToDb(data);
  if (data.linkedAccountId !== undefined) assertId(data.linkedAccountId);
  const fields: Record<string, unknown> = {
    name: requiredText(data.name, "name"),
    type: data.type,
    balance: Math.round(data.balance * 100),
    currency: data.currency,
  };
  if (data.creditLimit !== undefined) fields.creditLimit = Math.round(data.creditLimit * 100);
  if (data.isLoan !== undefined) fields.isLoan = data.isLoan;
  if (data.linkedAccountId !== undefined) fields.linkedAccountId = data.linkedAccountId;
  if (data.notes !== undefined) fields.notes = data.notes.trim();
  Object.assign(fields, plan.set);

  // A15
  const updated = await acc.updateById(params.accountId, {
    $set: fields,
    ...(Object.keys(plan.unset).length ? { $unset: plan.unset } : {}),
  });
  return ok(updated ? shapeAccount(updated) : null);
};

/** PATCH /api/accounts/:accountId — archive or unarchive. */
export const archiveAccount: Handler = async ({ store, params, body }) => {
  if (!isId(params.accountId)) return notFound(ACCOUNT);
  const acc = accounts(store);
  const raw = await acc.findById(params.accountId); // A16
  if (!raw) return notFound(ACCOUNT);
  const account = shapeAccount(raw);

  const parsed = accountArchiveSchema.safeParse(body);
  if (!parsed.success) return invalid(parsed.error);

  if (account.isCash && parsed.data.isArchived) return fail(403, "The Cash account cannot be archived");

  const updated = await acc.updateById(params.accountId, { $set: { isArchived: parsed.data.isArchived } }); // A17
  return ok(updated ? shapeAccount(updated) : null);
};

/** DELETE /api/accounts/:accountId — the account and every transaction on either side of it. */
export const deleteAccount: Handler = async ({ store, params }) => {
  if (!isId(params.accountId)) return notFound(ACCOUNT);
  const accountId = params.accountId;
  const acc = accounts(store);
  const raw = await acc.findById(accountId); // A18
  if (!raw) return notFound(ACCOUNT);
  if (shapeAccount(raw).isCash) return fail(403, "The Cash account cannot be deleted");

  await transactions(store).deleteMany({ $or: [{ accountId }, { toAccountId: accountId }] }); // A19
  await acc.deleteById(accountId); // A20

  return ok({ message: "Account and associated transactions deleted" });
};
