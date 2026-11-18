import { test } from "node:test";
import assert from "node:assert/strict";
import type { ProjectionResult } from "@/types/finance/projection";
import type { SummaryResult } from "@/types/finance/summary";
import { transactions, type AccountDoc, type TransactionDoc } from "./docs";
import { setup } from "./test-helpers";

let t = setup();
const acct = async (body: object) => (await t.call("POST", "/api/accounts", body)).body as AccountDoc;

let bank: AccountDoc, savings: AccountDoc;
test.beforeEach(async () => {
  t = setup();
  bank = await acct({ name: "Bank", type: "bank", balance: 1000 });
  savings = await acct({ name: "Savings", type: "bank", balance: 0 });
});
const body = (over: object = {}) => ({ amount: 10, date: "2026-11-10", description: "t", accountId: bank._id, type: "debit", ...over });
const post = async (over: object = {}) => (await t.call("POST", "/api/transactions", body(over))).body as TransactionDoc;

const proj = async (qs: string) => (await t.call("GET", `/api/projections${qs}`)).body as { data: ProjectionResult; dataVersion: string };
const NOV = "?startDate=2026-11-01&endDate=2026-11-30";
const on = (r: { data: ProjectionResult }, date: string) => r.data.timeline.find((d) => d.date === date)!.transactions.map((x) => [x.description, x.amount, x.isProjected]);

test("projection: past transactions shown, recurring ones projected, balances carried forward", async () => {
  await post({ amount: 100, description: "shoes", categoryTags: ["spending"] });                                           // 10 Nov, applied
  await post({ amount: 500, type: "credit", description: "pay", isRecurring: true, recurrenceRule: { frequency: "monthly", startDate: "2026-11-20", dayOfMonth: 20 } });
  await post({ amount: 7, description: "ended", isRecurring: true, recurrenceRule: { frequency: "daily", startDate: "2026-01-01", endDate: "2026-10-31" } });
  const r = await proj(NOV);
  assert.equal(r.data.timeline.length, 30);
  assert.deepEqual(on(r, "2026-11-10"), [["shoes", 10000, false]]);
  assert.deepEqual(on(r, "2026-11-20"), [["pay", 50000, true]]);
  assert.equal(r.data.timeline.flatMap((d) => d.transactions).some((x) => x.description === "ended"), false);
  assert.equal(r.data.summary.endBalances[bank._id], 140000);
  assert.equal((await proj(`${NOV}&granularity=monthly`)).data.timeline.length, 1);
});

test("the account filter includes transfers into the account", async () => {
  await post({ amount: 50, type: "transfer", toAccountId: savings._id, description: "move" });
  await post({ amount: 9, description: "other" });
  const r = await proj(`${NOV}&accountId=${savings._id}`);
  assert.deepEqual(r.data.timeline.flatMap((d) => d.transactions).map((x) => x.description), ["move"]);
});

test("dataVersion is stable while nothing changes and moves when data does", async () => {
  const a = (await proj(NOV)).dataVersion;
  assert.match(a, /^0\|0\|0\|[0-9a-f]{24}:\d+:\d+(,[0-9a-f]{24}:-?\d+:\d+)*$/);
  assert.equal((await proj(NOV)).dataVersion, a);
  await post();
  const b = (await proj(NOV)).dataVersion;
  assert.ok(b !== a && b.startsWith("1|"));
});

test("projection errors", async () => {
  assert.deepEqual(await t.call("GET", "/api/projections?startDate=2026-11-01"), { status: 400, body: { error: "startDate and endDate are required" } });
  assert.deepEqual(await t.call("GET", "/api/projections?startDate=1900-01-01&endDate=2100-01-01"), { status: 400, body: { error: "Projection window exceeds 36600 days" } });
  assert.deepEqual(await t.call("GET", `/api/projections${NOV}&accountId=abc`), { status: 500, body: { error: "Failed to generate projections" } });
  assert.deepEqual(await t.call("GET", "/api/projections?startDate=1garbage&endDate=2026-12-31"), { status: 500, body: { error: "Failed to generate projections" } });
  assert.deepEqual(await t.call("GET", "/api/projections?startDate=garbage&endDate=2026-12-31"), { status: 400, body: { error: "Invalid time value" } });
  const bad = await t.call("POST", "/api/projections", {});
  assert.deepEqual([bad.status, (bad.body as { error: string }).error, Array.isArray((bad.body as { details: unknown }).details)], [400, "Invalid projection request", true]);
  assert.equal((await t.call("POST", "/api/projections", undefined)).status, 400);
});

test("a sandbox projection applies what-if changes and saves nothing", async () => {
  const real = await post({ amount: 100, description: "shoes" });
  const writes = [t.writes("accounts"), t.writes("transactions")];
  const res = await t.call("POST", "/api/projections", { startDate: "2026-11-01", endDate: "2026-11-30", sandbox: {
    added: [{ id: "s1", data: { amount: 42, date: "2026-11-25", description: "what-if", accountId: bank._id, type: "debit" } }], removed: [real._id] } });
  assert.equal(res.status, 200);
  const all = (res.body as { data: ProjectionResult }).data.timeline.flatMap((d) => d.transactions).map((x) => [x.description, x.amount]);
  assert.deepEqual(all, [["what-if", 4200]]);
  assert.deepEqual([t.writes("accounts"), t.writes("transactions")], writes);
});

// Golden X08: the engine's window guard through the sandbox path
test("a sandbox projection over too long a window is the engine's RangeError (400)", async () => {
  assert.deepEqual(await t.call("POST", "/api/projections", { startDate: "1900-01-01", endDate: "2100-01-01", sandbox: {} }), {
    status: 400,
    body: { error: "Projection window exceeds 36600 days" },
  });
});

test("a window starting after today also selects what falls between today and its start", async () => {
  await post({ amount: 5, date: "2026-11-16", description: "past" });       // applied, before today: not selected
  await post({ amount: 100, date: "2026-11-25", description: "pending" });  // future: not applied, carried into December
  const r = await proj("?startDate=2026-12-01&endDate=2026-12-31");
  assert.equal(r.data.timeline.flatMap((d) => d.transactions).length, 0);
  assert.equal(r.data.summary.endBalances[bank._id], 89500);
});

const summary = async (qs: string) => (await t.call("GET", `/api/summary${qs}`)).body as { data: SummaryResult };

test("summary: periods, days or months, totals and category breakdown", async () => {
  await post({ amount: 100, description: "shoes", categoryTags: ["spending"] });
  const month = (await summary("?view=monthly&date=2026-11-17")).data;
  assert.deepEqual([month.view, month.period, month.days!.length, month.months], ["monthly", { start: "2026-11-01", end: "2026-11-30", label: "November 2026" }, 30, undefined]);
  assert.deepEqual([month.totals.expenses, month.categoryBreakdown], [10000, [{ category: "spending", amount: 10000, percentage: 1 }]]);
  assert.deepEqual((await summary("?view=weekly&date=2026-11-17")).data.period, { start: "2026-11-15", end: "2026-11-21", label: "Week of Nov 15, 2026" });
  const year = (await summary("?view=annual&date=2026-11-17")).data;
  assert.deepEqual([year.period, year.months!.length, year.days], [{ start: "2026-01-01", end: "2026-12-31", label: "2026" }, 12, undefined]);
  assert.deepEqual((await summary("")).data.period.start, "2026-11-01"); // defaults: monthly, today from the clock
  assert.deepEqual(await t.call("GET", "/api/summary?date=garbage"), { status: 400, body: { error: "Invalid time value" } });
  assert.deepEqual(await t.call("GET", "/api/summary?accountId=abc"), { status: 500, body: { error: "Failed to generate summary" } });
});

test("the summary account filter includes transfers into the account (money in) and out of it", async () => {
  await post({ amount: 50, type: "transfer", toAccountId: savings._id, description: "in" });
  await post({ amount: 20, type: "transfer", date: "2026-11-12", accountId: savings._id, toAccountId: bank._id, description: "out" });
  await post({ amount: 9, description: "other" });
  const data = (await summary(`?view=monthly&date=2026-11-17&accountId=${savings._id}`)).data;
  const tx = data.days!.flatMap((d) => d.transactions.map((x) => [d.date, x.description]));
  assert.deepEqual(tx, [["2026-11-10", "in"], ["2026-11-12", "out"]]);
  const balance = (date: string) => data.days!.find((d) => d.date === date)!.balances[savings._id];
  assert.deepEqual([balance("2026-11-09"), balance("2026-11-10"), balance("2026-11-12"), balance("2026-11-30")], [0, 5000, 3000, 3000]);
});

test("a stored debit or credit still holding an old toAccountId is not attributed to that account", async () => {
  for (const [type, description] of [["debit", "stale debit"], ["credit", "stale credit"]]) {
    await transactions(t.store).insert({
      amount: 700, date: "2026-11-12T00:00:00.000Z", description, accountId: bank._id, toAccountId: savings._id, type,
      isRecurring: false, categoryTags: [], balanceApplied: true,
    } as never);
  }
  await post({ amount: 50, type: "transfer", toAccountId: savings._id, description: "real move" });
  const names = (days: { transactions: { description: string }[] }[]) => days.flatMap((d) => d.transactions.map((x) => x.description));
  const proj = (await t.call("GET", `/api/projections${NOV}&accountId=${savings._id}`)).body as { data: ProjectionResult };
  assert.deepEqual(names(proj.data.timeline), ["real move"]);
  const sum = (await summary(`?view=monthly&date=2026-11-17&accountId=${savings._id}`)).data;
  assert.deepEqual([names(sum.days!), sum.totals.expenses, sum.totals.income, sum.categoryBreakdown], [["real move"], 0, 0, []]);
  // The sandbox path fetches everything; the engine's own filter leaves them out too
  const what = (await t.call("POST", "/api/projections", { startDate: "2026-11-01", endDate: "2026-11-30", accountId: savings._id, sandbox: {} })).body as { data: ProjectionResult };
  assert.deepEqual(names(what.data.timeline), ["real move"]);
  // Their own account still shows them
  const own = (await t.call("GET", `/api/projections${NOV}&accountId=${bank._id}`)).body as { data: ProjectionResult };
  assert.deepEqual(names(own.data.timeline).sort(), ["real move", "stale credit", "stale debit"]);
});

test("an unknown summary view is 400 and writes nothing", async () => {
  const before = [t.writes("accounts"), t.writes("transactions")];
  assert.deepEqual(await t.call("GET", "/api/summary?view=bogus&date=2026-11-17"), { status: 400, body: { error: "Invalid view" } });
  assert.deepEqual([t.writes("accounts"), t.writes("transactions")], before);
});

test("projections and the summary process a day's transactions income first, then bank transfers, then debits, then payments, then by creation", async () => {
  // Created in the "wrong" order on a future day, from an empty account: caps depend on the order
  const empty = await acct({ name: "Empty", type: "bank", balance: 0 });
  // A pause between writes keeps their createdAt apart (the default store clock is real time)
  const tick = () => new Promise((resolve) => setTimeout(resolve, 3));
  await post({ amount: 30, date: "2026-11-20", type: "transfer", accountId: empty._id, toAccountId: bank._id, description: "move" });
  await tick();
  await post({ amount: 20, date: "2026-11-20", accountId: empty._id, description: "spend" });
  await tick();
  await post({ amount: 100, date: "2026-11-20", type: "credit", accountId: empty._id, description: "pay" });
  await tick();
  await post({ amount: 5, date: "2026-11-20", accountId: empty._id, description: "spend later" });
  const expected = [["pay", 10000, false], ["move", 3000, false], ["spend", 2000, false], ["spend later", 500, false]];
  const r = await proj(`${NOV}&accountId=${empty._id}`);
  assert.deepEqual(on(r, "2026-11-20"), expected);
  assert.equal(r.data.summary.endBalances[empty._id], 4500);
  const days = (await summary(`?view=monthly&date=2026-11-17&accountId=${empty._id}`)).data.days!;
  assert.deepEqual(days.find((d) => d.date === "2026-11-20")!.transactions.map((x) => [x.description, x.amount, x.isProjected]), expected);
});

test("a stored semi-monthly rule without days still reads and projects (no occurrences)", async () => {
  const stored = await transactions(t.store).insert({
    amount: 2000, date: "2026-11-01T00:00:00.000Z", description: "old semi", accountId: bank._id, type: "debit", isRecurring: true,
    recurrenceRule: { frequency: "semi_monthly", interval: 1, startDate: "2026-11-01T00:00:00.000Z", endDate: null, daysOfMonth: [] },
    categoryTags: [], balanceApplied: false,
  } as never);
  assert.equal((await t.call("GET", `/api/transactions/${stored._id}`)).status, 200);
  const r = await proj(NOV);
  assert.equal(r.data.timeline.flatMap((d) => d.transactions).length, 0);
  assert.equal((await t.call("GET", "/api/summary?view=monthly&date=2026-11-17")).status, 200);
});

test("an account filter caps an inbound transfer against the source's full projected balance (every account's transactions count)", async () => {
  // Checking $200, a $3,000 paycheck on 20 Nov, a recurring $500 Checking → Savings on the 25th; today is 17 Nov
  const checking = await acct({ name: "Checking", type: "bank", balance: 200 });
  await post({ amount: 3000, date: "2026-11-20", type: "credit", accountId: checking._id, description: "paycheck" });
  await post({ amount: 500, date: "2026-11-25", type: "transfer", accountId: checking._id, toAccountId: savings._id, description: "save",
    isRecurring: true, recurrenceRule: { frequency: "monthly", startDate: "2026-11-25", dayOfMonth: 25 } });
  const save = (days: { transactions: { description: string; amount: number; originalAmount?: number }[] }[]) =>
    days.flatMap((d) => d.transactions).filter((x) => x.description === "save").map((x) => [x.amount, x.originalAmount]);
  const expected = [[50000, undefined]];

  const all = (await summary("?view=monthly&date=2026-11-17")).data;
  assert.deepEqual(save(all.days!), expected);
  const sum = (await summary(`?view=monthly&date=2026-11-17&accountId=${savings._id}`)).data;
  assert.deepEqual(save(sum.days!), expected);
  assert.equal(sum.days!.find((d) => d.date === "2026-11-30")!.balances[savings._id], 50000);
  // Only the filtered account is listed and reported; transfers stay out of income and expenses
  assert.deepEqual([Object.keys(sum.days![0].balances), sum.totals.income, sum.totals.expenses], [[savings._id], 0, 0]);

  const p = await proj(`${NOV}&accountId=${savings._id}`);
  assert.deepEqual(save(p.data.timeline), expected);
  assert.deepEqual([p.data.summary.endBalances, p.data.alerts], [{ [savings._id]: 50000 }, []]);
  const what = (await t.call("POST", "/api/projections", { startDate: "2026-11-01", endDate: "2026-11-30", accountId: savings._id, sandbox: {} })).body as { data: ProjectionResult };
  assert.deepEqual([save(what.data.timeline), what.data.summary.endBalances], [expected, { [savings._id]: 50000 }]);
  // The source's own view is unchanged: paycheck in, transfer out
  const own = (await summary(`?view=monthly&date=2026-11-17&accountId=${checking._id}`)).data;
  assert.deepEqual([own.totals.income, own.days!.find((d) => d.date === "2026-11-30")!.balances[checking._id]], [300000, 270000]);
});
