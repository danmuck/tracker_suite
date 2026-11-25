import { test } from "node:test";
import assert from "node:assert/strict";
import {
  attachRequestSchema,
  executionSchema,
  ghostSeedCatalogsSchema,
  ghostsSchema,
  intentSnapshotSchema,
  issueSchema,
  pathId,
  reportLimitSchema,
  reportsSchema,
  spawnRequestSchema,
  statusSchema,
} from "./validators";

const command = { ghost_id: "ghost.local", seed_selector: "seed.kv", operation: "put", args: { key: "a", value: "b" }, blocking: true };
const issue = {
  intent_id: "intent.gui.1",
  target_scope: "ghost:ghost.local",
  objective: "seed.kv put",
  stages: [{ id: "stage.1", barrier: false, commands: [command] }],
};

test("pathId accepts edgectl ids and refuses anything that could change a URL path", () => {
  for (const id of ["intent.gui.1795577657208.a1b2", "cmd.intent.gui.probe1.1", "ghost.local", "a:b_c-d"]) {
    assert.equal(pathId.safeParse(id).success, true, id);
  }
  for (const id of ["", ".", "..", "../ghosts", "a/b", "a\\b", "a?b", "a#b", "a b", "a\nb", "a\u0000b", "x".repeat(257)]) {
    assert.equal(pathId.safeParse(id).success, false, JSON.stringify(id));
  }
});

test("issueSchema accepts a built issue and keeps it unchanged", () => {
  assert.deepEqual(issueSchema.parse(issue), issue);
});

test("issueSchema refuses an issue Mirage would refuse or that could not be addressed", () => {
  const bad: unknown[] = [
    { ...issue, intent_id: "" },
    { ...issue, intent_id: "a/b" },
    { ...issue, target_scope: "" },
    { ...issue, objective: "  " },
    { ...issue, stages: [] },
    { ...issue, stages: [{ id: "s", barrier: false, commands: [{ ...command, ghost_id: "" }] }] },
    { ...issue, stages: [{ id: "s", barrier: false, commands: [{ ...command, args: { key: 1 } }] }] },
    undefined,
    "issue",
  ];
  for (const value of bad) assert.equal(issueSchema.safeParse(value).success, false, JSON.stringify(value));
});

test("issueSchema drops fields that are not part of an issue", () => {
  const parsed = issueSchema.parse({ ...issue, command: "rm", stages: [{ ...issue.stages[0], extra: 1 }] });
  assert.deepEqual(parsed, issue);
});

test("attach and spawn bodies need every field and are trimmed", () => {
  assert.deepEqual(attachRequestSchema.parse({ ghost_admin_addr: " 127.0.0.1:7031 " }), { ghost_admin_addr: "127.0.0.1:7031" });
  assert.equal(attachRequestSchema.safeParse({ ghost_admin_addr: " " }).success, false);
  assert.equal(attachRequestSchema.safeParse({}).success, false);
  assert.deepEqual(spawnRequestSchema.parse({ target_name: "ghost.two", admin_addr: "127.0.0.1:7031" }), {
    target_name: "ghost.two",
    admin_addr: "127.0.0.1:7031",
  });
  assert.equal(spawnRequestSchema.safeParse({ target_name: "ghost.two" }).success, false);
});

test("report limit is a positive integer", () => {
  assert.equal(reportLimitSchema.parse("25"), 25);
  for (const value of ["0", "-1", "1.5", "abc", "1001"]) assert.equal(reportLimitSchema.safeParse(value).success, false, value);
});

test("status and reports parse as Mirage sends them", () => {
  const status = { mirage_id: "mirage.lab", phase: "seeded", registered_ghosts: 1, active_intents: 0, report_count: 0 };
  assert.deepEqual(statusSchema.parse(status), status);
  const report = {
    intent_id: "intent.gui.probe1",
    phase: "complete",
    summary: "intent intent.gui.probe1 satisfied on ghost.local",
    completion_state: "satisfied",
    command_id: "cmd.intent.gui.probe1.1",
    event_id: "evt.cmd.intent.gui.probe1.1",
    outcome: "success",
    timestamp_ms: 1795577657230,
  };
  assert.deepEqual(reportsSchema.parse({ reports: [report] }), { reports: [report] });
  assert.equal(statusSchema.safeParse({ ...status, registered_ghosts: "1" }).success, false);
});

test("null lists and maps from Mirage read as empty", () => {
  assert.deepEqual(reportsSchema.parse({ reports: null }), { reports: [] });
  assert.deepEqual(reportsSchema.parse({}), { reports: [] });
  const ghosts = ghostsSchema.parse({ ghosts: [{ ghost_id: "g", seed_list: null }] });
  assert.deepEqual(ghosts.ghosts[0], {
    ghost_id: "g",
    remote_addr: "",
    seed_list: [],
    registered_at_ms: 0,
    last_event_at_ms: 0,
    event_count: 0,
    connected: false,
  });
  const catalogs = ghostSeedCatalogsSchema.parse({
    ghosts: [
      { ghost_id: "g", connected: true, seed_catalog: [{ metadata: { id: "seed.kv" }, operations: null, command_catalog: [{ operation: "list", args: null }] }] },
      { ghost_id: "h", error: "dial failed", seed_catalog: null },
    ],
  });
  assert.equal(catalogs.ghosts[0].error, "");
  assert.deepEqual(catalogs.ghosts[0].seed_catalog[0].operations, []);
  assert.deepEqual(catalogs.ghosts[0].seed_catalog[0].command_catalog[0].args, []);
  assert.equal(catalogs.ghosts[0].seed_catalog[0].command_catalog[0].seed_selector, "");
  assert.equal(catalogs.ghosts[1].error, "dial failed");
  assert.deepEqual(catalogs.ghosts[1].seed_catalog, []);
});

test("an intent snapshot parses, with a command that has not been dispatched", () => {
  const snapshot = intentSnapshotSchema.parse({
    intent_id: "intent.gui.1",
    issue: { ...issue, actor: "edgectl://operator/ops", seed_dependencies: ["seed.kv"] },
    received_at_ms: 5,
    commands: [{ ...command, command_id: "cmd.intent.gui.1.1", state: "", attempts: 0, last_error: "", updated_at_ms: 0 }],
    reports: [],
    has_observed: false,
    pending_count: 1,
  });
  assert.equal(snapshot.commands[0].state, "");
  assert.equal(snapshot.commands[0].command_id, "cmd.intent.gui.1.1");
  assert.deepEqual(snapshot.issue.seed_dependencies, ["seed.kv"]);
  assert.equal(snapshot.issue.stages[0].commands[0].args.value, "b");
});

test("an execution parses with text or base64 output, and without a seed_result", () => {
  const base = { command_id: "c", execution_id: "e", intent_id: "i", ghost_id: "g", seed_selector: "seed.kv", operation: "get", args: { key: "a" }, phase: "complete", outcome: "success", completed_at_ms: 9 };
  const text = executionSchema.parse({ ...base, seed_result: { seed_id: "seed.kv", status: "ok", exit_code: 0, stdout: "world", stderr: "", output_encoding: "utf8" } });
  assert.equal(text.seed_result.stdout, "world");
  assert.equal(text.seed_result.output_encoding, "utf8");
  const binary = executionSchema.parse({ ...base, seed_result: { seed_id: "seed.fs", status: "ok", exit_code: 0, stdout: "/w==", stderr: "", output_encoding: "base64" } });
  assert.equal(binary.seed_result.output_encoding, "base64");
  const none = executionSchema.parse({ ...base, args: null });
  assert.deepEqual(none.args, {});
  assert.deepEqual(none.seed_result, { seed_id: "", status: "", exit_code: 0, stdout: "", stderr: "", output_encoding: "utf8" });
});

test("a Ghost name is safe to put on a command line", async () => {
  const { targetName, addGhostSchema, principalId, proposeSchema, adminAddr } = await import("./validators");
  for (const ok of ["web1", "a", "web-1.east", "0abc"]) assert.equal(targetName.safeParse(ok).success, true, ok);
  for (const bad of ["", "Web1", "-web", ".web", "web 1", "web;ls", "web/1", "web_1", "$(id)", "a".repeat(41)]) {
    assert.equal(targetName.safeParse(bad).success, false, bad);
  }
  assert.equal(principalId.safeParse("ghost.local.web1").success, true);
  assert.equal(principalId.safeParse("-out").success, false);
  assert.equal(principalId.safeParse("a".repeat(64)).success, false);
  for (const ok of ["127.0.0.1:7031", "localhost:7031", "[::1]:7031"]) assert.equal(adminAddr.safeParse(ok).success, true, ok);
  for (const bad of ["127.0.0.1", "127.0.0.1:7031 -x", "http://a:1", "a:b"]) assert.equal(adminAddr.safeParse(bad).success, false, bad);
  // Unknown fields are refused, as Mirage refuses them
  assert.equal(addGhostSchema.safeParse({ target_name: "web1", admin_addr: "127.0.0.1:7031", cert: "x" }).success, false);
  assert.equal(proposeSchema.safeParse({ ghost_id: "ghost.local", seed_ids: [] }).success, false);
  assert.equal(proposeSchema.safeParse({ ghost_id: "ghost.local", seed_ids: ["seed.docker,--x"] }).success, false);
  assert.equal(proposeSchema.safeParse({ ghost_id: "ghost.local", seed_ids: ["seed.docker"] }).success, true);
});

test("a proposal is read for display without its signed parts", async () => {
  const { dependencyProposalSchema, activitySchema } = await import("./validators");
  const parsed = dependencyProposalSchema.parse({
    id: "dep.1",
    ghost_id: "ghost.local",
    seed_ids: ["seed.docker"],
    steps: [{ seed_id: "seed.docker", method: "brew", package: "docker", binary: "docker", install_to_bin: true }],
    state: "pending",
    proposed_by: "edgectl://operator/ops",
    intent: { intent: { ghost_id: "ghost.local", seed_ids: ["seed.docker"], proposed_at_ms: 42, nonce: "n" }, signature: "c2ln", proposer_cert: "Y2VydA==" },
    audit: null,
  });
  assert.equal(parsed.proposed_at_ms, 42);
  assert.equal("intent" in parsed, false);
  assert.equal(JSON.stringify(parsed).includes("c2ln"), false, "no signature in what the browser gets");
  assert.deepEqual(parsed.unresolved, []);
  assert.equal(parsed.execution, null);
  assert.equal(parsed.steps[0].package, "docker");
  assert.deepEqual(activitySchema.parse({ records: null }), { records: [] });
});

test("a verification record has numeric message ids and types", async () => {
  const { ghostVerificationSchema } = await import("./validators");
  const parsed = ghostVerificationSchema.parse({
    records: [{ command_message_id: 1, command_message_type: 4, event_message_type: 5, command_id: "cmd.1", exit_code: 0, timestamp_ms: 7, status: "success" }],
  });
  assert.equal(parsed.records[0].command_message_type, 4);
  assert.equal(parsed.records[0].seed_id, "");
});
