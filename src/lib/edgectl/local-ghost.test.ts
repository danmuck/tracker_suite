import assert from "node:assert/strict";
import { test } from "node:test";
import { childGhostId, localGhostId } from "./local-ghost";

test("the local Ghost is the only id that is not a child of another", () => {
  assert.deepEqual(localGhostId(["ghost.local"]), { ok: true, id: "ghost.local" });
  assert.deepEqual(localGhostId(["ghost.local.web1", "ghost.local", "ghost.local.web1.inner"]), { ok: true, id: "ghost.local" });
});

test("a configured id wins", () => {
  assert.deepEqual(localGhostId(["ghost.a", "ghost.b"], " ghost.b "), { ok: true, id: "ghost.b" });
});

test("no Ghost, or several candidates, is a refusal that names what to do", () => {
  const none = localGhostId([]);
  assert.equal(none.ok, false);
  const many = localGhostId(["ghost.local", "ghost.pi", "ghost.local.web1"]);
  assert.equal(many.ok, false);
  if (!many.ok) {
    assert.match(many.message, /ghost\.local, ghost\.pi/);
    assert.match(many.message, /EDGECTL_LOCAL_GHOST_ID/);
  }
});

test("a prefix that is not a dotted parent does not make a child", () => {
  // "ghost.local2" is not under "ghost.local"
  assert.equal(localGhostId(["ghost.local", "ghost.local2"]).ok, false);
});

test("a spawned Ghost is named under the local one", () => {
  assert.equal(childGhostId("ghost.local", "web1"), "ghost.local.web1");
});
