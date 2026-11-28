import { test } from "node:test";
import assert from "node:assert/strict";
import {
  foldOwners,
  indexName,
  orderIndexCreates,
  planClaim,
  verifyClaim,
  type ClaimFacts,
  type CollectionFacts,
} from "./claim-plan";

const ADMIN = "a".repeat(24);
const OTHER = "b".repeat(24);
const DEAD = "d".repeat(24);

function coll(over: Partial<CollectionFacts> & { name: string }): CollectionFacts {
  return { unowned: 0, nullOwner: 0, wrongType: 0, byOwner: {}, ...over };
}

function facts(over: Partial<ClaimFacts> = {}): ClaimFacts {
  return {
    admin: { found: true, id: ADMIN, role: "admin", disabled: false },
    userIds: [ADMIN],
    collections: [
      coll({ name: "links", unowned: 3 }),
      coll({ name: "accounts", unowned: 2, unique: { label: "isCash", unowned: ["cash"], admin: [] } }),
    ],
    ...over,
  };
}

test("foldOwners sorts owner groups into missing, null, other types and string owners", () => {
  assert.deepEqual(
    foldOwners([
      { owner: undefined, type: "missing", count: 4 },
      { owner: null, type: "null", count: 2 },
      { owner: ADMIN, type: "string", count: 5 },
      { owner: OTHER, type: "string", count: 1 },
      { owner: 7, type: "int", count: 3 },
      { owner: ADMIN, type: "string", count: 1 },
    ]),
    { unowned: 4, nullOwner: 2, wrongType: 3, byOwner: { [ADMIN]: 6, [OTHER]: 1 } },
  );
  assert.deepEqual(foldOwners([]), { unowned: 0, nullOwner: 0, wrongType: 0, byOwner: {} });
});

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
  const plan = planClaim(facts({ collections: [coll({ name: "links", byOwner: { [ADMIN]: 4 } })] }));
  assert.deepEqual(plan.blockers, []);
  assert.deepEqual(plan.changes, []);
  assert.equal(plan.total, 0);
});

test("a missing, non-admin or disabled admin blocks", () => {
  assert.match(planClaim(facts({ admin: { found: false } })).blockers.join(), /not found/i);
  assert.match(planClaim(facts({ admin: { found: true, id: ADMIN, role: "member", disabled: false } })).blockers.join(), /not an admin/i);
  assert.match(planClaim(facts({ admin: { found: true, id: ADMIN, role: "admin", disabled: true } })).blockers.join(), /disabled/i);
});

test("ownership is reported per collection: unowned, the admin's, other users', null and unknown owners", () => {
  const plan = planClaim(
    facts({
      userIds: [ADMIN, OTHER],
      collections: [coll({ name: "links", unowned: 1, byOwner: { [ADMIN]: 2, [OTHER]: 3 } })],
    }),
  );
  assert.deepEqual(plan.blockers, []);
  assert.deepEqual(plan.ownership, [
    { name: "links", unowned: 1, admin: 2, otherUsers: 3, nullOwner: 0, unknownOwner: 0 },
  ]);
});

test("records of another existing user are reported but do not block", () => {
  const plan = planClaim(facts({ userIds: [ADMIN, OTHER], collections: [coll({ name: "links", byOwner: { [OTHER]: 4 } })] }));
  assert.deepEqual(plan.blockers, []);
  assert.equal(plan.ownership[0].otherUsers, 4);
});

test("a record with ownerId null blocks", () => {
  const plan = planClaim(facts({ collections: [coll({ name: "links", nullOwner: 2 })] }));
  assert.equal(plan.blockers.length, 1);
  assert.match(plan.blockers[0], /links.*2.*null/);
  assert.equal(plan.ownership[0].nullOwner, 2);
});

test("a record owned by an id with no AuthUser blocks, and names the id", () => {
  const plan = planClaim(facts({ collections: [coll({ name: "tasks", byOwner: { [ADMIN]: 1, [DEAD]: 3 } })] }));
  assert.equal(plan.blockers.length, 1);
  assert.match(plan.blockers[0], /tasks/);
  assert.ok(plan.blockers[0].includes(DEAD));
  assert.equal(plan.ownership[0].unknownOwner, 3);
});

test("an ownerId that is not a string blocks", () => {
  const plan = planClaim(facts({ collections: [coll({ name: "tasks", wrongType: 1 })] }));
  assert.match(plan.blockers.join(), /tasks.*not a string/);
  assert.equal(plan.ownership[0].unknownOwner, 1);
});

test("with no admin found, every owned record counts as someone else's", () => {
  const plan = planClaim(facts({ admin: { found: false }, userIds: [OTHER], collections: [coll({ name: "links", byOwner: { [OTHER]: 2 } })] }));
  assert.equal(plan.ownership[0].otherUsers, 2);
  assert.equal(plan.ownership[0].admin, 0);
});

test("two unowned cash accounts block", () => {
  const plan = planClaim(
    facts({ collections: [coll({ name: "accounts", unowned: 2, unique: { label: "isCash", unowned: ["cash", "cash"], admin: [] } })] }),
  );
  assert.equal(plan.blockers.length, 1);
  assert.match(plan.blockers[0], /accounts/);
  assert.match(plan.blockers[0], /more than one/i);
});

test("two unowned finance profiles block", () => {
  const plan = planClaim(
    facts({ collections: [coll({ name: "financeProfile", unowned: 2, unique: { label: "profile", unowned: ["profile", "profile"], admin: [] } })] }),
  );
  assert.match(plan.blockers.join(), /financeProfile/);
});

test("an unowned record that clashes with one the admin already has blocks", () => {
  const plan = planClaim(
    facts({ collections: [coll({ name: "linkGroups", unowned: 1, unique: { label: "slug", unowned: ["home"], admin: ["home"] } })] }),
  );
  assert.equal(plan.blockers.length, 1);
  assert.match(plan.blockers[0], /linkGroups.*home/);
});

test("duplicates inside the admin's own records block even when nothing is unowned", () => {
  const plan = planClaim(
    facts({
      collections: [coll({ name: "linkGroups", byOwner: { [ADMIN]: 2 }, unique: { label: "slug", unowned: [], admin: ["home", "home"] } })],
    }),
  );
  assert.equal(plan.blockers.length, 1);
  assert.match(plan.blockers[0], /linkGroups.*admin.*home/);
});

test("other owners' values are not compared: uniqueness is per owner", () => {
  const plan = planClaim(
    facts({
      userIds: [ADMIN, OTHER],
      collections: [coll({ name: "linkGroups", unowned: 1, byOwner: { [OTHER]: 4 }, unique: { label: "slug", unowned: ["home"], admin: ["a"] } })],
    }),
  );
  assert.deepEqual(plan.blockers, []);
  assert.equal(plan.total, 1);
});

test("a clash value is only named once however often it repeats", () => {
  const plan = planClaim(
    facts({ collections: [coll({ name: "categories", unowned: 3, unique: { label: "name", unowned: ["x", "x", "x"], admin: [] } })] }),
  );
  assert.equal(plan.blockers.length, 1);
});

test("verifyClaim passes when everything is the admin's or another user's and no index differs", () => {
  const problems = verifyClaim({
    userIds: [ADMIN, OTHER],
    collections: [coll({ name: "links", byOwner: { [ADMIN]: 3, [OTHER]: 1 } })],
    indexDiffs: [{ name: "links", toDrop: [], toCreate: [] }, { name: "AuthUser", toDrop: [], toCreate: [] }],
  });
  assert.deepEqual(problems, []);
});

test("verifyClaim names every remaining problem", () => {
  const problems = verifyClaim({
    userIds: [ADMIN],
    collections: [
      coll({ name: "links", unowned: 1 }),
      coll({ name: "tasks", nullOwner: 2 }),
      coll({ name: "recipes", byOwner: { [DEAD]: 1 }, wrongType: 1 }),
    ],
    indexDiffs: [
      { name: "linkGroups", toDrop: ["slug_1"], toCreate: [] },
      { name: "AuthUser", toDrop: [], toCreate: ["email_1"] },
    ],
  });
  assert.equal(problems.length, 6);
  assert.match(problems.join("\n"), /links.*1.*without an owner/);
  assert.match(problems.join("\n"), /tasks.*2.*null/);
  assert.match(problems.join("\n"), /recipes.*no AuthUser/);
  assert.match(problems.join("\n"), /recipes.*not a string/);
  assert.match(problems.join("\n"), /linkGroups.*drop.*slug_1/);
  assert.match(problems.join("\n"), /AuthUser.*create.*email_1/);
});

test("indexName follows MongoDB's default naming, or the name given", () => {
  assert.equal(indexName({ ownerId: 1, slug: 1 }), "ownerId_1_slug_1");
  assert.equal(indexName({ ownerId: 1, date: -1 }), "ownerId_1_date_-1");
  assert.equal(indexName({ ownerId: 1 }, { name: "mine" }), "mine");
});

test("orderIndexCreates builds first every new index whose name is free, and holds back name clashes", () => {
  const plain: [Record<string, unknown>, Record<string, unknown>] = [{ ownerId: 1, slug: 1 }, { unique: true }];
  const clash: [Record<string, unknown>, Record<string, unknown>] = [{ ownerId: 1 }, { unique: true }];
  const { first, afterDrops } = orderIndexCreates([plain, clash], ["_id_", "slug_1", "ownerId_1"]);
  assert.deepEqual(first, [plain]);
  assert.deepEqual(afterDrops, [clash]);
});
