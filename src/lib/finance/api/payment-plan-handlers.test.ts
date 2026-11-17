import { test } from "node:test";
import assert from "node:assert/strict";
import { dispatch } from "@/lib/data/dispatch";
import type { BaseDoc, Collection, CollectionName, Store } from "@/lib/data/store";
import { DEFAULT_PROFILE } from "@/lib/finance/finance-profile";
import { accounts, profileToDoc, profiles, transactions, type AccountDoc } from "./docs";
import { regenerateAllRapSchedules, setupPayments, type PaymentPlanDTO } from "./payment-plan";
import { financeRoutes } from "./routes";
import { NOW, setup } from "./test-helpers";

let t = setup();
const acct = async (body: object) => (await t.call("POST", "/api/accounts", body)).body as AccountDoc;
const balances = async () => Object.fromEntries((await accounts(t.store).find({ isCash: { $ne: true } })).map((a) => [a.name, a.balance]));
const tx = () => transactions(t.store);
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const strip = <T extends BaseDoc>({ _id, createdAt, updatedAt, ...rest }: T) => rest;
const plan = (id: string) => `/api/accounts/${id}/payment-plan`;
const dto = async (id: string) => ((await t.call("GET", plan(id))).body as { data: PaymentPlanDTO }).data;

let bank: AccountDoc, card: AccountDoc, loan: AccountDoc;
test.beforeEach(async () => {
  t = setup();
  bank = await acct({ name: "Bank", type: "bank", balance: 1000 });
  card = await acct({ name: "Card", type: "credit_card", balance: 200, creditLimit: 500, apr: 25 });
  loan = await acct({ name: "Loan", type: "debt", balance: 300 });
});

const setupBody = () => ({ fromAccountId: bank._id, dayOfMonth: 15, startDate: "2026-12-15", firstAmount: 50 });
const RAP = { enabled: true, autoSchedule: false, recertDate: "07-01", dependents: 2 };

test("no plan: the DTO is empty", async () => {
  assert.deepEqual(await dto(card._id), { accountId: card._id, apr: 25, blendedApr: null, minimumPayment: null, subLoans: [], rap: null, payment: null, schedule: [], nextRap: null, payoff: null });
});

test("setup creates the monthly transfer, links it, and reports it", async () => {
  const res = await t.call("POST", plan(card._id), setupBody());
  assert.equal(res.status, 200);
  const data = (res.body as { data: PaymentPlanDTO }).data;
  const stored = (await tx().find())[0];
  assert.deepEqual(strip(stored), { amount: 5000, date: "2026-12-15T00:00:00.000Z", description: "Card payment", accountId: bank._id, toAccountId: card._id, type: "transfer", isRecurring: true,
    recurrenceRule: { frequency: "monthly", interval: 1, startDate: "2026-12-15T00:00:00.000Z", endDate: null, dayOfMonth: 15, daysOfMonth: [] },
    categoryTags: ["credit", "transfer"], balanceApplied: false, amountSchedule: [{ effectiveDate: "2026-12-15T00:00:00.000Z", amount: 5000 }] });
  assert.deepEqual(data.payment, { transactionId: stored._id, fromAccountId: bank._id, fromAccountName: "Bank", dayOfMonth: 15, frequency: "monthly", cadence: "monthly on the 15th" });
  assert.deepEqual(data.schedule, [{ effectiveDate: "2026-12-15", amount: 50 }]);
  assert.ok(data.payoff !== null);
  assert.equal((await accounts(t.store).findById(card._id))!.paymentTransactionId, stored._id);
  assert.deepEqual(await balances(), { Bank: 100000, Card: 20000, Loan: 30000 });
  await t.call("POST", plan(loan._id), { ...setupBody(), firstAmount: 25 });
  assert.deepEqual((await tx().find({ toAccountId: loan._id }))[0].categoryTags, ["loans", "transfer"]);
});

test("update: schedule, sub-loans and RAP settings", async () => {
  await t.call("POST", plan(loan._id), setupBody());
  const payId = (await dto(loan._id)).payment!.transactionId;
  const a = (await t.call("PUT", plan(loan._id), { schedule: [{ effectiveDate: "2026-12-15", amount: 60 }, { effectiveDate: "2027-03-15", amount: 80 }] })).body as { data: PaymentPlanDTO };
  assert.deepEqual(a.data.schedule, [{ effectiveDate: "2026-12-15", amount: 60 }, { effectiveDate: "2027-03-15", amount: 80 }]);
  assert.equal((await tx().findById(payId))!.amount, 6000);
  const b = (await t.call("PUT", plan(loan._id), { subLoans: [{ name: " A ", balance: 100, apr: 5 }, { name: "B", balance: 300, apr: 9 }] })).body as { data: PaymentPlanDTO };
  assert.deepEqual([b.data.subLoans, b.data.blendedApr], [[{ name: "A", balance: 100, apr: 5 }, { name: "B", balance: 300, apr: 9 }], 8]);
  assert.deepEqual((await accounts(t.store).findById(loan._id))!.subLoans, [{ name: "A", balance: 10000, apr: 0.05 }, { name: "B", balance: 30000, apr: 0.09 }]);
  const c = (await t.call("PUT", plan(loan._id), { rap: RAP })).body as { data: PaymentPlanDTO };
  assert.deepEqual([c.data.rap, c.data.nextRap], [RAP, null]);
});

test("reading the plan and repeating an identical update writes nothing", async () => {
  await t.call("POST", plan(loan._id), setupBody());
  const update = { schedule: [{ effectiveDate: "2026-12-15", amount: 60 }], subLoans: [{ name: "A", balance: 100, apr: 5 }], rap: RAP };
  await t.call("PUT", plan(loan._id), update);
  const before = [t.writes("accounts"), t.writes("transactions")];
  assert.equal((await t.call("PUT", plan(loan._id), update)).status, 200);
  await dto(loan._id);
  assert.deepEqual([t.writes("accounts"), t.writes("transactions")], before);
});

test("unlink deletes the transfer and the link, and reverses nothing", async () => {
  await t.call("POST", plan(card._id), setupBody());
  const res = await t.call("DELETE", plan(card._id));
  assert.deepEqual([res.status, (res.body as { data: PaymentPlanDTO }).data.payment, (res.body as { data: PaymentPlanDTO }).data.schedule], [200, null, []]);
  assert.equal(await tx().count(), 0);
  assert.equal("paymentTransactionId" in (await accounts(t.store).findById(card._id))!, false);
  assert.deepEqual(await balances(), { Bank: 100000, Card: 20000, Loan: 30000 });
});

test("errors carry today's messages and statuses", async () => {
  const err = (status: number, error: string) => ({ status, body: { error } });
  assert.deepEqual(await t.call("GET", plan(bank._id)), err(400, "Payment plans are for credit cards and debt accounts"));
  for (const id of ["abc", "a".repeat(24)]) assert.deepEqual(await t.call("GET", plan(id)), err(404, "Account not found"));
  assert.deepEqual(await t.call("POST", plan(card._id), { ...setupBody(), fromAccountId: "" }), err(400, "Choose the account payments come from"));
  assert.equal((await t.call("POST", plan(card._id), undefined)).status, 400);
  assert.deepEqual(await t.call("POST", plan(card._id), { ...setupBody(), fromAccountId: loan._id }), err(400, "Payments must come from an active bank account"));
  assert.deepEqual(await t.call("POST", plan(card._id), { ...setupBody(), fromAccountId: "abc" }), err(500, "Failed to update payment plan"));
  assert.deepEqual(await t.call("PUT", plan(card._id), { schedule: [{ effectiveDate: "2026-12-15", amount: 1 }] }), err(409, "No payment linked — set up payments"));
  await t.call("POST", plan(card._id), setupBody());
  assert.deepEqual(await t.call("POST", plan(card._id), setupBody()), err(409, "Payments are already set up for this account — unlink them first"));
  assert.deepEqual(await t.call("PUT", plan(card._id), { schedule: [{ effectiveDate: "2026-12-15", amount: 1 }, { effectiveDate: "2026-12-15", amount: 2 }] }), err(400, "Duplicate date in payment changes"));
  assert.deepEqual(await t.call("PUT", plan(card._id), { rap: RAP }), err(400, "RAP applies to debt accounts only"));
});

test("a refused RAP change writes nothing, not even the schedule sent with it", async () => {
  await t.call("POST", plan(card._id), setupBody());
  const before = [await tx().find(), await accounts(t.store).find()];
  const res = await t.call("PUT", plan(card._id), { schedule: [{ effectiveDate: "2026-12-15", amount: 75 }], subLoans: [{ name: "A", balance: 1, apr: 1 }], rap: RAP });
  assert.deepEqual(res, { status: 400, body: { error: "RAP applies to debt accounts only" } });
  assert.deepEqual([await tx().find(), await accounts(t.store).find()], before);
});

/**
 * `t.store` with accounts.updateById failing (the link write), and transactions.deleteById failing
 * too when `deleteFails`; inserts and deletes on transactions are recorded.
 */
function brokenStore(deleteFails: boolean) {
  const inserted: string[] = [];
  const deleted: string[] = [];
  const store: Store = {
    collection<T extends BaseDoc>(name: CollectionName): Collection<T> {
      const inner = t.store.collection<T>(name);
      if (name === "accounts") {
        return Object.assign(Object.create(inner) as Collection<T>, {
          updateById: async () => {
            throw new Error("link write failed");
          },
        });
      }
      if (name !== "transactions") return inner;
      return Object.assign(Object.create(inner) as Collection<T>, {
        insert: async (doc: Omit<T, keyof BaseDoc>) => {
          const made = await inner.insert(doc);
          inserted.push(made._id);
          return made;
        },
        deleteById: async (id: string) => {
          deleted.push(id);
          if (deleteFails) throw new Error("cleanup failed");
          return inner.deleteById(id);
        },
      });
    },
  };
  return { store, inserted, deleted };
}

test("payment setup whose link write fails deletes the transfer it created and fails", async () => {
  const before = [await tx().find(), await accounts(t.store).find()];
  const txWrites = t.writes("transactions");
  const broken = brokenStore(false);
  const res = await dispatch(financeRoutes, broken.store, "POST", plan(card._id), setupBody(), NOW);
  assert.deepEqual(res, { status: 500, body: { error: "Failed to update payment plan" } });
  // The transfer was inserted, then that same id deleted (two transactions writes)
  assert.equal(broken.inserted.length, 1);
  assert.deepEqual(broken.deleted, broken.inserted);
  assert.equal(t.writes("transactions"), txWrites + 2);
  assert.deepEqual([await tx().find(), await accounts(t.store).find()], before);
});

test("payment setup: a failing cleanup does not replace the link write's error", async () => {
  const broken = brokenStore(true);
  await assert.rejects(setupPayments(broken.store, card._id, setupBody(), NOW), { message: "link write failed" });
  assert.equal(broken.inserted.length, 1);
  assert.deepEqual(broken.deleted, broken.inserted);
  // Through the route it is the 500 as before
  assert.deepEqual(await dispatch(financeRoutes, brokenStore(true).store, "POST", plan(loan._id), setupBody(), NOW), { status: 500, body: { error: "Failed to update payment plan" } });
});

test("the plan routes post due payments first", async () => {
  await t.call("POST", plan(card._id), { ...setupBody(), startDate: "2026-10-15" });
  await dto(card._id);
  assert.deepEqual(await balances(), { Bank: 90000, Card: 10000, Loan: 30000 }); // 15 Oct and 15 Nov
});

// ── Beyond the brief: golden steps X01–X07, P14–P16, and save() semantics ──

const B = "b".repeat(24);
const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

test("golden X01–X07: the account is checked first in every method; a malformed fromAccountId is the 500", async () => {
  const err = (status: number, error: string) => ({ status, body: { error } });
  const notFound = err(404, "Account not found");
  const notDebt = err(400, "Payment plans are for credit cards and debt accounts");
  assert.deepEqual(await t.call("DELETE", plan(B)), notFound); // X01
  assert.deepEqual(await t.call("DELETE", plan(bank._id)), notDebt); // X02
  assert.deepEqual(await t.call("POST", plan(B), { ...setupBody(), firstAmount: 1 }), notFound); // X03
  assert.deepEqual(await t.call("PUT", plan(B), {}), notFound); // X04
  assert.deepEqual(await t.call("POST", plan(bank._id), { ...setupBody(), firstAmount: 1 }), notDebt); // X05
  assert.deepEqual(await t.call("PUT", plan(bank._id), {}), notDebt); // X06
  const before = [t.writes("accounts"), t.writes("transactions")];
  assert.deepEqual(await t.call("POST", plan(loan._id), { ...setupBody(), fromAccountId: "abc" }), err(500, "Failed to update payment plan")); // X07
  assert.deepEqual([t.writes("accounts"), t.writes("transactions")], before);
});

test("golden P14–P16: re-sending an unchanged schedule, sub-loans and RAP leaves updatedAt unmoved", async () => {
  await t.call("POST", plan(loan._id), setupBody());
  const update = { schedule: [{ effectiveDate: "2026-12-15", amount: 50 }, { effectiveDate: "2027-05-15", amount: 70 }], subLoans: [{ name: "A", balance: 300, apr: 6 }], rap: RAP };
  await t.call("PUT", plan(loan._id), update);
  const payId = (await dto(loan._id)).payment!.transactionId;
  const stamps = async () => [(await tx().findById(payId))!.updatedAt, (await accounts(t.store).findById(loan._id))!.updatedAt];
  const before = await stamps();
  await tick();
  assert.equal((await t.call("PUT", plan(loan._id), update)).status, 200);
  assert.deepEqual(await stamps(), before);
  await tick();
  await t.call("PUT", plan(loan._id), { schedule: [{ effectiveDate: "2026-12-15", amount: 55 }] });
  const after = await stamps();
  assert.notEqual(after[0], before[0]);
  assert.equal(after[1], before[1]);
});

test("setup on a legacy account: the link is saved with the schema defaults it lacks", async () => {
  const old = await accounts(t.store).insert({ name: "Old Card", type: "credit_card", balance: 1000 } as Omit<AccountDoc, "_id" | "createdAt" | "updatedAt">);
  await t.call("POST", plan(old._id), setupBody());
  const stored = (await accounts(t.store).findById(old._id))!;
  const payId = (await tx().findOne({ toAccountId: old._id }))!._id;
  assert.deepEqual(strip(stored), { name: "Old Card", type: "credit_card", balance: 1000, paymentTransactionId: payId, currency: "USD", isCash: false, isArchived: false });
});

test("an identical RAP on a legacy account writes only the missing RAP defaults, without moving updatedAt", async () => {
  const old = await accounts(t.store).insert({
    name: "Old Loan", type: "debt", balance: 1000, currency: "USD", isCash: false, isArchived: false,
    rap: { enabled: true, autoSchedule: false },
  } as unknown as Omit<AccountDoc, "_id" | "createdAt" | "updatedAt">);
  await tick();
  const before = t.writes("accounts");
  const res = await t.call("PUT", plan(old._id), { rap: { enabled: true, autoSchedule: false, recertDate: "07-01", dependents: 0 } });
  assert.equal(res.status, 200);
  const stored = (await accounts(t.store).findById(old._id))!;
  assert.deepEqual(stored.rap, { enabled: true, autoSchedule: false, recertDate: "07-01", dependents: 0 });
  assert.equal(stored.updatedAt, old.updatedAt);
  assert.equal(t.writes("accounts"), before + 1);
});

test("an automatic RAP schedule is priced from the Datasheet salary, kept across manual edits, and regenerated idempotently", async () => {
  const salary = (await t.call("POST", "/api/transactions", {
    amount: 2000, date: "2025-01-03", description: "Salary", accountId: bank._id, type: "credit",
    isRecurring: true, recurrenceRule: { frequency: "biweekly", startDate: "2025-01-03", dayOfWeek: 5 },
  })).body as { _id: string };
  await profiles(t.store).insert(profileToDoc({ ...DEFAULT_PROFILE, salaryTransactionId: salary._id, salarySteps: [{ effectiveDate: "2025-01-01", annualGross: 6_000_000 }] }));
  await t.call("POST", plan(loan._id), setupBody());
  const res = (await t.call("PUT", plan(loan._id), { rap: { ...RAP, autoSchedule: true } })).body as { data: PaymentPlanDTO };
  const rapDates = res.data.schedule.filter((e) => e.source === "rap").map((e) => e.effectiveDate);
  assert.ok(rapDates.length > 0);
  assert.equal(rapDates[0], "2027-07-01");
  assert.equal(res.data.nextRap?.effectiveDate, "2027-07-01");
  const payId = res.data.payment!.transactionId;
  assert.ok((await tx().findById(payId))!.amountSchedule!.some((e) => e.source === "rap" && e.effectiveDate === "2027-07-01T00:00:00.000Z"));
  // A manual edit keeps the generated entries
  const edited = (await t.call("PUT", plan(loan._id), { schedule: [{ effectiveDate: "2026-12-15", amount: 65 }] })).body as { data: PaymentPlanDTO };
  assert.deepEqual(edited.data.schedule.filter((e) => e.source === "rap").map((e) => e.effectiveDate), rapDates);
  assert.deepEqual(edited.data.schedule[0], { effectiveDate: "2026-12-15", amount: 65 });
  // Nothing changed since: regenerating every RAP schedule writes nothing
  const before = [t.writes("accounts"), t.writes("transactions")];
  await regenerateAllRapSchedules(t.store, NOW);
  assert.deepEqual([t.writes("accounts"), t.writes("transactions")], before);
});

test("a schedule emptied of every entry is removed from the transaction", async () => {
  await t.call("POST", plan(card._id), setupBody());
  const res = (await t.call("PUT", plan(card._id), { schedule: [] })).body as { data: PaymentPlanDTO };
  assert.deepEqual([res.data.schedule, res.data.payoff], [[], null]);
  assert.equal("amountSchedule" in (await tx().find())[0], false);
});
