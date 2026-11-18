import { test } from "node:test";
import assert from "node:assert/strict";
import type { BaseDoc } from "@/lib/data/store";
import { accounts, profiles, transactions, type AccountDoc, type TransactionDoc } from "./docs";
import { setup, withTimeZone } from "./test-helpers";

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

test("a transaction dated tomorrow is not applied today; one dated today is", async () => {
  assert.equal((await post({ date: "2026-11-18" })).balanceApplied, false);
  assert.equal((await balances()).Bank, 100000);
  assert.equal((await post({ date: "2026-11-17T23:00:00.000Z" })).balanceApplied, true);
  assert.equal((await balances()).Bank, 99000);
});

test("west of UTC, after the UTC day has turned: the local day decides (create and update)", async () => {
  t.setNow(new Date("2026-11-18T03:00:00.000Z")); // 22:00 on 17 Nov in New York, 18 Nov in UTC
  const tomorrow = await post({ date: "2026-11-18" });
  assert.equal(tomorrow.balanceApplied, false);
  assert.equal((await balances()).Bank, 100000);
  const today = await post({ date: "2026-11-17" });
  assert.equal(today.balanceApplied, true);
  assert.equal((await balances()).Bank, 99000);
  await t.call("PUT", `/api/transactions/${today._id}`, body({ date: "2026-11-18" }));
  assert.equal((await tx().findById(today._id))?.balanceApplied, false);
  assert.equal((await balances()).Bank, 100000);
  await t.call("PUT", `/api/transactions/${tomorrow._id}`, body({ date: "2026-11-17" }));
  assert.equal((await tx().findById(tomorrow._id))?.balanceApplied, true);
  assert.equal((await balances()).Bank, 99000);
});

test("east of UTC, before the UTC day has turned: the local day decides (create and update)", async () => {
  await withTimeZone("Asia/Tokyo", async () => {
    t.setNow(new Date("2026-11-17T20:00:00.000Z")); // 05:00 on 18 Nov in Tokyo, 17 Nov in UTC
    assert.equal((await post({ date: "2026-11-18" })).balanceApplied, true);
    const lateToday = await post({ date: "2026-11-18T23:00:00.000Z" });
    assert.equal(lateToday.balanceApplied, true);
    assert.equal((await balances()).Bank, 98000);
    const later = await post({ date: "2026-11-19" });
    assert.equal(later.balanceApplied, false);
    assert.equal((await balances()).Bank, 98000);
    await t.call("PUT", `/api/transactions/${lateToday._id}`, body({ date: "2026-11-19" }));
    assert.equal((await balances()).Bank, 99000);
    await t.call("PUT", `/api/transactions/${later._id}`, body({ date: "2026-11-18T23:00:00.000Z" }));
    assert.equal((await balances()).Bank, 98000);
  });
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
  assert.deepEqual(await t.call("GET", "/api/transactions?page=0"), { status: 400, body: { error: "Invalid page" } });
  for (const bad of ["1767225600000", "garbage"]) {
    assert.deepEqual(await t.call("GET", `/api/transactions?startDate=${bad}`), { status: 500, body: { error: "Failed to fetch transactions" } });
  }
});

test("list: page, limit, sort and order are validated; absent or empty ones keep their defaults", async () => {
  await post();
  const status = async (qs: string) => (await t.call("GET", `/api/transactions${qs}`)).status;
  for (const [qs, error] of [
    ["?page=0", "Invalid page"], ["?page=-1", "Invalid page"], ["?page=1.5", "Invalid page"], ["?page=abc", "Invalid page"], ["?page=2x", "Invalid page"],
    ["?limit=0", "Invalid limit"], ["?limit=501", "Invalid limit"], ["?limit=NaN", "Invalid limit"], ["?limit=1e2", "Invalid limit"],
    ["?sort=categoryTags", "Invalid sort"], ["?sort=__proto__", "Invalid sort"], ["?sort=description", "Invalid sort"],
    ["?order=up", "Invalid order"], ["?order=ASC", "Invalid order"],
  ]) {
    assert.deepEqual(await t.call("GET", `/api/transactions${qs}`), { status: 400, body: { error } }, qs);
  }
  for (const qs of ["?page=1&limit=1", "?limit=500", "?sort=date&order=asc", "?sort=amount&order=desc", "?sort=createdAt&order=asc", "?page=&limit=&sort=&order="]) {
    assert.equal(await status(qs), 200, qs);
  }
  const res = (await t.call("GET", "/api/transactions?page=&limit=")).body as { pagination: object };
  assert.deepEqual(res.pagination, { page: 1, limit: 20, total: 1, totalPages: 1 });
});

test("a recurring semi-monthly rule needs daysOfMonth: 400 on create and update, nothing written", async () => {
  const semi = (rule: object = {}) => body({ isRecurring: true, recurrenceRule: { frequency: "semi_monthly", startDate: "2026-11-01", ...rule } });
  const before = [t.writes("accounts"), t.writes("transactions")];
  for (const sent of [semi(), semi({ daysOfMonth: [] })]) {
    const res = await t.call("POST", "/api/transactions", sent);
    assert.equal(res.status, 400);
    assert.equal((res.body as { error: string }).error, "Validation failed");
    assert.match((res.body as { details: { message: string } }).details.message, /Semi-monthly rules need at least one day of the month/);
  }
  assert.deepEqual([t.writes("accounts"), t.writes("transactions")], before);
  const made = await post();
  const stored = await tx().findById(made._id);
  assert.equal((await t.call("PUT", `/api/transactions/${made._id}`, semi())).status, 400);
  assert.deepEqual(await tx().findById(made._id), stored);
  assert.equal((await t.call("POST", "/api/transactions", semi({ daysOfMonth: [1, 15] }))).status, 201);
  // Not recurring: the rule is not checked, as before
  assert.equal((await t.call("POST", "/api/transactions", body({ recurrenceRule: { frequency: "semi_monthly", startDate: "2026-11-01" } }))).status, 201);
});

test("update keeps fields the body leaves out; a transfer changed to a debit drops toAccountId (bug 2)", async () => {
  const move = await post({ type: "transfer", toAccountId: card._id, amount: 50, notes: "keep" });
  const res = await t.call("PUT", `/api/transactions/${move._id}`, body({ amount: 5 }));
  const updated = res.body as TransactionDoc;
  assert.deepEqual([res.status, updated.type, "toAccountId" in updated, updated.notes, updated.amount], [200, "debit", false, "keep", 500]);
  assert.deepEqual(await balances(), { Bank: 99500, Card: 20000, Loan: 30000 });
  assert.deepEqual(await t.call("GET", `/api/transactions/${move._id}`), { status: 200, body: updated });
  // No longer listed under the card it used to pay
  assert.deepEqual(((await t.call("GET", `/api/transactions?accountId=${card._id}`)).body as { data: TransactionDoc[] }).data, []);
  // A credit edit carrying a toAccountId does not store it either (a malformed one is still the 500)
  const credit = await t.call("PUT", `/api/transactions/${move._id}`, body({ type: "credit", toAccountId: card._id }));
  assert.deepEqual([credit.status, "toAccountId" in (credit.body as TransactionDoc)], [200, false]);
});

test("turning recurrence off drops recurrenceRule and keeps a managed amountSchedule (bug 2)", async () => {
  const rec = await post({ isRecurring: true, recurrenceRule: { frequency: "monthly", startDate: "2026-11-01", dayOfMonth: 1 } });
  const schedule = [{ effectiveDate: "2026-12-01T00:00:00.000Z", amount: 2000 }];
  await tx().updateById(rec._id, { $set: { amountSchedule: schedule } });
  const res = await t.call("PUT", `/api/transactions/${rec._id}`, body({ isRecurring: false }));
  const updated = res.body as TransactionDoc;
  assert.deepEqual([res.status, updated.isRecurring, "recurrenceRule" in updated, updated.amountSchedule], [200, false, false, schedule]);
  assert.deepEqual(await tx().findById(rec._id), updated);
  // Recurring again with a new rule stores it; a non-recurring edit carrying a rule does not keep it
  const again = (await t.call("PUT", `/api/transactions/${rec._id}`, body({ isRecurring: true, recurrenceRule: { frequency: "weekly", startDate: "2026-11-20", dayOfWeek: 5 } }))).body as TransactionDoc;
  assert.equal(again.recurrenceRule?.frequency, "weekly");
  const off = (await t.call("PUT", `/api/transactions/${rec._id}`, body({ isRecurring: false, recurrenceRule: { frequency: "weekly", startDate: "2026-11-20", dayOfWeek: 5 } }))).body as TransactionDoc;
  assert.equal("recurrenceRule" in off, false);
});

test("list by account: a stored debit still holding a stale toAccountId is listed only under its own account (bug 2)", async () => {
  const stale = await tx().insert({ amount: 700, date: "2026-10-01T00:00:00.000Z", description: "stale", accountId: bank._id, toAccountId: card._id, type: "debit", isRecurring: false, categoryTags: [], balanceApplied: true });
  const ids = async (id: string) => ((await t.call("GET", `/api/transactions?accountId=${id}`)).body as { data: TransactionDoc[]; pagination: { total: number } });
  assert.deepEqual((await ids(card._id)).data, []);
  assert.equal((await ids(card._id)).pagination.total, 0);
  assert.deepEqual((await ids(bank._id)).data.map((x) => x._id), [stale._id]);
});

/** Every stored document in full (updatedAt included) and the storage write counts. */
const snapshot = async () => [await accounts(t.store).find(), await tx().find(), t.writes("accounts"), t.writes("transactions")];

test("an edit refused for a missing account changes nothing", async () => {
  const move = await post({ type: "transfer", toAccountId: card._id, amount: 50 });
  const before = await snapshot();
  const res = await t.call("PUT", `/api/transactions/${move._id}`, body({ type: "transfer", toAccountId: "a".repeat(24), amount: 50 }));
  assert.deepEqual(res, { status: 400, body: { error: "Source or destination account not found" } });
  assert.deepEqual(await snapshot(), before);
  const noSource = await t.call("PUT", `/api/transactions/${move._id}`, body({ type: "transfer", accountId: "a".repeat(24), toAccountId: card._id, amount: 50 }));
  assert.deepEqual(noSource, { status: 400, body: { error: "Source or destination account not found" } });
  assert.deepEqual(await snapshot(), before);
});

test("a missing transfer account is the 400 even when a field is also unusable (today's precedence)", async () => {
  const move = await post({ type: "transfer", toAccountId: card._id, amount: 50 });
  const before = await snapshot();
  for (const bad of [{ description: "   " }, { date: "not a date" }, { recurrenceRule: { frequency: "monthly", startDate: "not a date" } }]) {
    const res = await t.call("PUT", `/api/transactions/${move._id}`, body({ type: "transfer", toAccountId: "a".repeat(24), ...bad }));
    assert.deepEqual(res, { status: 400, body: { error: "Source or destination account not found" } });
    assert.deepEqual(await snapshot(), before);
  }
  // With both accounts present, the unusable field is the 500, still before any write
  assert.equal((await t.call("PUT", `/api/transactions/${move._id}`, body({ type: "transfer", toAccountId: card._id, description: "   " }))).status, 500);
  assert.deepEqual(await snapshot(), before);
});

test("an edit carrying a malformed id or an unusable field fails before any write", async () => {
  const debit = await post();                                                   // bank 99000
  const before = await snapshot();
  const res = await t.call("PUT", `/api/transactions/${debit._id}`, body({ amount: 30, toAccountId: "abc" }));
  assert.deepEqual(res, { status: 500, body: { error: "Failed to update transaction" } });
  assert.deepEqual(await snapshot(), before);
  const move = await t.call("PUT", `/api/transactions/${debit._id}`, body({ type: "transfer", toAccountId: "abc" }));
  assert.deepEqual(move, { status: 500, body: { error: "Failed to update transaction" } });
  assert.deepEqual(await snapshot(), before);
  for (const bad of [{ accountId: "abc" }, { description: "   " }, { date: "not a date" }]) {
    assert.equal((await t.call("PUT", `/api/transactions/${debit._id}`, body(bad))).status, 500);
    assert.deepEqual(await snapshot(), before);
  }
});

test("an edited transfer is capped against the balances after its old effect is undone", async () => {
  const payoff = await post({ type: "transfer", toAccountId: card._id, amount: 200 }); // card paid off
  assert.deepEqual(await balances(), { Bank: 80000, Card: 0, Loan: 30000 });
  const res = await t.call("PUT", `/api/transactions/${payoff._id}`, body({ type: "transfer", toAccountId: card._id, amount: 150 }));
  assert.deepEqual([res.status, (res.body as TransactionDoc).amount], [200, 15000]);
  assert.deepEqual(await balances(), { Bank: 85000, Card: 5000, Loan: 30000 });
  const over = await t.call("PUT", `/api/transactions/${payoff._id}`, body({ type: "transfer", toAccountId: card._id, amount: 999 }));
  assert.deepEqual([over.status, (over.body as TransactionDoc).amount], [200, 20000]); // capped at the 200 owed once 150 is undone
  assert.deepEqual(await balances(), { Bank: 80000, Card: 0, Loan: 30000 });
});

test("a legacy transaction without balanceApplied is treated as applied", async () => {
  const old = await tx().insert({ amount: 1000, date: "2026-10-01T00:00:00.000Z", description: "old", accountId: bank._id, type: "debit" } as never);
  await t.call("DELETE", `/api/transactions/${old._id}`);
  assert.equal((await balances()).Bank, 101000);
});

test("deleting a plan's payment transfer unlinks the plan", async () => {
  const pay = await post({ type: "transfer", toAccountId: card._id, amount: 20, isRecurring: true, recurrenceRule: { frequency: "monthly", startDate: "2026-12-15", dayOfMonth: 15 } });
  await accounts(t.store).updateById(card._id, { $set: { paymentTransactionId: pay._id } });
  await accounts(t.store).updateById(loan._id, { $set: { paymentTransactionId: "c".repeat(24) } });
  await t.call("DELETE", `/api/transactions/${pay._id}`);
  assert.equal("paymentTransactionId" in (await accounts(t.store).findById(card._id))!, false);
  assert.equal((await accounts(t.store).findById(loan._id))!.paymentTransactionId, "c".repeat(24));
});

test("deleting a transaction clears the Datasheet links to it and no other (bug 7)", async () => {
  const rec = (over: object) => post({ isRecurring: true, recurrenceRule: { frequency: "monthly", startDate: "2026-12-01", dayOfMonth: 1 }, ...over });
  const salary = await rec({ type: "credit", description: "Salary" });
  const rent = await rec({ description: "Rent" });
  await profiles(t.store).updateOne({}, { $set: { salaryTransactionId: salary._id, rentTransactionId: rent._id } }, { upsert: true });
  await t.call("DELETE", `/api/transactions/${salary._id}`);
  let stored = (await profiles(t.store).findOne({}))!;
  assert.deepEqual([stored.salaryTransactionId, stored.rentTransactionId], [null, rent._id]);
  await t.call("DELETE", `/api/transactions/${rent._id}`);
  stored = (await profiles(t.store).findOne({}))!;
  assert.deepEqual([stored.salaryTransactionId, stored.rentTransactionId], [null, null]);
  // Deleting an unlinked transaction writes nothing to the profile
  const other = await post();
  const before = t.writes("financeProfile");
  await t.call("DELETE", `/api/transactions/${other._id}`);
  assert.equal(t.writes("financeProfile"), before);
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

test("golden T19, T22, T42: a missing account is 400; a malformed accountId is 500; neither writes anything", async () => {
  const before = [t.writes("accounts"), t.writes("transactions")];
  assert.deepEqual(await t.call("POST", "/api/transactions", body({ type: "transfer", toAccountId: "b".repeat(24) })), { status: 400, body: { error: "Source or destination account not found" } });
  assert.deepEqual(await t.call("POST", "/api/transactions", body({ accountId: "abc" })), { status: 500, body: { error: "Failed to create transaction" } });
  assert.deepEqual([t.writes("accounts"), t.writes("transactions")], before);
  const pay = await post({ type: "transfer", toAccountId: loan._id, amount: 200 });     // bank 80000, loan 10000
  const after = [t.writes("accounts"), t.writes("transactions")];
  assert.deepEqual(await t.call("PUT", `/api/transactions/${pay._id}`, body({ type: "transfer", toAccountId: "b".repeat(24), amount: 200 })), { status: 400, body: { error: "Source or destination account not found" } });
  assert.deepEqual(await balances(), { Bank: 80000, Card: 20000, Loan: 10000 });
  assert.deepEqual([t.writes("accounts"), t.writes("transactions")], after);
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

test("list: unshaped stored documents, the default page size, and a whitespace-only description on PUT fails before any write", async () => {
  const old = await tx().insert({ amount: 700, date: "2026-10-01T00:00:00.000Z", description: "old", accountId: bank._id, type: "debit" } as never);
  const list = (await t.call("GET", "/api/transactions")).body as { data: TransactionDoc[]; pagination: object };
  assert.deepEqual([list.data, list.pagination], [[old], { page: 1, limit: 20, total: 1, totalPages: 1 }]);
  assert.deepEqual(await t.call("GET", `/api/transactions/${old._id}`), { status: 200, body: old });
  // The trimmed "" is refused (the route's 500) before the balance writes
  assert.deepEqual(await t.call("PUT", `/api/transactions/${old._id}`, body({ description: "   " })), { status: 500, body: { error: "Failed to update transaction" } });
  assert.equal((await balances()).Bank, 100000);
  assert.deepEqual(await tx().findById(old._id), old);
});

test("create stores what PUT keeps: no toAccountId off a transfer, no recurrenceRule when not recurring (bug 2)", async () => {
  const rule = { frequency: "weekly", startDate: "2026-11-20", dayOfWeek: 5 };
  for (const type of ["debit", "credit"]) {
    const res = await t.call("POST", "/api/transactions", body({ type, toAccountId: card._id, recurrenceRule: rule }));
    const created = res.body as TransactionDoc;
    assert.deepEqual([res.status, "toAccountId" in created, "recurrenceRule" in created], [201, false, false]);
    assert.deepEqual(await tx().findById(created._id), created);
  }
  // A malformed toAccountId on a debit is still refused (the route's 500), and nothing is written
  const before = [t.writes("accounts"), t.writes("transactions")];
  assert.equal((await t.call("POST", "/api/transactions", body({ toAccountId: "abc" }))).status, 500);
  assert.deepEqual([t.writes("accounts"), t.writes("transactions")], before);
  // A transfer keeps its destination; a recurring transaction keeps its rule
  const move = await post({ type: "transfer", toAccountId: card._id, amount: 5 });
  const rec = await post({ isRecurring: true, recurrenceRule: rule });
  assert.deepEqual([move.toAccountId, rec.recurrenceRule?.frequency], [card._id, "weekly"]);
  assert.deepEqual(await balances(), { Bank: 99500, Card: 19500, Loan: 30000 });
});
