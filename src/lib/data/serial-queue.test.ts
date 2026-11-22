import { test } from "node:test";
import assert from "node:assert/strict";
import { createSerialQueue } from "./serial-queue";

const tick = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("jobs submitted together run strictly in submission order with no overlap", async () => {
  const run = createSerialQueue();
  const events: string[] = [];
  const job = (name: string, ms: number) => async () => {
    events.push(`start ${name}`);
    await tick(ms);
    events.push(`end ${name}`);
    return name;
  };
  const results = await Promise.all([run(job("a", 15)), run(job("b", 1)), run(job("c", 5))]);
  assert.deepEqual(results, ["a", "b", "c"]);
  assert.deepEqual(events, ["start a", "end a", "start b", "end b", "start c", "end c"]);
});

test("a rejecting or throwing job does not stop later jobs, and each caller gets its own outcome", async () => {
  const run = createSerialQueue();
  const events: string[] = [];
  const rejecting = run(async () => {
    await tick(5);
    events.push("reject");
    throw new Error("first failed");
  });
  const throwing = run((() => {
    events.push("throw");
    throw new Error("second threw");
  }) as () => Promise<never>);
  const fine = run(async () => {
    events.push("fine");
    return 42;
  });
  await assert.rejects(rejecting, /first failed/);
  await assert.rejects(throwing, /second threw/);
  assert.equal(await fine, 42);
  assert.deepEqual(events, ["reject", "throw", "fine"]);
});
