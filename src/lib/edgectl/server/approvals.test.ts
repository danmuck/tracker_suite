import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { clearApprovals, holdApproval, takeApproval } from "./approvals";

const digest = "a".repeat(64);
const other = "b".repeat(64);
const payload = { proposal_id: "dep.1", nonce: "n" };

beforeEach(() => clearApprovals());

test("the held payload is handed out once, for the digest that was shown", () => {
  holdApproval("dep.1", { payload, digest, expiresAtMs: 2_000 }, 1_000);
  assert.deepEqual(takeApproval("dep.1", digest, 1_500), { ok: true, payload, digest });
  const again = takeApproval("dep.1", digest, 1_500);
  assert.equal(again.ok, false);
});

test("another digest signs nothing and leaves the payload held", () => {
  holdApproval("dep.1", { payload, digest, expiresAtMs: 2_000 }, 1_000);
  const wrong = takeApproval("dep.1", other, 1_500);
  assert.equal(wrong.ok, false);
  if (!wrong.ok) assert.match(wrong.message, /not the digest that was shown/);
  assert.equal(takeApproval("dep.1", digest, 1_500).ok, true);
});

test("an expired payload is refused", () => {
  holdApproval("dep.1", { payload, digest, expiresAtMs: 2_000 }, 1_000);
  const late = takeApproval("dep.1", digest, 2_000);
  assert.equal(late.ok, false);
  if (!late.ok) assert.match(late.message, /expired/);
});

test("nothing prepared, or prepared for another proposal, is refused", () => {
  holdApproval("dep.1", { payload, digest, expiresAtMs: 2_000 }, 1_000);
  assert.equal(takeApproval("dep.2", digest, 1_500).ok, false);
});

test("preparing again replaces the earlier payload", () => {
  holdApproval("dep.1", { payload, digest, expiresAtMs: 2_000 }, 1_000);
  holdApproval("dep.1", { payload: { ...payload, nonce: "m" }, digest: other, expiresAtMs: 3_000 }, 1_000);
  assert.equal(takeApproval("dep.1", digest, 1_500).ok, false);
  assert.equal(takeApproval("dep.1", other, 1_500).ok, true);
});
