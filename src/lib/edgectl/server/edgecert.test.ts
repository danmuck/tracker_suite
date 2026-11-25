// Runs a stub in place of edgecert: it prints back its arguments and stdin, or what a test tells
// it to. No real key, certificate or edgecert binary is involved.

import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { MirageError } from "./client";
import { buildApproval, buildIntent, capabilities, issueGhostCertificate, signApproval, signIntent } from "./edgecert";

const dir = mkdtempSync(join(tmpdir(), "edgecert-stub-"));
after(() => rmSync(dir, { recursive: true, force: true }));

const digest = "c".repeat(64);

// The stub answers by subcommand. `echo` carries argv and stdin back so a test can check them.
const stub = join(dir, "edgecert");
writeFileSync(
  stub,
  `#!${process.execPath}
const args = process.argv.slice(2);
let input = "";
process.stdin.on("data", (c) => (input += c));
process.stdin.on("end", () => {
  const echo = { args, stdin: input, envKeys: Object.keys(process.env).filter((k) => k.startsWith("EDGECTL") || k === "HOME") };
  const d = "${digest}";
  switch (args[0]) {
    case "issue": process.stdout.write("issued\\n" + JSON.stringify(echo)); break;
    case "intent": console.log(JSON.stringify({ intent: { echo }, digest: d, steps: [{ seed_id: "seed.docker", method: "brew", package: "docker" }] })); break;
    case "sign-intent": console.log(JSON.stringify({ signed_intent: { echo }, digest: d, principal: "edgectl://operator/ops" })); break;
    case "approval": console.log(JSON.stringify({ payload: { echo }, digest: d, approver: "edgectl://operator/lead", proposer: "edgectl://operator/ops", expires_at_ms: 99 })); break;
    case "sign-approval": console.log(JSON.stringify({ approval: { echo }, digest: d, principal: "edgectl://operator/lead" })); break;
    case "fail": console.error("first line"); console.error("payload digest x is not the confirmed digest y; not signed"); process.exit(1);
    default: console.log("not json");
  }
});
`,
);
chmodSync(stub, 0o755);

const env = {
  EDGECTL_EDGECERT_BIN: stub,
  EDGECTL_API_URL: "https://127.0.0.1:1/api/v1",
  EDGECTL_CLIENT_CERT: "/lab/ops.crt",
  EDGECTL_CLIENT_KEY: "/lab/ops.key",
  EDGECTL_CA: "/lab/ca.crt",
  EDGECTL_CA_ISSUER_CERT: "/lab/root/ca.crt",
  EDGECTL_CA_ISSUER_KEY: "/lab/root/ca.key",
  EDGECTL_CERTS_DIR: "/lab/certs",
  EDGECTL_APPROVER_CERT: "/lab/lead.crt",
  EDGECTL_APPROVER_KEY: "/lab/lead.key",
};

type Echo = { echo: { args: string[]; stdin: string; envKeys: string[] } };

test("intent passes the Ghost and Seeds as separate arguments and gets an empty environment", async () => {
  const out = await buildIntent("ghost.local", ["seed.docker", "seed.mongod"], env);
  const { echo } = out.intent as unknown as Echo;
  assert.deepEqual(echo.args, ["intent", "-ghost", "ghost.local", "-seeds", "seed.docker,seed.mongod"]);
  assert.deepEqual(echo.envKeys, []);
  assert.equal(out.digest, digest);
  assert.equal(out.steps[0].package, "docker");
});

test("sign-intent signs as the operator and sends the intent on stdin", async () => {
  const intent = { ghost_id: "ghost.local", seed_ids: ["seed.docker"], proposed_at_ms: 5, nonce: "n" };
  const out = await signIntent(intent, env);
  const { echo } = out.signed_intent as unknown as Echo;
  assert.deepEqual(echo.args, ["sign-intent", "-cert", "/lab/ops.crt", "-key", "/lab/ops.key"]);
  assert.deepEqual(JSON.parse(echo.stdin), intent);
});

test("approval and sign-approval use the second operator, and the confirmed digest is passed on", async () => {
  const proposal = { id: "dep.1", extra_field_from_mirage: [1, 2] };
  const unsigned = await buildApproval(proposal, env);
  const built = (unsigned.payload as unknown as Echo).echo;
  assert.deepEqual(built.args, ["approval", "-cert", "/lab/lead.crt", "-key", "/lab/lead.key", "-ca", "/lab/ca.crt"]);
  assert.deepEqual(JSON.parse(built.stdin), proposal, "the proposal reaches the tool unchanged");

  const signed = await signApproval({ proposal_id: "dep.1" }, digest, env);
  const sign = (signed.approval as unknown as Echo).echo;
  assert.deepEqual(sign.args, ["sign-approval", "-cert", "/lab/lead.crt", "-key", "/lab/lead.key", "-digest", digest]);
  await assert.rejects(() => signApproval({}, "not-a-digest", env));
});

test("issue is given the full Ghost id and the issuing key by path", async () => {
  await issueGhostCertificate("ghost.local.web1", env);
  await assert.rejects(
    () => issueGhostCertificate("web1; rm -rf /", env),
    (error: unknown) => error instanceof MirageError && error.kind === "tool" && /not a valid certificate id/.test(error.message),
  );
  await assert.rejects(() => issueGhostCertificate("-out", env));
});

test("a missing setting disables only its own feature, by name", async () => {
  const noIssuer = { ...env, EDGECTL_CA_ISSUER_KEY: "" };
  await assert.rejects(
    () => issueGhostCertificate("ghost.local.web1", noIssuer),
    (error: unknown) =>
      error instanceof MirageError && error.kind === "not_configured" && /EDGECTL_CA_ISSUER_KEY/.test(error.message),
  );
  const caps = await capabilities(noIssuer);
  assert.equal(caps.issue.enabled, false);
  assert.match(caps.issue.message, /Certificate issuance is not configured.*EDGECTL_CA_ISSUER_KEY/);
  assert.equal(caps.propose.enabled, true);
  assert.equal(caps.approve.enabled, true);

  const noApprover = await capabilities({ ...env, EDGECTL_APPROVER_CERT: undefined });
  assert.equal(noApprover.approve.enabled, false);
  assert.equal(noApprover.issue.enabled, true);

  const noTool = await capabilities({ ...env, EDGECTL_EDGECERT_BIN: undefined });
  assert.deepEqual([noTool.issue.enabled, noTool.propose.enabled, noTool.approve.enabled], [false, false, false]);
  const badTool = await capabilities({ ...env, EDGECTL_EDGECERT_BIN: join(dir, "missing") });
  assert.match(badTool.issue.message, /not a program this server can run/);
  const relative = await capabilities({ ...env, EDGECTL_EDGECERT_BIN: "edgecert" });
  assert.match(relative.issue.message, /absolute path/);
});

test("a tool failure carries the tool's last line, and unexpected output is refused", async () => {
  const failing = join(dir, "failing");
  writeFileSync(failing, `#!/bin/sh\necho "first line" >&2\necho "payload digest x is not the confirmed digest y; not signed" >&2\nexit 1\n`);
  chmodSync(failing, 0o755);
  await assert.rejects(
    () => buildIntent("ghost.local", ["seed.kv"], { ...env, EDGECTL_EDGECERT_BIN: failing }),
    (error: unknown) =>
      error instanceof MirageError && error.kind === "tool" && error.message === "edgecert intent: payload digest x is not the confirmed digest y; not signed",
  );
  const chatty = join(dir, "chatty");
  writeFileSync(chatty, `#!/bin/sh\necho "hello"\n`);
  chmodSync(chatty, 0o755);
  await assert.rejects(
    () => buildIntent("ghost.local", ["seed.kv"], { ...env, EDGECTL_EDGECERT_BIN: chatty }),
    (error: unknown) => error instanceof MirageError && /did not print JSON/.test(error.message),
  );
});
