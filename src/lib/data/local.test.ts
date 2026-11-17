import { test } from "node:test";
import assert from "node:assert/strict";
import { BrowserStore } from "./browser-store";
import { dispatch } from "./dispatch";
import { allRoutes } from "./all-routes";
import { dispatchFresh } from "./local";
import type { BaseDoc } from "./store";
import { memoryStorage } from "./test-helpers";

type Row = BaseDoc & Record<string, unknown>;

// Two tabs: two stores over one storage, each with its own cached copy.
function twoTabs() {
  const storage = memoryStorage();
  // `stored()` is a third reader with nothing cached: what storage holds now.
  return { a: new BrowserStore(storage), b: new BrowserStore(storage), stored: () => new BrowserStore(storage) };
}

const cashIds = async (store: BrowserStore) =>
  (await store.collection<Row>("accounts").find({ isCash: true })).map((d) => d._id);

test("a tab whose cached accounts predate another tab's Cash finds that Cash instead of adding its own", async () => {
  const { a, b, stored } = twoTabs();
  assert.deepEqual(await cashIds(b), []); // tab B has read (and cached) an empty accounts collection
  assert.equal((await dispatchFresh(a, "GET", "/api/accounts")).status, 200);
  const [cash] = await cashIds(a);
  assert.equal((await dispatchFresh(b, "GET", "/api/accounts")).status, 200);
  assert.deepEqual(await cashIds(stored()), [cash]);
});

test("without the refresh the stale tab adds a second Cash over the first (what dispatchFresh prevents)", async () => {
  const { a, b } = twoTabs();
  await cashIds(b);
  await dispatchFresh(a, "GET", "/api/accounts");
  const [cash] = await cashIds(a);
  await dispatch(allRoutes, b, "GET", "/api/accounts");
  const [stored] = await cashIds(b);
  assert.notEqual(stored, cash);
});

test("a pending transaction and a due plan payment are applied once across two tabs", async () => {
  const { a, b, stored } = twoTabs();
  await dispatchFresh(a, "GET", "/api/accounts");
  const acc = a.collection<Row>("accounts");
  const txs = a.collection<Row>("transactions");
  const bank = await acc.insert({ name: "Bank", type: "bank", balance: 100000, currency: "USD", isCash: false, isArchived: false });
  const card = await acc.insert({ name: "Card", type: "credit_card", balance: 12000, currency: "USD", isCash: false, isArchived: false });
  await txs.insert({ amount: 2500, date: "2020-01-01T00:00:00.000Z", description: "p", accountId: bank._id, type: "debit", isRecurring: false, categoryTags: [], balanceApplied: false });
  const pay = await txs.insert({ amount: 5000, date: "2020-01-15T00:00:00.000Z", description: "plan", accountId: bank._id, toAccountId: card._id, type: "transfer", isRecurring: true,
    recurrenceRule: { frequency: "monthly", interval: 1, startDate: "2020-01-15T00:00:00.000Z", endDate: null, dayOfMonth: 15, daysOfMonth: [] }, categoryTags: [], balanceApplied: false });
  await acc.updateById(card._id, { $set: { paymentTransactionId: pay._id } });
  // Tab B caches the transactions as they are now (payment unposted, transaction pending) but not
  // the accounts, as when a storage event has dropped only that collection
  await b.collection<Row>("transactions").find();

  await dispatchFresh(a, "GET", "/api/accounts");
  await dispatchFresh(b, "GET", "/api/accounts");

  const fresh = stored();
  const balances = Object.fromEntries((await fresh.collection<Row>("accounts").find({ isCash: false })).map((d) => [d.name, d.balance]));
  // Bank: 1000 - 25 - (50 + 50 + 20); Card: 120 - 120
  assert.deepEqual(balances, { Bank: 85500, Card: 0 });
  assert.equal(await fresh.collection<Row>("transactions").count({ balanceApplied: false, isRecurring: false }), 0);
});

