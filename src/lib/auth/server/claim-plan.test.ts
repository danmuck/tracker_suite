import { test } from "node:test";
import assert from "node:assert/strict";
import { planClaim, type ClaimFacts } from "./claim-plan.ts";

function facts(over: Partial<ClaimFacts> = {}): ClaimFacts {
  return {
    admin: { found: true, role: "admin", disabled: false },
    collections: [
      { name: "links", unowned: 3, others: 0 },
      { name: "accounts", unowned: 2, others: 0, unique: { label: "isCash", unowned: ["cash"], admin: [], others: [] } },
    ],
    ...over,
  };
}

test("a clean database lists what would change and has no blockers", () => {
  const plan = planClaim(facts());
  assert.deepEqual(plan.blockers, []);
  assert.deepEqual(plan.changes, [
    { name: "links", count: 3 },
    { name: "accounts", count: 2 },
  ]);
  assert.equal(plan.total, 5);
});

test("nothing unowned means nothing to do", () => {
  const plan = planClaim(facts({ collections: [{ name: "links", unowned: 0, others: 0 }] }));
  assert.deepEqual(plan.blockers, []);
  assert.deepEqual(plan.changes, []);
  assert.equal(plan.total, 0);
});

test("a missing, non-admin or disabled admin blocks", () => {
  assert.match(planClaim(facts({ admin: { found: false } })).blockers.join(), /not found/i);
  assert.match(planClaim(facts({ admin: { found: true, role: "member", disabled: false } })).blockers.join(), /not an admin/i);
  assert.match(planClaim(facts({ admin: { found: true, role: "admin", disabled: true } })).blockers.join(), /disabled/i);
});

test("two unowned cash accounts block", () => {
  const plan = planClaim(
    facts({
      collections: [{ name: "accounts", unowned: 2, others: 0, unique: { label: "isCash", unowned: ["cash", "cash"], admin: [], others: [] } }],
    })
  );
  assert.equal(plan.blockers.length, 1);
  assert.match(plan.blockers[0], /accounts/);
  assert.match(plan.blockers[0], /more than one/i);
});

test("two unowned finance profiles block", () => {
  const plan = planClaim(
    facts({
      collections: [{ name: "financeProfile", unowned: 2, others: 0, unique: { label: "profile", unowned: ["profile", "profile"], admin: [], others: [] } }],
    })
  );
  assert.match(plan.blockers.join(), /financeProfile/);
});

test("an unowned record that clashes with one the admin already has blocks", () => {
  const plan = planClaim(
    facts({
      collections: [{ name: "linkGroups", unowned: 1, others: 0, unique: { label: "slug", unowned: ["home"], admin: ["home"], others: [] } }],
    })
  );
  assert.match(plan.blockers.join(), /linkGroups.*home/);
});

test("an unowned record that clashes with another owner's record blocks", () => {
  const plan = planClaim(
    facts({
      collections: [{ name: "linkGroups", unowned: 1, others: 1, unique: { label: "slug", unowned: ["home"], admin: [], others: ["home"] } }],
    })
  );
  assert.equal(plan.blockers.length, 1);
});

test("other owners' records without a clash do not block", () => {
  const plan = planClaim(
    facts({
      collections: [{ name: "linkGroups", unowned: 1, others: 4, unique: { label: "slug", unowned: ["home"], admin: ["a"], others: ["b"] } }],
    })
  );
  assert.deepEqual(plan.blockers, []);
  assert.equal(plan.total, 1);
});

test("a clash value is only named once however often it repeats", () => {
  const plan = planClaim(
    facts({
      collections: [{ name: "categories", unowned: 2, others: 0, unique: { label: "name", unowned: ["x", "x"], admin: [], others: [] } }],
    })
  );
  assert.equal(plan.blockers.length, 1);
});
