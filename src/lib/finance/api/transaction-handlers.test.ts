import { test } from "node:test";
import assert from "node:assert/strict";
import type { BaseDoc } from "@/lib/data/store";
import { accounts, transactions, type AccountDoc, type TransactionDoc } from "./docs";
import { setup } from "./test-helpers";

let t = setup();
const acct = async (body: object) => (await t.call("POST", "/api/accounts", body)).body as AccountDoc;
const balances = async () => Object.fromEntries((await accounts(t.store).find({ isCash: { $ne: true } })).map((a) => [a.name, a.balance]));
const tx = () => transactions(t.store);
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const strip = <T extends BaseDoc>({ _id, createdAt, updatedAt, ...rest }: T) => rest;

let bank: AccountDoc, card: AccountDoc, loan: AccountDoc;
test.beforeEach(async () => {
  t = setup();
  bank = await acct({ name: "Bank", type: "bank", balance: 1000 });
  card = await acct({ name: "Card", type: "credit_card", balance: 200, creditLimit: 500 });
  loan = await acct({ name: "Loan", type: "debt", balance: 300 });
});
const body = (over: object = {}) => ({ amount: 10, date: "2026-11-10", description: "t", accountId: bank._id, type: "debit", ...over });
const post = async (over: object = {}) => (await t.call("POST", "/api/transactions", body(over))).body as TransactionDoc;

test("balance signs and caps: bank, credit card and debt move the right way", async () => {
  await post();                                                                        // debit bank 10
  await post({ type: "credit", amount: 25 });                                          // credit bank 25
  await post({ accountId: card._id, amount: 40 });                                     // charge card 40
  await post({ accountId: card._id, type: "credit", amount: 15 });                     // refund card 15
  assert.deepEqual(await balances(), { Bank: 101500, Card: 22500, Loan: 30000 });
  const transfer = (from: AccountDoc, to: AccountDoc, amount: number) => post({ type: "transfer", accountId: from._id, toAccountId: to._id, amount });
  const stored = [
    await transfer(bank, card, 50),      // pays 50
    await transfer(bank, card, 9999),    // capped at the 175 still owed
    await transfer(bank, card, 5),       // nothing owed: 0
    await transfer(card, bank, 600),     // capped at the 500 credit limit
    await transfer(card, bank, 1),       // no credit left: 0
    await transfer(bank, loan, 100),
  ].map((x) => [x.amount, x.balanceApplied]);
  assert.deepEqual(stored, [[5000, true], [17500, true], [0, true], [50000, true], [0, true], [10000, true]]);
  assert.deepEqual(await balances(), { Bank: 119000, Card: 50000, Loan: 20000 });
});

test("edit and delete reverse exactly", async () => {
  const debit = await post();
  assert.equal((await t.call("PUT", `/api/transactions/${debit._id}`, body({ type: "credit", amount: 30 }))).status, 200);
  assert.deepEqual(await balances(), { Bank: 103000, Card: 20000, Loan: 30000 });
  await t.call("DELETE", `/api/transactions/${debit._id}`);
  const move = await post({ type: "transfer", toAccountId: card._id, amount: 50 });
  assert.deepEqual(await balances(), { Bank: 95000, Card: 15000, Loan: 30000 });
  await t.call("PUT", `/api/transactions/${move._id}`, body({ type: "transfer", toAccountId: card._id, amount: 20 }));
  assert.deepEqual(await balances(), { Bank: 98000, Card: 18000, Loan: 30000 });
  const charge = await post({ accountId: card._id, amount: 40 });
  assert.deepEqual(await t.call("DELETE", `/api/transactions/${move._id}`), { status: 200, body: { message: "Transaction deleted successfully" } });
  await t.call("DELETE", `/api/transactions/${charge._id}`);
  assert.deepEqual(await balances(), { Bank: 100000, Card: 20000, Loan: 30000 });
  assert.equal(await tx().count(), 0);
});

test("future and recurring transactions are not applied; an edit moves a transaction between states", async () => {
  const future = await post({ date: "2026-11-19" });
  const recurring = await post({ isRecurring: true, recurrenceRule: { frequency: "monthly", startDate: "2026-11-01", dayOfMonth: 1 } });
  assert.deepEqual([future.balanceApplied, recurring.balanceApplied, (await balances()).Bank], [false, false, 100000]);
  await t.call("PUT", `/api/transactions/${future._id}`, body());
  assert.equal((await balances()).Bank, 99000);
  await t.call("PUT", `/api/transactions/${future._id}`, body({ date: "2026-11-19" }));
  assert.equal((await balances()).Bank, 100000);
  await t.call("DELETE", `/api/transactions/${future._id}`);
  await t.call("DELETE", `/api/transactions/${recurring._id}`);
  assert.equal((await balances()).Bank, 100000);
});

test("current behavior: west of UTC a transaction dated tomorrow is applied today", async () => {
  assert.equal((await post({ date: "2026-11-18" })).balanceApplied, true);
  assert.equal((await balances()).Bank, 99000);
});

test("dates are stored as instants; rules get their defaults; list range filters are inclusive", async () => {
  const made = await t.call("POST", "/api/transactions", body({ date: "2026-11-01", description: "  first ", notes: " n ", categoryTags: [" a "] }));
  assert.equal(made.status, 201);
  assert.deepEqual(strip(made.body as TransactionDoc), { amount: 1000, date: "2026-11-01T00:00:00.000Z", description: "first", accountId: bank._id, type: "debit", isRecurring: false, categoryTags: ["a"], notes: "n", balanceApplied: true });
  await post({ date: "2026-11-05", amount: 11 });
  await post({ date: "2026-11-10", amount: 12 });
  const rule = (await post({ amount: 13, isRecurring: true, recurrenceRule: { frequency: "monthly", startDate: "2026-11-02", endDate: "", dayOfMonth: 2 } })).recurrenceRule;
  assert.deepEqual(rule, { frequency: "monthly", interval: 1, startDate: "2026-11-02T00:00:00.000Z", endDate: null, dayOfMonth: 2, daysOfMonth: [] });
  const list = (await t.call("GET", "/api/transactions?startDate=2026-11-01&endDate=2026-11-05&sort=date&order=asc&isRecurring=false")).body as { data: TransactionDoc[] };
  assert.deepEqual(list.data.map((x) => x.date), ["2026-11-01T00:00:00.000Z", "2026-11-05T00:00:00.000Z"]);
});

test("list: paging, filters, and the response shape", async () => {
  for (const [amount, over] of [[1, {}], [2, { categoryTags: ["salary"], type: "credit" }], [3, { description: "Coffee SHOP" }], [4, { type: "transfer", toAccountId: loan._id }], [5, { accountId: loan._id }]] as const) {
    await post({ amount, date: `2026-11-0${amount}`, ...over });
  }
  const get = async (qs: string) => (await t.call("GET", `/api/transactions${qs}`)).body as { data: TransactionDoc[]; pagination: object };
  const page = await get("?limit=2&page=2&sort=amount&order=asc");
  assert.deepEqual(page.data.map((x) => x.amount), [300, 400]);
  assert.deepEqual(page.pagination, { page: 2, limit: 2, total: 5, totalPages: 3 });
  assert.deepEqual((await get("")).data.map((x) => x.amount), [500, 400, 300, 200, 100]);
  assert.deepEqual((await get(`?accountId=${loan._id}&sort=amount&order=asc`)).data.map((x) => x.amount), [400, 500]);
  assert.deepEqual((await get("?category=salary")).data.map((x) => x.amount), [200]);
  assert.deepEqual((await get("?type=transfer")).data.map((x) => x.amount), [400]);
  assert.deepEqual((await get("?search=coffee")).data.map((x) => x.amount), [300]);
  assert.deepEqual((await get("?isRecurring=true")).data, []);
  assert.deepEqual(await t.call("GET", "/api/transactions?accountId=abc"), { status: 500, body: { error: "Failed to fetch transactions" } });
  assert.deepEqual(await t.call("GET", "/api/transactions?page=0"), { status: 500, body: { error: "Failed to fetch transactions" } });
  for (const bad of ["1767225600000", "garbage"]) {
    assert.deepEqual(await t.call("GET", `/api/transactions?startDate=${bad}`), { status: 500, body: { error: "Failed to fetch transactions" } });
  }
});

test("update keeps fields the body leaves out; current behavior: a transfer changed to a debit keeps toAccountId", async () => {
  const move = await post({ type: "transfer", toAccountId: card._id, amount: 50, notes: "keep" });
  const res = await t.call("PUT", `/api/transactions/${move._id}`, body({ amount: 5 }));
  const updated = res.body as TransactionDoc;
  assert.deepEqual([res.status, updated.type, updated.toAccountId, updated.notes, updated.amount], [200, "debit", card._id, "keep", 500]);
  assert.deepEqual(await balances(), { Bank: 99500, Card: 20000, Loan: 30000 });
  assert.deepEqual(await t.call("GET", `/api/transactions/${move._id}`), { status: 200, body: updated });
});

test("current behavior: an edit refused for a missing account leaves the old effect reversed", async () => {
  const move = await post({ type: "transfer", toAccountId: card._id, amount: 50 });
  const res = await t.call("PUT", `/api/transactions/${move._id}`, body({ type: "transfer", toAccountId: "a".repeat(24), amount: 50 }));
  assert.deepEqual(res, { status: 400, body: { error: "Source or destination account not found" } });
  assert.deepEqual(await balances(), { Bank: 100000, Card: 20000, Loan: 30000 });
  const still = (await tx().findById(move._id))!;
  assert.deepEqual([still.amount, still.balanceApplied, still.toAccountId], [5000, true, card._id]);
});

test("current behavior: a debit edit carrying a malformed toAccountId fails after the new effect is applied", async () => {
  const debit = await post();                                                   // bank 99000
  const res = await t.call("PUT", `/api/transactions/${debit._id}`, body({ amount: 30, toAccountId: "abc" }));
  assert.deepEqual(res, { status: 500, body: { error: "Failed to update transaction" } });
  assert.equal((await balances()).Bank, 97000);                                 // old effect reversed, new one applied
  assert.equal((await tx().findById(debit._id))!.amount, 1000);                 // the document itself was not updated
  const move = await t.call("PUT", `/api/transactions/${debit._id}`, body({ type: "transfer", toAccountId: "abc" }));
  assert.deepEqual(move, { status: 500, body: { error: "Failed to update transaction" } });
  assert.equal((await balances()).Bank, 98000);                                 // reversed again; a transfer fails before its new effect
});

test("a legacy transaction without balanceApplied is treated as applied", async () => {
  const old = await tx().insert({ amount: 1000, date: "2026-10-01T00:00:00.000Z", description: "old", accountId: bank._id, type: "debit" } as never);
  await t.call("DELETE", `/api/transactions/${old._id}`);
  assert.equal((await balances()).Bank, 101000);
});

test("deleting a plan's payment transfer unlinks the plan", async () => {
  const pay = await post({ type: "transfer", toAccountId: card._id, amount: 20, isRecurring: true, recurrenceRule: { frequency: "monthly", startDate: "2026-12-15", dayOfMonth: 15 } });
  await accounts(t.store).updateById(card._id, { $set: { paymentTransactionId: pay._id } });
  await t.call("DELETE", `/api/transactions/${pay._id}`);
  assert.equal("paymentTransactionId" in (await accounts(t.store).findById(card._id))!, false);
});

test("errors: validation 400 with plain-JSON details, missing accounts 400, ids 404 or 500 as today", async () => {
  const bad = await t.call("POST", "/api/transactions", body({ amount: 0 }));
  assert.equal(bad.status, 400);
  assert.equal((bad.body as { error: string }).error, "Validation failed");
  assert.deepEqual(JSON.parse(JSON.stringify(bad.body)), bad.body);
  assert.equal((await t.call("POST", "/api/transactions", undefined)).status, 400);
  assert.equal((await t.call("POST", "/api/transactions", body({ type: "transfer" }))).status, 400);
  assert.deepEqual(await t.call("POST", "/api/transactions", body({ type: "transfer", toAccountId: "a".repeat(24), isRecurring: true, recurrenceRule: { frequency: "daily", startDate: "2026-11-01" } })), { status: 400, body: { error: "Source or destination account not found" } });
  assert.deepEqual(await t.call("POST", "/api/transactions", body({ accountId: "abc" })), { status: 500, body: { error: "Failed to create transaction" } });
  assert.deepEqual(await t.call("POST", "/api/transactions", body({ date: "garbage" })), { status: 500, body: { error: "Failed to create transaction" } });
  assert.equal(await tx().count(), 0);
  for (const id of ["abc", "a".repeat(24)]) {
    for (const [method, sent] of [["GET", undefined], ["PUT", body()], ["DELETE", undefined]] as const) {
      assert.deepEqual(await t.call(method, `/api/transactions/${id}`, sent), { status: 404, body: { error: "Transaction not found" } });
    }
  }
  const made = await post();
  assert.equal((await t.call("PUT", `/api/transactions/${made._id}`, body({ amount: -1 }))).status, 400);
});

// ── Golden steps for R11–R15 (scripts/finance-parity/golden/transcript.json) ──

test("golden T17, T18, T20: validation details are the ZodError as JSON (name and message)", async () => {
  const issues = (list: object[]) => JSON.stringify(list, null, 2);
  assert.deepEqual(await t.call("POST", "/api/transactions", body({ type: "transfer" })), {
    status: 400,
    body: { error: "Validation failed", details: { name: "ZodError", message: issues([{ code: "custom", message: "Destination account is required for transfers", path: ["toAccountId"] }]) } },
  });
  assert.deepEqual(await t.call("POST", "/api/transactions", body({ type: "transfer", toAccountId: bank._id })), {
    status: 400,
    body: { error: "Validation failed", details: { name: "ZodError", message: issues([{ code: "custom", message: "Cannot transfer to the same account", path: ["toAccountId"] }]) } },
  });
  assert.deepEqual(await t.call("POST", "/api/transactions", body({ amount: 0 })), {
    status: 400,
    body: {
      error: "Validation failed",
      details: { name: "ZodError", message: issues([{ origin: "number", code: "too_small", minimum: 0, inclusive: false, path: ["amount"], message: "Amount must be positive" }]) },
    },
  });
});

test("golden T19, T22, T42: a missing account is 400 (on PUT after the reversal); a malformed accountId is 500 and writes nothing", async () => {
  const before = [t.writes("accounts"), t.writes("transactions")];
  assert.deepEqual(await t.call("POST", "/api/transactions", body({ type: "transfer", toAccountId: "b".repeat(24) })), { status: 400, body: { error: "Source or destination account not found" } });
  assert.deepEqual(await t.call("POST", "/api/transactions", body({ accountId: "abc" })), { status: 500, body: { error: "Failed to create transaction" } });
  assert.deepEqual([t.writes("accounts"), t.writes("transactions")], before);
  const pay = await post({ type: "transfer", toAccountId: loan._id, amount: 200 });     // bank 80000, loan 10000
  assert.deepEqual(await t.call("PUT", `/api/transactions/${pay._id}`, body({ type: "transfer", toAccountId: "b".repeat(24), amount: 200 })), { status: 400, body: { error: "Source or destination account not found" } });
  assert.deepEqual(await balances(), { Bank: 100000, Card: 20000, Loan: 30000 });
});

test("golden T37, T38, T39, T41: PUT keeps omitted fields, toggles the applied state by date, and stores the rule with its defaults", async () => {
  const groc = await post({ amount: 120.55, notes: "  weekly shop " });
  const t37 = await t.call("PUT", `/api/transactions/${groc._id}`, body({ amount: 130.25, description: "edited" }));
  assert.deepEqual(strip(t37.body as TransactionDoc), { accountId: bank._id, amount: 13025, balanceApplied: true, categoryTags: [], date: "2026-11-10T00:00:00.000Z", description: "edited", isRecurring: false, notes: "weekly shop", type: "debit" });
  const sub = await post({ accountId: card._id, amount: 60 });                          // card 26000
  assert.equal(((await t.call("PUT", `/api/transactions/${sub._id}`, body({ accountId: card._id, amount: 60, date: "2026-11-24" }))).body as TransactionDoc).balanceApplied, false);
  assert.equal((await balances()).Card, 20000);
  assert.equal(((await t.call("PUT", `/api/transactions/${sub._id}`, body({ accountId: card._id, amount: 60 }))).body as TransactionDoc).balanceApplied, true);
  assert.equal((await balances()).Card, 26000);
  const tom = await post({ date: "2026-11-18" });
  const t41 = await t.call("PUT", `/api/transactions/${tom._id}`, body({ date: "2026-11-18", isRecurring: true, recurrenceRule: { frequency: "weekly", startDate: "2026-11-18", dayOfWeek: 3 } }));
  assert.deepEqual(strip(t41.body as TransactionDoc), {
    accountId: bank._id, amount: 1000, balanceApplied: false, categoryTags: [], date: "2026-11-18T00:00:00.000Z", description: "t", isRecurring: true, type: "debit",
    recurrenceRule: { dayOfWeek: 3, daysOfMonth: [], endDate: null, frequency: "weekly", interval: 1, startDate: "2026-11-18T00:00:00.000Z" },
  });
  assert.deepEqual(await balances(), { Bank: 100000 - 13025, Card: 26000, Loan: 30000 });
});

test("list: unshaped stored documents, the default page size, and a whitespace-only description on PUT fails after the new effect", async () => {
  const old = await tx().insert({ amount: 700, date: "2026-10-01T00:00:00.000Z", description: "old", accountId: bank._id, type: "debit" } as never);
  const list = (await t.call("GET", "/api/transactions")).body as { data: TransactionDoc[]; pagination: object };
  assert.deepEqual([list.data, list.pagination], [[old], { page: 1, limit: 20, total: 1, totalPages: 1 }]);
  assert.deepEqual(await t.call("GET", `/api/transactions/${old._id}`), { status: 200, body: old });
  // Mongoose's update validators refuse the trimmed "" only at the final update, after both balance writes
  assert.deepEqual(await t.call("PUT", `/api/transactions/${old._id}`, body({ description: "   " })), { status: 500, body: { error: "Failed to update transaction" } });
  assert.equal((await balances()).Bank, 100000 + 700 - 1000);
  assert.deepEqual(await tx().findById(old._id), old);
});
