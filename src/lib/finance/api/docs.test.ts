import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PROFILE } from "@/lib/finance/finance-profile";
import {
  accountDefaults,
  accounts,
  assertId,
  buildRule,
  ensureCashAccount,
  profileFromDoc,
  profileToDoc,
  requiredText,
  saveTransaction,
  saveUpdate,
  shapeAccount,
  shapeCategory,
  shapeTransaction,
  transactionDefaults,
  transactions,
  type AccountDoc,
  type CategoryDoc,
  type ProfileDoc,
  type TransactionDoc,
} from "./docs";
import { countingStore } from "./test-helpers";

const base = { _id: "a".repeat(24), createdAt: "c", updatedAt: "u" };

test("shape fills the defaults Mongoose hydration fills, and nothing else", () => {
  assert.deepEqual(shapeAccount({ ...base, name: "Old", type: "bank" } as AccountDoc), { ...base, name: "Old", type: "bank", balance: 0, currency: "USD", isCash: false, isArchived: false });
  const full = { ...base, name: "L", type: "debt", balance: 5, currency: "EUR", isCash: false, isArchived: true, rap: { enabled: true } } as unknown as AccountDoc;
  assert.deepEqual(shapeAccount(full), { ...full, rap: { enabled: true, autoSchedule: true, recertDate: "07-01", dependents: 0 } });
  const tx = { ...base, amount: 1, date: "d", description: "x", accountId: "b".repeat(24), type: "debit" } as TransactionDoc;
  assert.deepEqual(shapeTransaction(tx), { ...tx, isRecurring: false, categoryTags: [], balanceApplied: true });
  assert.deepEqual(shapeTransaction({ ...tx, recurrenceRule: { frequency: "monthly", startDate: "s" } } as TransactionDoc).recurrenceRule, { frequency: "monthly", startDate: "s", interval: 1, endDate: null, daysOfMonth: [] });
  assert.equal(shapeTransaction({ ...tx, balanceApplied: false }).balanceApplied, false);
  assert.equal("recurrenceRule" in shapeTransaction(tx), false);
  assert.equal(shapeCategory({ ...base, name: "n", color: "#000000", icon: "i" } as CategoryDoc).isDefault, false);
});

test("profileFromDoc and profileToDoc convert dates, ids and labels", () => {
  assert.deepEqual(profileFromDoc(null), DEFAULT_PROFILE);
  assert.deepEqual(
    profileFromDoc({ ...base, salarySteps: [{ effectiveDate: "2026-01-01T00:00:00.000Z", annualGross: 1 }], whatIfSalaries: [{ label: "", annualGross: 2 }, { label: "A", annualGross: 3 }] } as ProfileDoc),
    { ...DEFAULT_PROFILE, salarySteps: [{ effectiveDate: "2026-01-01", annualGross: 1 }], whatIfSalaries: [{ annualGross: 2 }, { label: "A", annualGross: 3 }] },
  );
  assert.deepEqual(
    profileToDoc({ ...DEFAULT_PROFILE, salaryTransactionId: "", rentSteps: [{ effectiveDate: "2026-02-01", monthly: 5 }], whatIfSalaries: [{ label: "  x ", annualGross: 1 }, { annualGross: 2 }] }),
    { ...DEFAULT_PROFILE, salaryTransactionId: null, rentSteps: [{ effectiveDate: "2026-02-01T00:00:00.000Z", monthly: 5 }], whatIfSalaries: [{ label: "x", annualGross: 1 }, { annualGross: 2 }] },
  );
});

test("buildRule writes the schema defaults and full ISO dates, and no undefined keys", () => {
  assert.deepEqual(buildRule({ frequency: "monthly", startDate: "2026-11-01", endDate: "", dayOfMonth: 1 }), { frequency: "monthly", interval: 1, startDate: "2026-11-01T00:00:00.000Z", endDate: null, dayOfMonth: 1, daysOfMonth: [] });
  assert.deepEqual(buildRule({ frequency: "weekly", interval: 2, startDate: "2026-11-01", endDate: "2027-01-01", dayOfWeek: 3, daysOfMonth: [1, 15] }), { frequency: "weekly", interval: 2, startDate: "2026-11-01T00:00:00.000Z", endDate: "2027-01-01T00:00:00.000Z", dayOfWeek: 3, daysOfMonth: [1, 15] });
  assert.throws(() => buildRule({ frequency: "daily", startDate: "" }), /Invalid date/);
});

test("requiredText trims and refuses empty; assertId refuses anything but 24 lowercase hex", () => {
  assert.equal(requiredText("  a b ", "name"), "a b");
  assert.throws(() => requiredText("   ", "name"), /name is required/);
  assert.doesNotThrow(() => assertId("a".repeat(24)));
  for (const bad of ["abc", "", "A".repeat(24)]) assert.throws(() => assertId(bad), /Invalid id/);
});

test("saveUpdate writes only what save() would", () => {
  const RAP = { enabled: true, autoSchedule: true, recertDate: "07-01", dependents: 0 };
  const current = { amount: 100, recurrenceRule: { startDate: "a", endDate: null }, amountSchedule: [{ effectiveDate: "a", amount: 1 }], rap: RAP };
  // equal values (object keys in any order) and nothing missing: no write
  assert.equal(saveUpdate(current, {}, { amount: 100, amountSchedule: [{ amount: 1, effectiveDate: "a" }], "recurrenceRule.endDate": null, rap: { dependents: 0, recertDate: "07-01", autoSchedule: true, enabled: true } }), null);
  // only the changed values; array order is a difference
  assert.deepEqual(saveUpdate(current, {}, { amount: 200, "recurrenceRule.endDate": "b", "recurrenceRule.startDate": "a" }), { $set: { amount: 200, "recurrenceRule.endDate": "b" }, touch: true });
  assert.deepEqual(saveUpdate({ list: [1, 2] }, {}, { list: [2, 1] }), { $set: { list: [2, 1] }, touch: true });
  // only missing defaults: written, updatedAt must not move
  assert.deepEqual(saveUpdate(current, { balanceApplied: true, "recurrenceRule.interval": 1 }, { amount: 100 }), { $set: { balanceApplied: true, "recurrenceRule.interval": 1 }, touch: false });
  // a change plus defaults; a default under a key that is set as a whole is dropped
  const rap = { ...RAP, enabled: false };
  assert.deepEqual(saveUpdate({ rap: RAP }, { "rap.dependents": 0, isCash: false }, { rap }), { $set: { rap, isCash: false }, touch: true });
  // missing is not null
  assert.deepEqual(saveUpdate({}, {}, { paymentTransactionId: "x", note: null }), { $set: { paymentTransactionId: "x", note: null }, touch: true });
});

test("a legacy transaction saved with no change gets its defaults stored without moving updatedAt; null onto a missing endDate is not a change", async () => {
  const { store } = countingStore();
  const legacy = await transactions(store).insert({ amount: 100, date: "2026-11-01T00:00:00.000Z", description: "x", accountId: "b".repeat(24), type: "debit",
    recurrenceRule: { frequency: "monthly", startDate: "2026-11-01T00:00:00.000Z" } } as never);
  await new Promise((r) => setTimeout(r, 5));
  await saveTransaction(store, legacy, { amount: 100, "recurrenceRule.endDate": null });
  const { _id, createdAt, updatedAt, ...after } = (await transactions(store).findById(legacy._id))!;
  assert.deepEqual(after, { amount: 100, date: "2026-11-01T00:00:00.000Z", description: "x", accountId: "b".repeat(24), type: "debit", isRecurring: false, categoryTags: [], balanceApplied: true,
    recurrenceRule: { frequency: "monthly", startDate: "2026-11-01T00:00:00.000Z", interval: 1, daysOfMonth: [] } });
  assert.equal(updatedAt, legacy.updatedAt);
  await saveTransaction(store, { ...legacy, ...after } as TransactionDoc, { amount: 150 });
  assert.ok((await transactions(store).findById(legacy._id))!.updatedAt > legacy.updatedAt);
});

test("accountDefaults and transactionDefaults list only what the stored document lacks", () => {
  assert.deepEqual(accountDefaults({ name: "a", type: "bank" }), { balance: 0, currency: "USD", isCash: false, isArchived: false });
  assert.deepEqual(accountDefaults({ balance: 1, currency: "USD", isCash: false, isArchived: false, rap: { enabled: true } }), { "rap.autoSchedule": true, "rap.recertDate": "07-01", "rap.dependents": 0 });
  assert.deepEqual(transactionDefaults({ recurrenceRule: { frequency: "monthly", startDate: "s" } }), { isRecurring: false, categoryTags: [], balanceApplied: true, "recurrenceRule.interval": 1, "recurrenceRule.daysOfMonth": [] });
  assert.deepEqual(transactionDefaults({ isRecurring: true, categoryTags: ["a"], balanceApplied: false }), {});
});

test("ensureCashAccount inserts Cash once and never writes again", async () => {
  const { store, writes } = countingStore();
  await ensureCashAccount(store);
  await ensureCashAccount(store);
  const all = await accounts(store).find();
  assert.deepEqual(all.map(({ _id, createdAt, updatedAt, ...a }) => a), [{ name: "Cash", type: "bank", isCash: true, balance: 0, currency: "USD", isArchived: false }]);
  assert.equal(writes("accounts"), 1);
});

test("saveTransaction skips the write when nothing changed, and uses a dotted path for a nested change", async () => {
  const { store, writes } = countingStore();
  const tx = await transactions(store).insert({ amount: 100, date: "2026-11-01T00:00:00.000Z", description: "x", accountId: "b".repeat(24), type: "debit", isRecurring: true, categoryTags: [], balanceApplied: false,
    recurrenceRule: { frequency: "monthly", interval: 1, startDate: "2026-11-01T00:00:00.000Z", endDate: null, daysOfMonth: [] } });
  await saveTransaction(store, tx, { amount: 100 });
  assert.equal(writes("transactions"), 1);
  await saveTransaction(store, tx, { "recurrenceRule.endDate": "2027-01-01T00:00:00.000Z" });
  assert.equal(writes("transactions"), 2);
  assert.deepEqual((await transactions(store).findById(tx._id))!.recurrenceRule, { frequency: "monthly", interval: 1, startDate: "2026-11-01T00:00:00.000Z", endDate: "2027-01-01T00:00:00.000Z", daysOfMonth: [] });
});
