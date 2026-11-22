import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "./once";

const tick = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("concurrent callers share one run and its result", async () => {
  let runs = 0;
  const seed = once(async () => {
    runs++;
    await tick(5);
    return runs;
  });
  const results = await Promise.all([seed(), seed(), seed(), seed()]);
  assert.deepEqual(results, [1, 1, 1, 1]);
  assert.equal(runs, 1);
});

test("a success is not run again", async () => {
  let runs = 0;
  const seed = once(async () => ++runs);
  await seed();
  await seed();
  assert.equal(await seed(), 1);
  assert.equal(runs, 1);
});

test("a rejection reaches every waiting caller and is cleared, so the next call runs again", async () => {
  let runs = 0;
  const seed = once(async () => {
    runs++;
    await tick(1);
    if (runs === 1) throw new Error("seed failed");
    return "seeded";
  });
  const first = await Promise.allSettled([seed(), seed()]);
  assert.deepEqual(first.map((r) => r.status), ["rejected", "rejected"]);
  assert.equal(runs, 1);
  assert.equal(await seed(), "seeded");
  assert.equal(await seed(), "seeded");
  assert.equal(runs, 2);
});

test("a synchronous throw is a rejection too, and is retried", async () => {
  let runs = 0;
  const seed = once((): Promise<number> => {
    runs++;
    if (runs === 1) throw new Error("sync");
    return Promise.resolve(runs);
  });
  await assert.rejects(seed(), { message: "sync" });
  assert.equal(await seed(), 2);
});
