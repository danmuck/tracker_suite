import { test } from "node:test";
import assert from "node:assert/strict";
import { buildIssue, reconcileUntilSettled, runnableCommands } from "./issue";
import { issueSchema } from "./validators";
import type { GhostSeedCatalog, Report } from "@/types/edgectl/api";

const arg = (key: string, over: Partial<{ required: boolean; default_value: string; prompt: string; multiline: boolean }> = {}) => ({
  key,
  prompt: key,
  required: true,
  default_value: "",
  multiline: false,
  terminator: "",
  ...over,
});

// As the lab's Ghost publishes it: templates carry no seed_selector of their own.
const catalog: GhostSeedCatalog = {
  ghost_id: "ghost.local",
  admin_addr: "127.0.0.1:7011",
  connected: true,
  error: "",
  seed_catalog: [
    {
      metadata: { id: "seed.kv", name: "KV", description: "" },
      operations: [],
      command_catalog: [
        { id: "seed.kv.put", label: "KV Put", description: "Upsert", seed_selector: "", operation: "put", default_blocking: false, args: [arg("key"), arg("value")] },
        { id: "seed.kv.list", label: "KV List", description: "List", seed_selector: "", operation: "list", default_blocking: false, args: [arg("prefix", { required: false, prompt: "key prefix (optional)" })] },
      ],
    },
    {
      metadata: { id: "seed.host", name: "", description: "" },
      operations: [],
      command_catalog: [
        { id: "", label: "", description: "", seed_selector: "seed.host.v2", operation: "status", default_blocking: false, args: [] },
        { id: "seed.host.wait", label: "Wait", description: "", seed_selector: "", operation: "wait", default_blocking: false, args: [arg("seconds", { default_value: "5" })] },
      ],
    },
  ],
};
const [put, list, hostStatus, wait] = runnableCommands(catalog);

test("runnableCommands lists every template with its Seed resolved", () => {
  assert.equal(runnableCommands(catalog).length, 4);
  assert.deepEqual(
    { id: put.id, label: put.label, seedId: put.seedId, seedName: put.seedName, seedSelector: put.seedSelector, operation: put.operation },
    { id: "seed.kv.put", label: "KV Put", seedId: "seed.kv", seedName: "KV", seedSelector: "seed.kv", operation: "put" },
  );
  // A template's own selector wins; missing id, label and Seed name fall back.
  assert.deepEqual(
    { id: hostStatus.id, label: hostStatus.label, seedName: hostStatus.seedName, seedSelector: hostStatus.seedSelector },
    { id: "seed.host.status", label: "status", seedName: "seed.host", seedSelector: "seed.host.v2" },
  );
  assert.deepEqual(runnableCommands({ ...catalog, seed_catalog: [] }), []);
});

test("buildIssue makes one stage with one blocking command and no actor", () => {
  const built = buildIssue({ ghostId: "ghost.local", command: put, values: { key: "hello", value: "world" }, now: 1795577657208, suffix: "a1b2" });
  assert.deepEqual(built, {
    ok: true,
    issue: {
      intent_id: "intent.gui.1795577657208.a1b2",
      target_scope: "ghost:ghost.local",
      objective: "seed.kv put",
      stages: [
        {
          id: "stage.1",
          barrier: false,
          commands: [{ ghost_id: "ghost.local", seed_selector: "seed.kv", operation: "put", args: { key: "hello", value: "world" }, blocking: true }],
        },
      ],
    },
  });
  assert.ok(built.ok);
  assert.equal("actor" in built.issue, false);
  // What the builder makes is what the route accepts.
  assert.deepEqual(issueSchema.parse(built.issue), built.issue);
});

test("buildIssue reports each required argument that has no value", () => {
  const built = buildIssue({ ghostId: "ghost.local", command: put, values: { key: "hello" }, now: 1, suffix: "0" });
  assert.deepEqual(built, { ok: false, errors: { value: "value is required" } });
  const none = buildIssue({ ghostId: "", command: put, values: {}, now: 1, suffix: "0" });
  assert.deepEqual(none, { ok: false, errors: { key: "key is required", value: "value is required", _ghost: "Choose a Ghost" } });
});

test("buildIssue leaves out an empty optional argument and sends a typed one", () => {
  const empty = buildIssue({ ghostId: "g", command: list, values: { prefix: "" }, now: 1, suffix: "0" });
  assert.ok(empty.ok);
  assert.deepEqual(empty.issue.stages[0].commands[0].args, {});
  const typed = buildIssue({ ghostId: "g", command: list, values: { prefix: "app/" }, now: 1, suffix: "0" });
  assert.ok(typed.ok);
  assert.deepEqual(typed.issue.stages[0].commands[0].args, { prefix: "app/" });
});

test("buildIssue uses an argument's default when nothing is typed, and keeps whitespace as typed", () => {
  const defaulted = buildIssue({ ghostId: "g", command: wait, values: {}, now: 1, suffix: "0" });
  assert.ok(defaulted.ok);
  assert.deepEqual(defaulted.issue.stages[0].commands[0].args, { seconds: "5" });
  const typed = buildIssue({ ghostId: "g", command: put, values: { key: "k", value: "  two words\n" }, now: 1, suffix: "0" });
  assert.ok(typed.ok);
  assert.equal(typed.issue.stages[0].commands[0].args.value, "  two words\n");
  // Values for arguments the command does not have are not sent.
  const extra = buildIssue({ ghostId: "g", command: hostStatus, values: { stray: "x" }, now: 1, suffix: "0" });
  assert.ok(extra.ok);
  assert.deepEqual(extra.issue.stages[0].commands[0].args, {});
});

test("buildIssue gives each issue its own intent id when none is supplied", () => {
  const ids = new Set<string>();
  for (let i = 0; i < 20; i++) {
    const built = buildIssue({ ghostId: "g", command: hostStatus, values: {} });
    assert.ok(built.ok);
    assert.match(built.issue.intent_id, /^intent\.gui\.\d{13}\.[0-9a-f]{4}$/);
    ids.add(built.issue.intent_id);
  }
  assert.ok(ids.size > 1);
});

const report = (completion_state: string): Report => ({ intent_id: "i", phase: "p", summary: "s", completion_state, timestamp_ms: 1 });

test("reconcileUntilSettled stops at the first report that is not in progress", async () => {
  const answers = ["in_progress", "in_progress", "satisfied", "satisfied"];
  let calls = 0;
  let waits = 0;
  const result = await reconcileUntilSettled(async () => report(answers[calls++]), { wait: async () => void waits++ });
  assert.deepEqual(result, { report: report("satisfied"), calls: 3, settled: true });
  assert.equal(calls, 3);
  assert.equal(waits, 2);

  let once = 0;
  const failed = await reconcileUntilSettled(async () => (once++, report("failed")));
  assert.deepEqual(failed, { report: report("failed"), calls: 1, settled: true });
  assert.equal(once, 1);
});

test("reconcileUntilSettled gives up at the limit with the intent still in progress", async () => {
  let calls = 0;
  const result = await reconcileUntilSettled(async () => (calls++, report("in_progress")), { max: 4 });
  assert.deepEqual(result, { report: report("in_progress"), calls: 4, settled: false });
  assert.equal(calls, 4);
  let single = 0;
  assert.equal((await reconcileUntilSettled(async () => (single++, report("in_progress")), { max: 0 })).calls, 1);
  assert.equal(single, 1);
});

test("reconcileUntilSettled passes a reconcile error on without calling again", async () => {
  let calls = 0;
  await assert.rejects(
    reconcileUntilSettled(async () => {
      if (++calls === 2) throw new Error("Mirage unreachable");
      return report("in_progress");
    }),
    /Mirage unreachable/,
  );
  assert.equal(calls, 2);
});
