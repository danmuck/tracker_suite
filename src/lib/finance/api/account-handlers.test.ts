import { test } from "node:test";
import assert from "node:assert/strict";
import { dispatch } from "@/lib/data/dispatch";
import type { BaseDoc } from "@/lib/data/store";
import { accounts, transactions, type AccountDoc } from "./docs";
import { financeRoutes } from "./routes";
import { interleavingStore, NOW, setup, withTimeZone } from "./test-helpers";

let t = setup();
test.beforeEach(() => { t = setup(); });
const acct = async (body: object) => (await t.call("POST", "/api/accounts", body)).body as AccountDoc;
const getAcct = async (id: string) => (await t.call("GET", `/api/accounts/${id}`)).body as AccountDoc;
const balances = async () => Object.fromEntries((await accounts(t.store).find({ isCash: { $ne: true } })).map((a) => [a.name, a.balance]));
const tx = () => transactions(t.store);
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const strip = <T extends BaseDoc>({ _id, createdAt, updatedAt, ...rest }: T) => rest;

test("Cash exists once and is protected", async () => {
  const list = (await t.call("GET", "/api/accounts")).body as AccountDoc[];
  assert.deepEqual(list.map(strip), [{ name: "Cash", type: "bank", isCash: true, balance: 0, currency: "USD", isArchived: false }]);
  await t.call("GET", "/api/accounts");
  assert.equal(await accounts(t.store).count(), 1);
  const id = list[0]._id;
  assert.deepEqual(await t.call("PUT", `/api/accounts/${id}`, { name: "Cash", type: "debt", balance: 0 }), { status: 400, body: { error: "Cannot change the type of the Cash account" } });
  assert.deepEqual(await t.call("PATCH", `/api/accounts/${id}`, { isArchived: true }), { status: 403, body: { error: "The Cash account cannot be archived" } });
  assert.deepEqual(await t.call("DELETE", `/api/accounts/${id}`), { status: 403, body: { error: "The Cash account cannot be deleted" } });
});

test("create: dollars become cents, percent a fraction, defaults stored, text trimmed, depositFunds never stored", async () => {
  const res = await t.call("POST", "/api/accounts", { name: "  Card ", type: "credit_card", balance: 400.5, creditLimit: 1000, apr: 25, minimumPayment: 35, notes: " n ", depositFunds: true });
  assert.equal(res.status, 201);
  assert.deepEqual(strip(res.body as AccountDoc), { name: "Card", type: "credit_card", balance: 40050, creditLimit: 100000, apr: 0.25, minimumPayment: 3500, notes: "n", currency: "USD", isCash: false, isArchived: false });
  assert.deepEqual(await accounts(t.store).findById((res.body as AccountDoc)._id), res.body);
});

test("an account stored without defaulted fields is returned with them", async () => {
  const old = await accounts(t.store).insert({ name: "Old", type: "bank" } as never);
  assert.deepEqual(strip(await getAcct(old._id)), { name: "Old", type: "bank", balance: 0, currency: "USD", isCash: false, isArchived: false });
  assert.ok(((await t.call("GET", "/api/accounts")).body as AccountDoc[]).some((a) => a.name === "Old" && a.isArchived === false));
});

test("loan disbursement credits the linked bank and records an applied transfer dated today (UTC midnight)", async () => {
  const bank = await acct({ name: "Bank", type: "bank", balance: 100 });
  const loan = await acct({ name: "Car", type: "debt", balance: 8000, isLoan: true, linkedAccountId: bank._id, depositFunds: true });
  assert.deepEqual(await balances(), { Bank: 810000, Car: 800000 });
  assert.deepEqual((await tx().find()).map(strip), [{ accountId: loan._id, toAccountId: bank._id, type: "transfer", amount: 800000, description: "Loan disbursement from Car", categoryTags: ["transfer"], date: "2026-11-17T00:00:00.000Z", isRecurring: false, balanceApplied: true }]);
  await acct({ name: "Linked only", type: "debt", balance: 10, isLoan: true, linkedAccountId: bank._id });
  assert.equal(await tx().count(), 1);
});

test("the loan disbursement is dated the local calendar day, west and east of UTC", async () => {
  const bank = await acct({ name: "Bank", type: "bank", balance: 100 });
  const disburse = async (name: string) => {
    await acct({ name, type: "debt", balance: 10, isLoan: true, linkedAccountId: bank._id, depositFunds: true });
    return (await tx().find({ description: `Loan disbursement from ${name}` }))[0].date;
  };
  t.setNow(new Date("2026-11-18T03:00:00.000Z")); // 22:00 on 17 Nov in New York
  assert.equal(await disburse("West"), "2026-11-17T00:00:00.000Z");
  await withTimeZone("Asia/Tokyo", async () => {
    t.setNow(new Date("2026-11-17T20:00:00.000Z")); // 05:00 on 18 Nov in Tokyo
    assert.equal(await disburse("East"), "2026-11-18T00:00:00.000Z");
  });
});

test("a loan whose linked account is missing is refused before anything is created", async () => {
  const res = await t.call("POST", "/api/accounts", { name: "Orphan", type: "debt", balance: 50, isLoan: true, linkedAccountId: "a".repeat(24), depositFunds: true });
  assert.deepEqual(res, { status: 400, body: { error: "Linked account not found for loan disbursement" } });
  assert.equal(await accounts(t.store).count({ name: "Orphan" }), 0);
  assert.equal(await tx().count(), 0);
  // Not asked to deposit: the link is not looked up, as before
  assert.equal((await t.call("POST", "/api/accounts", { name: "Linked only", type: "debt", balance: 50, isLoan: true, linkedAccountId: "a".repeat(24) })).status, 201);
  assert.deepEqual(await t.call("POST", "/api/accounts", { name: "Bad", type: "debt", balance: 1, linkedAccountId: "abc" }), { status: 500, body: { error: "Failed to create account" } });
  assert.equal(await accounts(t.store).count({ name: "Bad" }), 0);
});

test("update: omitted fields are kept, apr and minimumPayment null are removed, depositFunds is never stored", async () => {
  const a = await acct({ name: "Card", type: "credit_card", balance: 400, creditLimit: 1000, apr: 25, minimumPayment: 35, notes: "keep me" });
  const res = await t.call("PUT", `/api/accounts/${a._id}`, { name: "Card 2", type: "credit_card", balance: 410, apr: null, minimumPayment: 40, depositFunds: true });
  assert.equal(res.status, 200);
  assert.deepEqual(strip(res.body as AccountDoc), { name: "Card 2", type: "credit_card", balance: 41000, creditLimit: 100000, minimumPayment: 4000, notes: "keep me", currency: "USD", isCash: false, isArchived: false });
  assert.equal("depositFunds" in (await accounts(t.store).findById(a._id))!, false);
});

test("archive hides from the default list; delete removes the account and transactions on either side", async () => {
  const a = await acct({ name: "A", type: "bank", balance: 0 });
  const b = await acct({ name: "B", type: "bank", balance: 0 });
  const row = { amount: 100, date: "2026-11-01T00:00:00.000Z", description: "t", type: "debit" as const, isRecurring: false, categoryTags: [], balanceApplied: true };
  await tx().insert({ ...row, accountId: a._id });
  await tx().insert({ ...row, accountId: b._id, toAccountId: a._id, type: "transfer" });
  await tx().insert({ ...row, accountId: b._id });
  const names = async (qs: string) => ((await t.call("GET", `/api/accounts${qs}`)).body as AccountDoc[]).map((x) => x.name).sort();
  assert.equal(((await t.call("PATCH", `/api/accounts/${a._id}`, { isArchived: true })).body as AccountDoc).isArchived, true);
  assert.deepEqual(await names(""), ["B", "Cash"]);
  assert.deepEqual(await names("?includeArchived=true"), ["A", "B", "Cash"]);
  assert.deepEqual(await names("?type=debt&includeArchived=true"), []);
  assert.deepEqual(await t.call("DELETE", `/api/accounts/${a._id}`), { status: 200, body: { message: "Account and associated transactions deleted" } });
  assert.deepEqual((await tx().find()).map((x) => [x.accountId, x.toAccountId]), [[b._id, undefined]]);
  assert.deepEqual(await balances(), { B: 0 });
});

test("deleting an account clears every link to it and to the transactions deleted with it (bug 7)", async () => {
  const doomed = await acct({ name: "Doomed", type: "bank", balance: 100 });
  const bank = await acct({ name: "Bank", type: "bank", balance: 100 });
  const loan = await acct({ name: "Loan", type: "debt", balance: 500, isLoan: true, linkedAccountId: doomed._id });
  const card = await acct({ name: "Card", type: "credit_card", balance: 300 });
  const otherLoan = await acct({ name: "Other Loan", type: "debt", balance: 500, isLoan: true, linkedAccountId: bank._id });
  const plan = (id: string, fromAccountId: string) => t.call("POST", `/api/accounts/${id}/payment-plan`, { fromAccountId, dayOfMonth: 15, startDate: "2026-12-15", firstAmount: 25 });
  const loanPay = ((await plan(loan._id, doomed._id)).body as { data: { payment: { transactionId: string } } }).data.payment.transactionId;
  const cardPay = ((await plan(card._id, bank._id)).body as { data: { payment: { transactionId: string } } }).data.payment.transactionId;
  const row = { amount: 100, date: "2026-11-01T00:00:00.000Z", description: "t", isRecurring: false, categoryTags: [], balanceApplied: true };
  const salary = await tx().insert({ ...row, type: "transfer", accountId: bank._id, toAccountId: doomed._id });
  // Stored before bug 2 was fixed: a debit on Bank still naming Doomed as its destination
  const stale = await tx().insert({ ...row, type: "debit", accountId: bank._id, toAccountId: doomed._id });
  const rent = await tx().insert({ ...row, type: "debit", accountId: bank._id, isRecurring: true, recurrenceRule: { frequency: "monthly", interval: 1, startDate: "2026-12-01T00:00:00.000Z", endDate: null, daysOfMonth: [] } });
  await t.call("PUT", "/api/finance-profile", { filingStatus: "single", hoursPerWeek: 40, nycResident: false, raiseRate: 0.03, salarySteps: [{ effectiveDate: "2025-01-01", annualGross: 80000 }], retirementSteps: [], healthSteps: [], rentSteps: [], whatIfSalaries: [], salaryTransactionId: salary._id, rentTransactionId: rent._id });

  assert.equal((await t.call("DELETE", `/api/accounts/${doomed._id}`)).status, 200);

  const after = async (id: string) => (await accounts(t.store).findById(id))!;
  // The loan survives without its link to Doomed or its payment plan transfer (deleted with Doomed)
  const survivor = await after(loan._id);
  assert.deepEqual(["linkedAccountId" in survivor, "paymentTransactionId" in survivor, survivor.isLoan], [false, false, true]);
  assert.equal(await tx().findById(loanPay), null);
  // Links to anything else are untouched
  assert.deepEqual([(await after(card._id)).paymentTransactionId, (await after(otherLoan._id)).linkedAccountId], [cardPay, bank._id]);
  // The Datasheet's Salary link pointed at a transfer deleted with Doomed; Rent is kept
  const profile = ((await t.call("GET", "/api/finance-profile")).body as { data: { salaryTransactionId: string | null; rentTransactionId: string | null } }).data;
  assert.deepEqual([profile.salaryTransactionId, profile.rentTransactionId], [null, rent._id]);
  // The stale debit stays (it is Bank's) without the dangling destination
  const kept = (await tx().findById(stale._id))!;
  assert.deepEqual([kept.type, kept.accountId, "toAccountId" in kept], ["debit", bank._id, false]);
  // The deleted account is not written back
  assert.equal(await accounts(t.store).findById(doomed._id), null);
  // The next Datasheet save no longer answers 409
  const save = await t.call("PUT", "/api/finance-profile", { filingStatus: "single", hoursPerWeek: 40, nycResident: false, raiseRate: 0.03, salarySteps: [{ effectiveDate: "2025-01-01", annualGross: 80000 }], retirementSteps: [], healthSteps: [], rentSteps: [], whatIfSalaries: [], ...profile });
  assert.equal(save.status, 200);
});

test("validation is 400 with flatten details; unknown and malformed ids are 404; an unparseable body is 400", async () => {
  const bad = await t.call("POST", "/api/accounts", { name: "", type: "bank", balance: 1 });
  assert.equal(bad.status, 400);
  assert.equal((bad.body as { error: string }).error, "Validation failed");
  assert.deepEqual(Object.keys((bad.body as { details: object }).details).sort(), ["fieldErrors", "formErrors"]);
  const valid = { name: "x", type: "bank", balance: 0 };
  for (const id of ["abc", "a".repeat(24)]) {
    for (const [method, body] of [["GET", undefined], ["PUT", valid], ["PATCH", { isArchived: true }], ["DELETE", undefined]] as const) {
      assert.deepEqual(await t.call(method, `/api/accounts/${id}`, body), { status: 404, body: { error: "Account not found" } });
    }
  }
  const a = await acct(valid);
  assert.equal((await t.call("PUT", `/api/accounts/${a._id}`, undefined)).status, 400);
  assert.equal((await t.call("PUT", `/api/accounts/${a._id}`, null)).status, 400);
  const cash = (await accounts(t.store).findOne({ isCash: true }))!;
  assert.deepEqual(await t.call("PUT", `/api/accounts/${cash._id}`, null), { status: 500, body: { error: "Failed to update account" } });
  assert.equal((await t.call("PUT", `/api/accounts/${cash._id}`, undefined)).status, 400);
  assert.equal((await t.call("PATCH", `/api/accounts/${a._id}`, { isArchived: "yes" })).status, 400);
  assert.deepEqual(await t.call("POST", "/api/accounts", { name: "   ", type: "bank", balance: 0 }), { status: 500, body: { error: "Failed to create account" } });
});

test("a future transaction is applied once when its day arrives, and never twice", async () => {
  const bank = await acct({ name: "Bank", type: "bank", balance: 100 });
  const card = await acct({ name: "Card", type: "credit_card", balance: 50 });
  const pending = { description: "p", isRecurring: false, categoryTags: [], balanceApplied: false, date: "2026-11-19T00:00:00.000Z" };
  await tx().insert({ ...pending, amount: 2500, type: "debit", accountId: bank._id });
  await tx().insert({ ...pending, amount: 1000, type: "transfer", accountId: bank._id, toAccountId: card._id });
  await tx().insert({ ...pending, amount: 0, type: "debit", accountId: bank._id });
  await tx().insert({ ...pending, amount: 700, type: "debit", accountId: bank._id, isRecurring: true });
  await tx().insert({ ...pending, amount: 300, type: "credit", accountId: card._id });
  await t.call("GET", "/api/accounts");
  assert.deepEqual(await balances(), { Bank: 10000, Card: 5000 });
  t.setNow(new Date("2026-11-19T15:00:00.000Z"));
  await t.call("GET", "/api/accounts");
  await t.call("GET", "/api/accounts");
  assert.deepEqual(await balances(), { Bank: 6500, Card: 3700 });
  assert.deepEqual((await tx().find({ balanceApplied: false })).map((x) => x.amount), [700]);
});

test("pending transactions are applied by the local calendar day, west and east of UTC", async () => {
  const bank = await acct({ name: "Bank", type: "bank", balance: 100 });
  const pending = (date: string, amount: number) =>
    tx().insert({ description: "p", isRecurring: false, categoryTags: [], balanceApplied: false, date, amount, type: "debit", accountId: bank._id });
  await pending("2026-11-17T00:00:00.000Z", 100);
  await pending("2026-11-18T00:00:00.000Z", 200);
  await pending("2026-11-18T23:00:00.000Z", 400);
  await pending("2026-11-19T00:00:00.000Z", 800);
  t.setNow(new Date("2026-11-18T03:00:00.000Z")); // 22:00 on 17 Nov in New York, 18 Nov in UTC
  await t.call("GET", "/api/accounts");
  assert.equal((await balances()).Bank, 9900);
  await withTimeZone("Asia/Tokyo", async () => {
    t.setNow(new Date("2026-11-17T20:00:00.000Z")); // 05:00 on 18 Nov in Tokyo, 17 Nov in UTC
    await t.call("GET", "/api/accounts");
  });
  assert.equal((await balances()).Bank, 9300);
  assert.deepEqual((await tx().find({ balanceApplied: false })).map((x) => x.amount), [800]);
});

test("due plan payments post once, capped at what is owed, and nothing moves once nothing is owed", async () => {
  const bank = await acct({ name: "Bank", type: "bank", balance: 1000 });
  const card = await acct({ name: "Card", type: "credit_card", balance: 120 });
  const pay = await tx().insert({ amount: 5000, date: "2026-09-15T00:00:00.000Z", description: "Card payment", accountId: bank._id, toAccountId: card._id, type: "transfer", isRecurring: true,
    recurrenceRule: { frequency: "monthly", interval: 1, startDate: "2026-09-15T00:00:00.000Z", endDate: null, dayOfMonth: 15, daysOfMonth: [] }, categoryTags: ["credit", "transfer"], balanceApplied: false });
  await accounts(t.store).updateById(card._id, { $set: { paymentTransactionId: pay._id } });
  await t.call("GET", "/api/accounts");
  await t.call("GET", "/api/accounts");
  assert.deepEqual(await balances(), { Bank: 88000, Card: 0 }); // 15 Sep, 15 Oct, 15 Nov: 50 + 50 + 20
  assert.equal((await tx().findById(pay._id))!.postedThrough, "2026-11-15T00:00:00.000Z");
  t.setNow(new Date("2026-12-16T15:00:00.000Z"));
  await t.call("GET", `/api/accounts/${card._id}`);
  assert.deepEqual(await balances(), { Bank: 88000, Card: 0 });
  // Nothing was owed on 15 Dec: that due date pays nothing and is done
  assert.equal((await tx().findById(pay._id))!.postedThrough, "2026-12-15T00:00:00.000Z");
});

// A plan with a $50 instalment on the 15th, from Bank to a card owing nothing; postedThrough unset.
async function zeroOwedPlan() {
  const bank = await acct({ name: "Bank", type: "bank", balance: 1000 });
  const card = await acct({ name: "Card", type: "credit_card", balance: 0 });
  const pay = await tx().insert({ amount: 5000, date: "2026-11-15T00:00:00.000Z", description: "p", accountId: bank._id, toAccountId: card._id, type: "transfer", isRecurring: true,
    recurrenceRule: { frequency: "monthly", interval: 1, startDate: "2026-11-15T00:00:00.000Z", endDate: null, dayOfMonth: 15, daysOfMonth: [] }, categoryTags: [], balanceApplied: false });
  await accounts(t.store).updateById(card._id, { $set: { paymentTransactionId: pay._id } });
  const charge = (amount: number, date: string) =>
    t.call("POST", "/api/transactions", { amount, date, description: "charge", accountId: card._id, type: "debit", categoryTags: ["spending"] });
  return { pay, charge };
}

test("a charge after a due date that found nothing owed waits for the next due date, which pays min(owed, instalment)", async () => {
  const { pay, charge } = await zeroOwedPlan();
  await t.call("GET", "/api/accounts"); // 17 Nov: the 15 Nov due date found nothing owed
  assert.equal((await tx().findById(pay._id))!.postedThrough, "2026-11-15T00:00:00.000Z");
  t.setNow(new Date("2026-11-20T15:00:00.000Z"));
  assert.equal((await charge(30, "2026-11-20")).status, 201);
  await t.call("GET", "/api/accounts");
  await t.call("GET", "/api/accounts");
  assert.deepEqual(await balances(), { Bank: 100000, Card: 3000 });
  t.setNow(new Date("2026-12-16T15:00:00.000Z"));
  await t.call("GET", "/api/accounts");
  assert.deepEqual(await balances(), { Bank: 97000, Card: 0 });
  assert.equal((await tx().findById(pay._id))!.postedThrough, "2026-12-15T00:00:00.000Z");
});

test("three due dates with nothing owed then a $200 charge: the next due date pays one instalment, not four", async () => {
  const { pay, charge } = await zeroOwedPlan();
  for (const now of ["2026-11-17", "2026-12-16", "2027-01-16"]) {
    t.setNow(new Date(`${now}T15:00:00.000Z`));
    await t.call("GET", "/api/accounts");
  }
  assert.equal((await tx().findById(pay._id))!.postedThrough, "2027-01-15T00:00:00.000Z");
  t.setNow(new Date("2027-01-20T15:00:00.000Z"));
  assert.equal((await charge(200, "2027-01-20")).status, 201);
  await t.call("GET", "/api/accounts");
  assert.deepEqual(await balances(), { Bank: 100000, Card: 20000 });
  t.setNow(new Date("2027-02-16T15:00:00.000Z"));
  await t.call("GET", "/api/accounts");
  await t.call("GET", "/api/accounts");
  assert.deepEqual(await balances(), { Bank: 95000, Card: 15000 });
  assert.equal((await tx().findById(pay._id))!.postedThrough, "2027-02-15T00:00:00.000Z");
});

test("pending transactions are applied before due payments are posted, so a charge counts toward what is owed", async () => {
  const { pay } = await zeroOwedPlan();
  // Stored unapplied (e.g. created while it was still in the future), dated before today's due date
  const card = (await accounts(t.store).findOne({ name: "Card" }))!;
  await tx().insert({ amount: 3000, date: "2026-11-10T00:00:00.000Z", description: "charge", accountId: card._id, type: "debit", isRecurring: false, categoryTags: [], balanceApplied: false });
  await t.call("GET", "/api/accounts");
  assert.deepEqual(await balances(), { Bank: 97000, Card: 0 });
  assert.equal((await tx().findById(pay._id))!.postedThrough, "2026-11-15T00:00:00.000Z");
});

test("a scheduled payment of 0 while something is owed still counts as posted (no stall)", async () => {
  const bank = await acct({ name: "Bank", type: "bank", balance: 1000 });
  const card = await acct({ name: "Card", type: "credit_card", balance: 120 });
  const pay = await tx().insert({ amount: 5000, date: "2026-10-15T00:00:00.000Z", description: "p", accountId: bank._id, toAccountId: card._id, type: "transfer", isRecurring: true,
    recurrenceRule: { frequency: "monthly", interval: 1, startDate: "2026-10-15T00:00:00.000Z", endDate: null, dayOfMonth: 15, daysOfMonth: [] }, categoryTags: [], balanceApplied: false,
    amountSchedule: [{ effectiveDate: "2026-11-01T00:00:00.000Z", amount: 0 }] });
  await accounts(t.store).updateById(card._id, { $set: { paymentTransactionId: pay._id } });
  await t.call("GET", "/api/accounts");
  assert.deepEqual(await balances(), { Bank: 95000, Card: 7000 });
  assert.equal((await tx().findById(pay._id))!.postedThrough, "2026-11-15T00:00:00.000Z");
});

test("a failed balance write after the payment claim restores postedThrough, and the payments post once later (bug 10)", async () => {
  const bank = await acct({ name: "Bank", type: "bank", balance: 1000 });
  const card = await acct({ name: "Card", type: "credit_card", balance: 120 });
  const pay = await tx().insert({ amount: 5000, date: "2026-10-15T00:00:00.000Z", description: "p", accountId: bank._id, toAccountId: card._id, type: "transfer", isRecurring: true,
    recurrenceRule: { frequency: "monthly", interval: 1, startDate: "2026-10-15T00:00:00.000Z", endDate: null, dayOfMonth: 15, daysOfMonth: [] }, categoryTags: [], balanceApplied: false });
  await accounts(t.store).updateById(card._id, { $set: { paymentTransactionId: pay._id } });
  const failing = interleavingStore(t.store, (name, method) => {
    if (name === "accounts" && method === "batchUpdate") throw new Error("write failed");
  });
  assert.deepEqual(await dispatch(financeRoutes, failing, "GET", "/api/accounts", undefined, NOW), { status: 500, body: { error: "Failed to fetch accounts" } });
  assert.equal("postedThrough" in (await tx().findById(pay._id))!, false);
  assert.deepEqual(await balances(), { Bank: 100000, Card: 12000 });
  await t.call("GET", "/api/accounts");
  await t.call("GET", "/api/accounts");
  assert.deepEqual(await balances(), { Bank: 90000, Card: 2000 });
  assert.equal((await tx().findById(pay._id))!.postedThrough, "2026-11-15T00:00:00.000Z");
});

test("two interleaved account lists apply a pending transaction and post a due payment once (bugs 9, 10)", async () => {
  const bank = await acct({ name: "Bank", type: "bank", balance: 1000 });
  const card = await acct({ name: "Card", type: "credit_card", balance: 500 });
  const base = { description: "p", isRecurring: false, categoryTags: [], balanceApplied: false, date: "2026-11-16T00:00:00.000Z" };
  await tx().insert({ ...base, amount: 2500, type: "debit", accountId: bank._id });
  await tx().insert({ ...base, amount: 1000, type: "transfer", accountId: bank._id, toAccountId: card._id });
  const pay = await tx().insert({ amount: 5000, date: "2026-11-15T00:00:00.000Z", description: "plan", accountId: bank._id, toAccountId: card._id, type: "transfer", isRecurring: true,
    recurrenceRule: { frequency: "monthly", interval: 1, startDate: "2026-11-15T00:00:00.000Z", endDate: null, dayOfMonth: 15, daysOfMonth: [] }, categoryTags: [], balanceApplied: false });
  await accounts(t.store).updateById(card._id, { $set: { paymentTransactionId: pay._id } });
  const racing = interleavingStore(t.store);
  const both = await Promise.all([1, 2].map(() => dispatch(financeRoutes, racing, "GET", "/api/accounts", undefined, NOW)));
  assert.deepEqual(both.map((r) => r.status), [200, 200]);
  // Bank: 1000 - 25 - 10 - 50; Card: 500 - 10 - 50
  assert.deepEqual(await balances(), { Bank: 91500, Card: 44000 });
  assert.deepEqual((await tx().find({ balanceApplied: false })).map((x) => x._id), [pay._id]);
});

test("a failed balance write releases the pending transaction's claim; the next list applies it once (bug 9)", async () => {
  const bank = await acct({ name: "Bank", type: "bank", balance: 100 });
  const card = await acct({ name: "Card", type: "credit_card", balance: 50 });
  const base = { description: "p", isRecurring: false, categoryTags: [], balanceApplied: false, date: "2026-11-16T00:00:00.000Z" };
  await tx().insert({ ...base, amount: 2500, type: "debit", accountId: bank._id });
  await tx().insert({ ...base, amount: 1000, type: "transfer", accountId: bank._id, toAccountId: card._id });
  const failOn = (method: string) => interleavingStore(t.store, (name, m) => {
    if (name === "accounts" && m === method) throw new Error("write failed");
  });
  // The debit's balance write fails: nothing moves, both stay pending
  assert.equal((await dispatch(financeRoutes, failOn("updateById"), "GET", "/api/accounts", undefined, NOW)).status, 500);
  assert.deepEqual(await balances(), { Bank: 10000, Card: 5000 });
  assert.equal(await tx().count({ balanceApplied: false }), 2);
  // The debit applies; the transfer's balance write fails and it stays pending
  assert.equal((await dispatch(financeRoutes, failOn("batchUpdate"), "GET", "/api/accounts", undefined, NOW)).status, 500);
  assert.deepEqual(await balances(), { Bank: 7500, Card: 5000 });
  assert.equal(await tx().count({ balanceApplied: false }), 1);
  await t.call("GET", "/api/accounts");
  await t.call("GET", "/api/accounts");
  assert.deepEqual(await balances(), { Bank: 6500, Card: 4000 });
  assert.equal(await tx().count({ balanceApplied: false }), 0);
});

test("payments are not posted for an archived account, and a second request with nothing due writes nothing", async () => {
  const bank = await acct({ name: "Bank", type: "bank", balance: 1000 });
  const card = await acct({ name: "Card", type: "credit_card", balance: 120 });
  const pay = await tx().insert({ amount: 5000, date: "2026-09-15T00:00:00.000Z", description: "p", accountId: bank._id, toAccountId: card._id, type: "transfer", isRecurring: true,
    recurrenceRule: { frequency: "monthly", interval: 1, startDate: "2026-09-15T00:00:00.000Z", endDate: null, dayOfMonth: 15, daysOfMonth: [] }, categoryTags: [], balanceApplied: false });
  await accounts(t.store).updateById(card._id, { $set: { paymentTransactionId: pay._id, isArchived: true } });
  await t.call("GET", "/api/accounts?includeArchived=true");
  assert.deepEqual(await balances(), { Bank: 100000, Card: 12000 });
  assert.equal("postedThrough" in (await tx().findById(pay._id))!, false);
  await accounts(t.store).updateById(card._id, { $set: { isArchived: false } });
  await t.call("GET", "/api/accounts");
  const [accountWrites, txWrites] = [t.writes("accounts"), t.writes("transactions")];
  await t.call("GET", "/api/accounts");
  assert.deepEqual([t.writes("accounts"), t.writes("transactions")], [accountWrites, txWrites]);
});

// ── Golden steps for R1–R6 (scripts/finance-parity/golden/transcript.json) ──

test("golden A05, A07, A09: create keeps the float fraction, loan fields, and the full flatten details", async () => {
  const checking = await acct({ name: "Parity Checking", type: "bank", balance: 5000 });
  const card = await acct({ name: "Parity Card", type: "credit_card", balance: 400, creditLimit: 1000, apr: 24.99, minimumPayment: 35 });
  assert.deepEqual(strip(card), { apr: 0.24989999999999998, balance: 40000, creditLimit: 100000, currency: "USD", isArchived: false, isCash: false, minimumPayment: 3500, name: "Parity Card", type: "credit_card" });
  const car = await acct({ name: "Parity Car Loan", type: "debt", balance: 8000, isLoan: true, linkedAccountId: checking._id, depositFunds: true, apr: 7.25, minimumPayment: 150 });
  assert.deepEqual(strip(car), { apr: 0.0725, balance: 800000, currency: "USD", isArchived: false, isCash: false, isLoan: true, linkedAccountId: checking._id, minimumPayment: 15000, name: "Parity Car Loan", type: "debt" });
  assert.equal((await getAcct(checking._id)).balance, 1300000);
  assert.deepEqual(await t.call("POST", "/api/accounts", { name: "", type: "nope", balance: "x" }), {
    status: 400,
    body: {
      error: "Validation failed",
      details: {
        formErrors: [],
        fieldErrors: {
          name: ["Name is required"],
          type: ['Invalid option: expected one of "bank"|"credit_card"|"debt"'],
          balance: ["Invalid input: expected number, received string"],
        },
      },
    },
  });
});

test("golden A18, A20, A21: PUT replaces and removes plan fields, Cash may stay a bank, missing fields are 400", async () => {
  const card = await acct({ name: "Parity Card", type: "credit_card", balance: 400, creditLimit: 1000, apr: 24.99, minimumPayment: 35 });
  const a18 = await t.call("PUT", `/api/accounts/${card._id}`, { name: "Parity Card", type: "credit_card", balance: 400, creditLimit: 1500, apr: null, minimumPayment: 40, depositFunds: true });
  assert.deepEqual([a18.status, strip(a18.body as AccountDoc)], [200, { balance: 40000, creditLimit: 150000, currency: "USD", isArchived: false, isCash: false, minimumPayment: 4000, name: "Parity Card", type: "credit_card" }]);
  const cash = (await accounts(t.store).findOne({ isCash: true }))!;
  const a20 = await t.call("PUT", `/api/accounts/${cash._id}`, { name: "Cash", type: "bank", balance: 25 });
  assert.deepEqual([a20.status, strip(a20.body as AccountDoc)], [200, { balance: 2500, currency: "USD", isArchived: false, isCash: true, name: "Cash", type: "bank" }]);
  assert.deepEqual(await t.call("PUT", `/api/accounts/${card._id}`, { name: "x" }), {
    status: 400,
    body: {
      error: "Validation failed",
      details: {
        formErrors: [],
        fieldErrors: {
          type: ['Invalid option: expected one of "bank"|"credit_card"|"debt"'],
          balance: ["Invalid input: expected number, received undefined"],
        },
      },
    },
  });
  assert.deepEqual(await t.call("PATCH", `/api/accounts/${card._id}`, { isArchived: "yes" }), {
    status: 400,
    body: { error: "Validation failed", details: { formErrors: [], fieldErrors: { isArchived: ["Invalid input: expected boolean, received string"] } } },
  });
});

test("golden X09, X10: a malformed linkedAccountId in a body is the route's 500 and writes nothing", async () => {
  const checking = await acct({ name: "Parity Checking", type: "bank", balance: 5000 });
  const car = await acct({ name: "Parity Car Loan", type: "debt", balance: 8000, isLoan: true, linkedAccountId: checking._id, depositFunds: true });
  const [accountWrites, txWrites] = [t.writes("accounts"), t.writes("transactions")];
  assert.deepEqual(await t.call("POST", "/api/accounts", { name: "Parity Bad Link", type: "debt", balance: 10, isLoan: true, linkedAccountId: "abc", depositFunds: true }), { status: 500, body: { error: "Failed to create account" } });
  assert.deepEqual(await t.call("PUT", `/api/accounts/${car._id}`, { name: "Parity Car Loan", type: "debt", balance: 8000, isLoan: true, linkedAccountId: "abc" }), { status: 500, body: { error: "Failed to update account" } });
  assert.deepEqual([t.writes("accounts"), t.writes("transactions")], [accountWrites, txWrites]);
  assert.equal((await accounts(t.store).findById(car._id))!.linkedAccountId, checking._id);
});

test("golden A11-A14: list filters by type and hides archived by default", async () => {
  // Order (createdAt descending) is not asserted: inserts within one millisecond tie.
  await acct({ name: "Checking", type: "bank", balance: 1 });
  await acct({ name: "Loan", type: "debt", balance: 1 });
  const savings = await acct({ name: "Savings", type: "bank", balance: 1 });
  await t.call("PATCH", `/api/accounts/${savings._id}`, { isArchived: true });
  const names = async (qs: string) => ((await t.call("GET", `/api/accounts${qs}`)).body as AccountDoc[]).map((x) => x.name).sort();
  assert.deepEqual(await names(""), ["Cash", "Checking", "Loan"]);
  assert.deepEqual(await names("?type=bank"), ["Cash", "Checking"]);
  assert.deepEqual(await names("?includeArchived=true"), ["Cash", "Checking", "Loan", "Savings"]);
  assert.deepEqual(await names("?type=debt&includeArchived=true"), ["Loan"]);
  assert.deepEqual(await names("?type=bogus&includeArchived=true"), []);
});

test("deleting an account deletes exactly the transactions it read, so one written in between is not removed (bug 7)", async () => {
  const doomed = await acct({ name: "Doomed", type: "bank", balance: 0 });
  const row = { amount: 100, date: "2026-11-01T00:00:00.000Z", description: "t", type: "debit" as const, isRecurring: false, categoryTags: [], balanceApplied: true };
  const read = await tx().insert({ ...row, accountId: doomed._id });
  let late: string | undefined;
  // Another request inserts a transaction for the account right after the delete reads its list
  const racing = {
    collection: ((name: Parameters<typeof t.store.collection>[0]) => {
      const real = t.store.collection(name);
      if (name !== "transactions") return real;
      return new Proxy(real, {
        get(target, prop) {
          const value = Reflect.get(target, prop, target);
          if (prop !== "find" || typeof value !== "function") return typeof value === "function" ? value.bind(target) : value;
          return async (...args: unknown[]) => {
            const found = await value.apply(target, args);
            late ??= (await tx().insert({ ...row, amount: 200, accountId: doomed._id }))._id;
            return found;
          };
        },
      });
    }) as typeof t.store.collection,
  };
  const res = await dispatch(financeRoutes, racing, "DELETE", `/api/accounts/${doomed._id}`, undefined, NOW);
  assert.equal(res.status, 200);
  assert.equal(await tx().findById(read._id), null);
  assert.ok(late && (await tx().findById(late)));
});
