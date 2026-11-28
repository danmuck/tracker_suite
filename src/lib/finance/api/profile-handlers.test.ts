import { test } from "node:test";
import assert from "node:assert/strict";
import { amountOn } from "@/lib/finance/amount-schedule";
import type { FinanceProfileData } from "@/types/finance/datasheet";
import { accounts, profiles, transactions, type AccountDoc, type TransactionDoc } from "./docs";
import type { PaymentPlanDTO } from "./payment-plan";
import { setup } from "./test-helpers";
import { saveProfileAndApply } from "./profile";
import { BrowserStore } from "@/lib/data/browser-store";
import { ConflictError, type BaseDoc, type Collection, type CollectionName, type Store } from "@/lib/data/store";
import { memoryStorage } from "@/lib/data/test-helpers";
import { NOW } from "./test-helpers";

let t = setup();
const acct = async (body: object) => (await t.call("POST", "/api/accounts", body)).body as AccountDoc;
const tx = () => transactions(t.store);

let bank: AccountDoc;
test.beforeEach(async () => {
  t = setup();
  bank = await acct({ name: "Bank", type: "bank", balance: 1000 });
});
const body = (over: object = {}) => ({ amount: 10, date: "2026-11-10", description: "t", accountId: bank._id, type: "debit", ...over });
const post = async (over: object = {}) => (await t.call("POST", "/api/transactions", body(over))).body as TransactionDoc;
const recurring = (over: object) => post({ isRecurring: true, ...over });
type Saved = { data: FinanceProfileData; updated: { salary: boolean; rent: boolean } };
const saved = async (method: string, url: string, b: unknown) => {
  const res = await t.call(method, url, b);
  return { status: res.status, body: res.body as Saved };
};

const PROFILE = { filingStatus: "single", hoursPerWeek: 40, nycResident: false, raiseRate: 0.03, salarySteps: [{ effectiveDate: "2025-01-01", annualGross: 80000 }], retirementSteps: [], healthSteps: [], rentSteps: [], whatIfSalaries: [] };

test("no profile yet: the defaults, in dollars", async () => {
  assert.deepEqual(await t.call("GET", "/api/finance-profile"), { status: 200, body: { data: { filingStatus: "single", hoursPerWeek: 40, nycResident: false, raiseRate: 0.03, salaryTransactionId: null, rentTransactionId: null, salarySteps: [], retirementSteps: [], healthSteps: [], rentSteps: [], whatIfSalaries: [] } } });
});

test("validation and missing links leave nothing saved", async () => {
  const bad = await t.call("PUT", "/api/finance-profile", { ...PROFILE, salarySteps: [] });
  assert.deepEqual([bad.status, (bad.body as { error: string }).error, Object.keys((bad.body as { details: object }).details).sort()], [400, "Add at least one salary", ["fieldErrors", "formErrors"]]);
  assert.equal((await t.call("PUT", "/api/finance-profile", undefined)).status, 400);
  assert.deepEqual(await t.call("PUT", "/api/finance-profile", { ...PROFILE, salaryTransactionId: "a".repeat(24) }), { status: 409, body: { error: "Linked Salary transaction not found — pick one" } });
  assert.deepEqual(await t.call("PUT", "/api/finance-profile", { ...PROFILE, rentTransactionId: "a".repeat(24) }), { status: 409, body: { error: "Linked Rent transaction not found — pick one" } });
  assert.deepEqual(await t.call("PUT", "/api/finance-profile", { ...PROFILE, rentTransactionId: "abc" }), { status: 500, body: { error: "Failed to save profile" } });
  assert.equal(await profiles(t.store).count(), 0);
});

test("saving writes the rent schedule, moves the rent start, and keeps one profile document", async () => {
  const rent = await recurring({ amount: 1500, date: "2026-09-01", description: "Rent", recurrenceRule: { frequency: "monthly", startDate: "2026-09-01", dayOfMonth: 1 } });
  const body = { ...PROFILE, rentTransactionId: rent._id, rentSteps: [{ effectiveDate: "2027-01-01", monthly: 1600 }, { effectiveDate: "2026-08-01", monthly: 1500 }], whatIfSalaries: [{ label: " Stretch ", annualGross: 120000 }] };
  const res = await t.call("PUT", "/api/finance-profile", body);
  assert.deepEqual([res.status, (res.body as { updated: object }).updated], [200, { salary: false, rent: true }]);
  assert.deepEqual((res.body as { data: FinanceProfileData }).data, { ...body, salaryTransactionId: null, whatIfSalaries: [{ label: "Stretch", annualGross: 120000 }] });
  const stored = (await tx().findById(rent._id))!;
  assert.deepEqual(stored.amountSchedule, [{ effectiveDate: "2026-08-01T00:00:00.000Z", amount: 150000 }, { effectiveDate: "2027-01-01T00:00:00.000Z", amount: 160000 }]);
  assert.deepEqual([stored.amount, stored.date, stored.recurrenceRule], [150000, "2026-08-01T00:00:00.000Z", { frequency: "monthly", interval: 1, startDate: "2026-08-01T00:00:00.000Z", endDate: null, dayOfMonth: 1, daysOfMonth: [] }]);
  await t.call("PUT", "/api/finance-profile", body);
  assert.equal(await profiles(t.store).count(), 1);
  assert.equal((await profiles(t.store).findOne({}))!.rentSteps[0].effectiveDate, "2027-01-01T00:00:00.000Z");
});

test("a second identical save writes nothing to transactions; unlinking clears the schedule and keeps the amount", async () => {
  const salary = await recurring({ amount: 2000, type: "credit", date: "2026-10-02", description: "Salary", recurrenceRule: { frequency: "biweekly", startDate: "2026-10-02" } });
  const body = { ...PROFILE, salaryTransactionId: salary._id };
  const first = await t.call("PUT", "/api/finance-profile", body);
  assert.deepEqual((first.body as { updated: object }).updated, { salary: true, rent: false });
  const stored = (await tx().findById(salary._id))!;
  assert.ok(stored.amountSchedule!.length >= 1 && stored.amountSchedule!.every((s) => s.effectiveDate.endsWith("T00:00:00.000Z") && Number.isInteger(s.amount) && s.amount > 0));
  assert.equal(stored.amount, amountOn(stored.amountSchedule![0].amount, stored.amountSchedule, "2026-11-17"));
  const writes = t.writes("transactions");
  await t.call("PUT", "/api/finance-profile", body);
  assert.equal(t.writes("transactions"), writes);
  await t.call("PUT", "/api/finance-profile", { ...PROFILE, salaryTransactionId: null });
  const cleared = (await tx().findById(salary._id))!;
  assert.deepEqual(["amountSchedule" in cleared, cleared.amount], [false, stored.amount]);
});

test("merge-rent folds the second rent in as a dated step, extends the first, and deletes the second", async () => {
  const keep = await recurring({ amount: 1500, date: "2026-09-01", description: "Rent", recurrenceRule: { frequency: "monthly", startDate: "2026-09-01", dayOfMonth: 1 } });
  const merge = await recurring({ amount: 1650, date: "2027-01-01", description: "Rent 2", recurrenceRule: { frequency: "monthly", startDate: "2027-01-01", endDate: "2027-12-01", dayOfMonth: 1 } });
  const res = await t.call("POST", "/api/finance-profile/merge-rent", { keepId: keep._id, mergeId: merge._id });
  assert.deepEqual([res.status, (res.body as { updated: object }).updated], [200, { salary: false, rent: true }]);
  const data = (res.body as { data: FinanceProfileData }).data;
  assert.deepEqual([data.rentTransactionId, data.rentSteps], [keep._id, [{ effectiveDate: "2026-09-01", monthly: 1500 }, { effectiveDate: "2027-01-01", monthly: 1650 }]]);
  assert.equal(await tx().findById(merge._id), null);
  const stored = (await tx().findById(keep._id))!;
  assert.deepEqual([stored.recurrenceRule!.endDate, stored.amountSchedule!.map((s) => s.amount)], ["2027-12-01T00:00:00.000Z", [150000, 165000]]);
});

test("merge-rent errors", async () => {
  const keep = await recurring({ recurrenceRule: { frequency: "monthly", startDate: "2026-09-01" } });
  const once = await post({ date: "2026-11-02" });
  const same = { status: 400, body: { error: "keepId and mergeId must be two different transactions" } };
  assert.deepEqual(await t.call("POST", "/api/finance-profile/merge-rent", { keepId: keep._id, mergeId: keep._id }), same);
  assert.deepEqual(await t.call("POST", "/api/finance-profile/merge-rent", undefined), same);
  for (const mergeId of ["a".repeat(24), once._id]) {
    assert.deepEqual(await t.call("POST", "/api/finance-profile/merge-rent", { keepId: keep._id, mergeId }), { status: 404, body: { error: "Both transactions must exist and be recurring" } });
  }
  assert.deepEqual(await t.call("POST", "/api/finance-profile/merge-rent", { keepId: keep._id, mergeId: "abc" }), { status: 500, body: { error: "Failed to merge rent" } });
});

// ── Golden steps and further cases beyond the brief ──

test("golden X11–X13: a schema failure is the 400; malformed ids in the body are the routes' 500s", async () => {
  const rent = await recurring({ recurrenceRule: { frequency: "monthly", startDate: "2026-09-01", dayOfMonth: 1 } });
  assert.deepEqual(await t.call("POST", "/api/finance-profile/merge-rent", { keepId: rent._id }), { status: 400, body: { error: "keepId and mergeId must be two different transactions" } });
  assert.deepEqual(await t.call("POST", "/api/finance-profile/merge-rent", { keepId: "abc", mergeId: rent._id }), { status: 500, body: { error: "Failed to merge rent" } });
  assert.deepEqual(await t.call("PUT", "/api/finance-profile", { ...PROFILE, salaryTransactionId: "abc" }), { status: 500, body: { error: "Failed to save profile" } });
  assert.equal(await profiles(t.store).count(), 0);
});

test("golden F05–F08: an identical save leaves both linked transactions' updatedAt unmoved", async () => {
  const salary = await recurring({ amount: 2000, type: "credit", date: "2026-10-02", description: "Salary", recurrenceRule: { frequency: "biweekly", startDate: "2026-10-02" } });
  const rent = await recurring({ amount: 1500, date: "2026-09-01", description: "Rent", recurrenceRule: { frequency: "monthly", startDate: "2026-09-01", dayOfMonth: 1 } });
  const body = { ...PROFILE, salaryTransactionId: salary._id, rentTransactionId: rent._id, rentSteps: [{ effectiveDate: "2026-09-01", monthly: 1450 }, { effectiveDate: "2027-01-01", monthly: 1525 }] };
  assert.deepEqual((await saved("PUT", "/api/finance-profile", body)).body.updated, { salary: true, rent: true });
  const before = [(await tx().findById(salary._id))!, (await tx().findById(rent._id))!];
  const writes = t.writes("transactions");
  assert.deepEqual((await saved("PUT", "/api/finance-profile", body)).body.updated, { salary: true, rent: true });
  assert.equal(t.writes("transactions"), writes);
  assert.deepEqual([(await tx().findById(salary._id))!, (await tx().findById(rent._id))!], before);
});

test("golden F17–F19: unlinking clears the old schedule with one touching write; a link with no steps clears and reports false", async () => {
  const rent = await recurring({ amount: 1500, date: "2026-09-01", description: "Rent", recurrenceRule: { frequency: "monthly", startDate: "2026-09-01", dayOfMonth: 1 } });
  const body = { ...PROFILE, rentTransactionId: rent._id, rentSteps: [{ effectiveDate: "2026-09-01", monthly: 1450 }] };
  await t.call("PUT", "/api/finance-profile", body);
  const linked = (await tx().findById(rent._id))!;
  let writes = t.writes("transactions");
  const unlinked = await saved("PUT", "/api/finance-profile", { ...body, rentTransactionId: null });
  assert.deepEqual([unlinked.status, unlinked.body.updated, unlinked.body.data.rentTransactionId], [200, { salary: false, rent: false }, null]);
  assert.equal(t.writes("transactions"), writes + 1);
  const cleared = (await tx().findById(rent._id))!;
  assert.deepEqual(["amountSchedule" in cleared, cleared.amount, cleared.updatedAt >= linked.updatedAt], [false, 145000, true]);
  writes = t.writes("transactions");
  const relinked = await saved("PUT", "/api/finance-profile", { ...body, rentSteps: [] });
  assert.deepEqual([relinked.status, relinked.body.updated, relinked.body.data.rentTransactionId], [200, { salary: false, rent: false }, rent._id]);
  // An $unset of an absent schedule is still a (timestamped) write, as updateOne is today
  assert.equal(t.writes("transactions"), writes + 1);
  assert.equal("amountSchedule" in (await tx().findById(rent._id))!, false);
});

test("merge-rent with saved rent steps appends the merged start only when its date is new", async () => {
  const keep = await recurring({ amount: 1500, date: "2026-09-01", description: "Rent", recurrenceRule: { frequency: "monthly", startDate: "2026-09-01", dayOfMonth: 1 } });
  await t.call("PUT", "/api/finance-profile", { ...PROFILE, rentTransactionId: keep._id, rentSteps: [{ effectiveDate: "2026-09-01", monthly: 1450 }, { effectiveDate: "2027-01-01", monthly: 1525 }] });
  const second = await recurring({ amount: 1650, date: "2027-03-01", description: "Rent 2", recurrenceRule: { frequency: "monthly", startDate: "2027-03-01", endDate: "2028-03-01", dayOfMonth: 1 } });
  const res = await saved("POST", "/api/finance-profile/merge-rent", { keepId: keep._id, mergeId: second._id });
  assert.deepEqual(res.body.data.rentSteps, [{ effectiveDate: "2026-09-01", monthly: 1450 }, { effectiveDate: "2027-01-01", monthly: 1525 }, { effectiveDate: "2027-03-01", monthly: 1650 }]);
  const third = await recurring({ amount: 1999, date: "2027-01-01", description: "Rent 3", recurrenceRule: { frequency: "monthly", startDate: "2027-01-01", dayOfMonth: 1 } });
  const again = await saved("POST", "/api/finance-profile/merge-rent", { keepId: keep._id, mergeId: third._id });
  assert.deepEqual(again.body.data.rentSteps, res.body.data.rentSteps);
  // The kept rule's endDate is the merged one's: none here, so null
  const stored = (await tx().findById(keep._id))!;
  assert.deepEqual([stored.recurrenceRule!.endDate, stored.amountSchedule!.map((s) => s.amount), await tx().findById(third._id)], [null, [145000, 152500, 165000], null]);
});

test("merge-rent checks the profile's links before writing anything (bug 13)", async () => {
  const keep = await recurring({ amount: 1500, date: "2026-09-01", description: "Rent", recurrenceRule: { frequency: "monthly", startDate: "2026-09-01", endDate: "2028-03-01", dayOfMonth: 1 } });
  const merge = await recurring({ amount: 1555, date: "2027-01-03", description: "Rent (sublet)", recurrenceRule: { frequency: "monthly", startDate: "2027-01-03", dayOfMonth: 3 } });
  // A Salary link to a transaction deleted before bug 7 was fixed (no request can leave one now)
  await profiles(t.store).updateOne({}, { $set: { salaryTransactionId: "a".repeat(24) } }, { upsert: true });
  const before = [await tx().find(), await accounts(t.store).find(), await profiles(t.store).find()];
  const writes = [t.writes("transactions"), t.writes("accounts"), t.writes("financeProfile")];
  const res = await t.call("POST", "/api/finance-profile/merge-rent", { keepId: keep._id, mergeId: merge._id });
  assert.deepEqual(res, { status: 409, body: { error: "Linked Salary transaction not found — pick one" } });
  assert.deepEqual([await tx().find(), await accounts(t.store).find(), await profiles(t.store).find()], before);
  assert.deepEqual([t.writes("transactions"), t.writes("accounts"), t.writes("financeProfile")], writes);
});

test("merge-rent keeps the merged schedule in date order and moves a Rent link to the merged id onto the kept one (bug 13)", async () => {
  const keep = await recurring({ amount: 1500, date: "2026-09-01", description: "Rent", recurrenceRule: { frequency: "monthly", startDate: "2026-09-01", dayOfMonth: 1 } });
  const merge = await recurring({ amount: 1650, date: "2027-01-01", description: "Rent 2", recurrenceRule: { frequency: "monthly", startDate: "2027-01-01", dayOfMonth: 1 } });
  // The Datasheet's Rent link is the merged one; its steps are saved out of date order
  // (written to the store: a profile save would move the merged rule's start to the first step)
  await profiles(t.store).updateOne({}, { $set: { rentTransactionId: merge._id, rentSteps: [{ effectiveDate: "2027-06-01T00:00:00.000Z", monthly: 152500 }, { effectiveDate: "2026-09-01T00:00:00.000Z", monthly: 145000 }] } }, { upsert: true });
  // The merged one's own schedule: an entry before its start (its start amount), one on a date the
  // kept steps already have (the kept one wins), and two new ones
  await tx().updateById(merge._id, { $set: { amountSchedule: [
    { effectiveDate: "2026-10-01T00:00:00.000Z", amount: 160000 },
    { effectiveDate: "2027-06-01T00:00:00.000Z", amount: 170000 },
    { effectiveDate: "2028-01-01T00:00:00.000Z", amount: 180000 },
    { effectiveDate: "2027-03-01T00:00:00.000Z", amount: 168000 },
  ] } });
  const other = await acct({ name: "Other", type: "debt", balance: 500 });
  await accounts(t.store).updateById(other._id, { $set: { paymentTransactionId: "c".repeat(24) } });

  const res = await saved("POST", "/api/finance-profile/merge-rent", { keepId: keep._id, mergeId: merge._id });
  assert.equal(res.status, 200);
  const steps = [
    { effectiveDate: "2026-09-01", monthly: 1450 },
    { effectiveDate: "2027-01-01", monthly: 1600 },
    { effectiveDate: "2027-03-01", monthly: 1680 },
    { effectiveDate: "2027-06-01", monthly: 1525 },
    { effectiveDate: "2028-01-01", monthly: 1800 },
  ];
  assert.deepEqual(res.body.data.rentSteps, steps);
  assert.deepEqual((await t.call("GET", "/api/finance-profile")).body, { data: res.body.data });
  assert.deepEqual([res.body.data.rentTransactionId, res.body.data.salaryTransactionId], [keep._id, null]);
  assert.equal(await tx().findById(merge._id), null);
  assert.equal((await accounts(t.store).findById(other._id))!.paymentTransactionId, "c".repeat(24));
  assert.deepEqual((await tx().findById(keep._id))!.amountSchedule!.map((s) => [s.effectiveDate.slice(0, 10), s.amount]), [["2026-09-01", 145000], ["2027-01-01", 160000], ["2027-03-01", 168000], ["2027-06-01", 152500], ["2028-01-01", 180000]]);
});

test("merge-rent refuses a Salary-linked or loan-payment transaction on either side, before any write", async () => {
  const salary = await recurring({ amount: 2000, type: "credit", date: "2026-10-02", description: "Salary", recurrenceRule: { frequency: "biweekly", startDate: "2026-10-02" } });
  const rent = await recurring({ amount: 1500, date: "2026-09-01", description: "Rent", recurrenceRule: { frequency: "monthly", startDate: "2026-09-01", dayOfMonth: 1 } });
  await t.call("PUT", "/api/finance-profile", { ...PROFILE, salaryTransactionId: salary._id, rentTransactionId: rent._id });
  const loan = await acct({ name: "Loan", type: "debt", balance: 500 });
  const plan = await t.call("POST", `/api/accounts/${loan._id}/payment-plan`, { fromAccountId: bank._id, dayOfMonth: 15, startDate: "2026-12-15", firstAmount: 50 });
  const pay = (plan.body as { data: PaymentPlanDTO }).data.payment!.transactionId;
  const snapshot = async () => [await tx().find(), await accounts(t.store).find(), await profiles(t.store).find()];
  const before = await snapshot();
  const writes = [t.writes("transactions"), t.writes("accounts"), t.writes("financeProfile")];
  const SALARY = { status: 400, body: { error: "That transaction is linked as Salary" } };
  const PAYMENT = { status: 400, body: { error: "That transaction is a loan payment" } };
  for (const [keepId, mergeId, expected] of [[rent._id, salary._id, SALARY], [rent._id, pay, PAYMENT], [salary._id, rent._id, SALARY], [pay, rent._id, PAYMENT]] as const) {
    assert.deepEqual(await t.call("POST", "/api/finance-profile/merge-rent", { keepId, mergeId }), expected);
  }
  assert.deepEqual(await snapshot(), before);
  assert.deepEqual([t.writes("transactions"), t.writes("accounts"), t.writes("financeProfile")], writes);
});

test("current behavior: merge-rent accepts any two recurring transactions and a rule-less keep is not extended", async () => {
  const keep = await post({ isRecurring: true, description: "No rule" });
  const merge = await recurring({ amount: 1650, date: "2027-01-01", description: "Rent 2", recurrenceRule: { frequency: "monthly", startDate: "2027-01-01", endDate: "2027-12-01", dayOfMonth: 1 } });
  const res = await saved("POST", "/api/finance-profile/merge-rent", { keepId: keep._id, mergeId: merge._id });
  assert.deepEqual([res.status, res.body.updated, res.body.data.rentSteps], [200, { salary: false, rent: true }, [{ effectiveDate: "2027-01-01", monthly: 1650 }]]);
  const stored = (await tx().findById(keep._id))!;
  // No rule: the schedule is written but neither the start nor the end date moves
  assert.deepEqual([stored.recurrenceRule, stored.date, stored.amountSchedule, stored.amount], [undefined, "2026-11-10T00:00:00.000Z", [{ effectiveDate: "2027-01-01T00:00:00.000Z", amount: 165000 }], 165000]);
});

test("saving the profile reprices automatic RAP payment schedules from the new salary", async () => {
  const loan = await acct({ name: "Loan", type: "debt", balance: 30000 });
  const salary = await recurring({ amount: 2000, type: "credit", date: "2025-01-03", description: "Salary", recurrenceRule: { frequency: "biweekly", startDate: "2025-01-03", dayOfWeek: 5 } });
  await t.call("PUT", "/api/finance-profile", { ...PROFILE, salaryTransactionId: salary._id, salarySteps: [{ effectiveDate: "2025-01-01", annualGross: 60000 }] });
  const plan = `/api/accounts/${loan._id}/payment-plan`;
  await t.call("POST", plan, { fromAccountId: bank._id, dayOfMonth: 15, startDate: "2026-12-15", firstAmount: 50 });
  const rapAmounts = async () => ((await t.call("GET", plan)).body as { data: PaymentPlanDTO }).data.schedule.filter((e) => e.source === "rap").map((e) => e.amount);
  await t.call("PUT", plan, { rap: { enabled: true, autoSchedule: true, recertDate: "07-01", dependents: 0 } });
  const before = await rapAmounts();
  assert.ok(before.length > 0);
  await t.call("PUT", "/api/finance-profile", { ...PROFILE, salaryTransactionId: salary._id, salarySteps: [{ effectiveDate: "2025-01-01", annualGross: 90000 }] });
  const after = await rapAmounts();
  assert.equal(after.length, before.length);
  assert.ok(after[0] > before[0]);
});

/** A store whose profile `updateOne` throws `errors` in turn (then behaves normally); `calls()` counts the attempts. */
function failingUpserts(errors: Error[]): { store: Store; real: Store; calls: () => number } {
  const real = new BrowserStore(memoryStorage());
  let n = 0;
  const store: Store = {
    collection<T extends BaseDoc>(name: CollectionName): Collection<T> {
      const c = real.collection<T>(name);
      if (name !== "financeProfile") return c;
      const wrapped: Collection<T> = Object.create(c);
      wrapped.updateOne = (filter, update, options) => {
        const err = errors[n++];
        return err ? Promise.reject(err) : c.updateOne(filter, update, options);
      };
      return wrapped;
    },
  };
  return { store, real, calls: () => n };
}
const DATA = { filingStatus: "single", hoursPerWeek: 40, nycResident: false, raiseRate: 0.03, salaryTransactionId: null, rentTransactionId: null, salarySteps: [{ effectiveDate: "2025-01-01", annualGross: 80000 }], retirementSteps: [], healthSteps: [], rentSteps: [], whatIfSalaries: [] } as FinanceProfileData;

test("saving the profile retries the upsert once when another request just created it", async () => {
  const { store, real, calls } = failingUpserts([new ConflictError("financeProfile", "ownerId")]);
  await saveProfileAndApply(store, DATA, NOW);
  assert.equal(calls(), 2);
  assert.equal(await profiles(real).count(), 1);
});

test("saving the profile gives up after one retry, and other errors are not retried", async () => {
  const twice = failingUpserts([new ConflictError("financeProfile", "ownerId"), new ConflictError("financeProfile", "ownerId")]);
  await assert.rejects(saveProfileAndApply(twice.store, DATA, NOW), ConflictError);
  assert.equal(twice.calls(), 2);
  const other = failingUpserts([new Error("disk full")]);
  await assert.rejects(saveProfileAndApply(other.store, DATA, NOW), /disk full/);
  assert.equal(other.calls(), 1);
});
