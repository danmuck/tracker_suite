import { test } from "node:test";
import assert from "node:assert/strict";
import { dispatch } from "@/lib/data/dispatch";
import { accounts, transactions, type AccountDoc } from "./docs";
import { financeRoutes } from "./routes";
import { interleavingStore, NOW, setup } from "./test-helpers";

let t = setup();
test.beforeEach(() => { t = setup(); });
const tx = () => transactions(t.store);
const balances = async () => Object.fromEntries((await accounts(t.store).find({ isCash: { $ne: true } })).map((a) => [a.name, a.balance]));

// A $50 plan on the 15th from Bank to a card owing 0, plus an unapplied $30 charge on the card
// dated 10 Nov (before today's 15 Nov due date). Today is 17 Nov.
async function cardWithPendingCharge() {
  const acct = async (body: object) => (await t.call("POST", "/api/accounts", body)).body as AccountDoc;
  const bank = await acct({ name: "Bank", type: "bank", balance: 1000 });
  const card = await acct({ name: "Card", type: "credit_card", balance: 0 });
  const pay = await tx().insert({ amount: 5000, date: "2026-11-15T00:00:00.000Z", description: "p", accountId: bank._id, toAccountId: card._id, type: "transfer", isRecurring: true,
    recurrenceRule: { frequency: "monthly", interval: 1, startDate: "2026-11-15T00:00:00.000Z", endDate: null, dayOfMonth: 15, daysOfMonth: [] }, categoryTags: [], balanceApplied: false });
  await accounts(t.store).updateById(card._id, { $set: { paymentTransactionId: pay._id } });
  const charge = await tx().insert({ amount: 3000, date: "2026-11-10T00:00:00.000Z", description: "charge", accountId: card._id, type: "debit", isRecurring: false, categoryTags: [], balanceApplied: false });
  return { card, pay, charge };
}

const routes: [string, (cardId: string) => [string, string]][] = [
  ["GET /api/accounts (reference)", () => ["GET", "/api/accounts"]],
  ["GET /api/accounts/:id", (id) => ["GET", `/api/accounts/${id}`]],
  ["GET /api/accounts/:id/payment-plan", (id) => ["GET", `/api/accounts/${id}/payment-plan`]],
  ["GET /api/projections", () => ["GET", "/api/projections?startDate=2026-11-17&endDate=2026-12-31"]],
  ["GET /api/summary", () => ["GET", "/api/summary?view=monthly"]],
];

for (const [name, request] of routes) {
  test(`${name}: pending charges are applied before due payments are posted`, async () => {
    const { card, pay, charge } = await cardWithPendingCharge();
    const [method, url] = request(card._id);
    assert.equal((await t.call(method, url)).status, 200);
    // The charge is applied (card 0 + 30), then the 15 Nov payment pays min(50, 30)
    assert.equal((await tx().findById(charge._id))!.balanceApplied, true);
    assert.deepEqual(await balances(), { Bank: 97000, Card: 0 });
    assert.equal((await tx().findById(pay._id))!.postedThrough, "2026-11-15T00:00:00.000Z");
  });
}

test("two interleaved catch-ups from different routes apply the charge once and post the due date once", async () => {
  const { card, pay, charge } = await cardWithPendingCharge();
  const racing = interleavingStore(t.store);
  const results = await Promise.all([
    dispatch(financeRoutes, racing, "GET", `/api/accounts/${card._id}`, undefined, NOW),
    dispatch(financeRoutes, racing, "GET", "/api/summary?view=monthly", undefined, NOW),
  ]);
  assert.deepEqual(results.map((r) => r.status), [200, 200]);
  assert.equal((await tx().findById(charge._id))!.balanceApplied, true);
  assert.equal((await tx().findById(pay._id))!.postedThrough, "2026-11-15T00:00:00.000Z");
  // The charge moved the card once (+30) and the payment moved both sides by the same amount, once.
  // Known window: the request that lost the charge's claim can post before the winner has applied it,
  // so the 15 Nov payment may be 0 (the charge then waits for 15 Dec) instead of 30.
  const { Bank, Card } = await balances();
  const paid = 100000 - Bank;
  assert.ok(paid === 0 || paid === 3000, `paid ${paid}`);
  assert.equal(Card, 3000 - paid);
});

test("sequential catch-ups from different routes: the first applies and posts, the second writes nothing", async () => {
  const { card } = await cardWithPendingCharge();
  assert.equal((await t.call("GET", `/api/accounts/${card._id}`)).status, 200);
  const before = { accounts: t.writes("accounts"), transactions: t.writes("transactions") };
  assert.equal((await t.call("GET", "/api/summary?view=monthly")).status, 200);
  assert.deepEqual({ accounts: t.writes("accounts"), transactions: t.writes("transactions") }, before);
  assert.deepEqual(await balances(), { Bank: 97000, Card: 0 });
});
