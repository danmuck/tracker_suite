// Account routes (R1–R6) as store-backed handlers, shared by the server and browser data modes.
// Same order of reads and writes as src/app/api/accounts/route.ts and [accountId]/route.ts.
// Pure: no framework, browser or server imports (browser-reachable).

import { fail, invalid, isId, notFound, ok, type Handler } from "@/lib/data/api";
import { planFieldsToDb } from "@/lib/finance/account-plan-fields";
import { todayStoredDate } from "@/lib/finance/dates";
import { accountArchiveSchema, accountSchema } from "@/lib/finance/validators";
import { accounts, assertId, requiredText, shapeAccount, transactions, type AccountDoc } from "./docs";
import { catchUp } from "./catch-up";
import { clearAccountLinks, clearTransactionLinks } from "./links";

const ACCOUNT = "Account";

/** GET /api/accounts — apply pending transactions, post due payments, then list. */
export const listAccounts: Handler = async ({ store, query, now }) => {
  const type = query.get("type");
  const includeArchived = query.get("includeArchived") === "true";
  const filter: Record<string, unknown> = {};
  if (type) filter.type = type;
  if (!includeArchived) filter.isArchived = { $ne: true };

  const acc = accounts(store);
  // Apply pending transactions whose day has arrived, then post due plan payments (A1–A7)
  await catchUp(store, now);

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
  // Loan disbursement, only when asked: the linked account is checked before anything is created
  const disburse = data.depositFunds === true && data.type === "debt" && data.isLoan === true && !!data.linkedAccountId;
  if (disburse) {
    const linkedAccount = await acc.findById(data.linkedAccountId as string); // A10
    if (!linkedAccount) return fail(400, "Linked account not found for loan disbursement");
  }

  const account = await acc.insert(doc as Omit<AccountDoc, "_id" | "createdAt" | "updatedAt">);

  if (disburse && account.linkedAccountId) {
    await acc.updateById(account.linkedAccountId, { $inc: { balance: balanceInCents } }); // A11

    // A12
    await transactions(store).insert({
      accountId: account._id,
      toAccountId: account.linkedAccountId,
      type: "transfer",
      amount: balanceInCents,
      description: `Loan disbursement from ${account.name}`,
      categoryTags: ["transfer"],
      date: todayStoredDate(now),
      isRecurring: false,
      balanceApplied: true,
    });
  }

  return ok(shapeAccount(account), 201);
};

/** GET /api/accounts/:accountId — catch up (pending transactions, due payments) first, then look up. */
export const getAccount: Handler = async ({ store, params, now }) => {
  await catchUp(store, now);
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

/**
 * DELETE /api/accounts/:accountId — the account and every transaction on either side of it, then
 * every link to them on the documents that survive (bug 7).
 */
export const deleteAccount: Handler = async ({ store, params }) => {
  if (!isId(params.accountId)) return notFound(ACCOUNT);
  const accountId = params.accountId;
  const acc = accounts(store);
  const raw = await acc.findById(accountId); // A18
  if (!raw) return notFound(ACCOUNT);
  if (shapeAccount(raw).isCash) return fail(403, "The Cash account cannot be deleted");

  const txs = transactions(store);
  // Only a transfer is on the destination side: a debit or credit with a stale toAccountId (bug 2)
  // belongs to its own account and stays
  const owned = { $or: [{ accountId }, { toAccountId: accountId, type: "transfer" }] };
  const deletedIds = (await txs.find(owned)).map((t) => t._id);
  // Exactly the ones read: each has its links cleared below
  if (deletedIds.length > 0) await txs.deleteMany({ _id: { $in: deletedIds } }); // A19
  await acc.deleteById(accountId); // A20

  // Links are cleared after the deletes, so the deleted account is never written
  await clearTransactionLinks(store, deletedIds);
  await clearAccountLinks(store, accountId);

  return ok({ message: "Account and associated transactions deleted" });
};
