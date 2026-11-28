// Decides what `claim-data` may do, and checks what it did, from facts the script reads.
// Pure: no database access. Server-only.

/** One row of a `$group` on `{ owner: "$ownerId", type: { $type: "$ownerId" } }`. */
export type OwnerGroup = { owner: unknown; type: string; count: number };

export type OwnerFacts = {
  /** Records with no ownerId field: the ones claim-data gives to the admin. */
  unowned: number;
  /** Records whose ownerId is null: no owner, and no scoped query can ever reach them. */
  nullOwner: number;
  /** Records whose ownerId is neither missing, null nor a string. */
  wrongType: number;
  /** Records per string owner id, the admin's included. */
  byOwner: Record<string, number>;
};

export type UniqueFacts = {
  /** What the per-owner unique index is on, for messages: "slug", "isCash", ... */
  label: string;
  /** One entry per record, so repeats are kept. Unowned records and the admin's records. */
  unowned: string[];
  admin: string[];
};

export type CollectionFacts = OwnerFacts & { name: string; unique?: UniqueFacts };

export type ClaimFacts = {
  admin: { found: boolean; id?: string; role?: string; disabled?: boolean };
  /** Every AuthUser id. */
  userIds: string[];
  collections: CollectionFacts[];
};

export type Ownership = {
  name: string;
  unowned: number;
  admin: number;
  /** Owned by an existing AuthUser other than the admin. Never touched. */
  otherUsers: number;
  nullOwner: number;
  /** Owned by an id with no AuthUser, or by a value that is not a string. */
  unknownOwner: number;
};

export type ClaimPlan = {
  blockers: string[];
  changes: { name: string; count: number }[];
  total: number;
  ownership: Ownership[];
};

export function foldOwners(groups: OwnerGroup[]): OwnerFacts {
  const facts: OwnerFacts = { unowned: 0, nullOwner: 0, wrongType: 0, byOwner: {} };
  for (const { owner, type, count } of groups) {
    if (type === "missing") facts.unowned += count;
    else if (type === "null") facts.nullOwner += count;
    else if (type === "string" && typeof owner === "string") facts.byOwner[owner] = (facts.byOwner[owner] ?? 0) + count;
    else facts.wrongType += count;
  }
  return facts;
}

function repeated(values: string[]): string[] {
  const seen = new Set<string>();
  const again = new Set<string>();
  for (const v of values) (seen.has(v) ? again : seen).add(v);
  return [...again];
}

/** Owner ids in byOwner that match no AuthUser. */
function deadOwners(c: OwnerFacts, users: Set<string>): string[] {
  return Object.keys(c.byOwner).filter((id) => !users.has(id)).sort();
}

/** Problems with who owns what that block claiming and fail the verification pass. */
function ownerProblems(c: OwnerFacts & { name: string }, users: Set<string>): string[] {
  const out: string[] = [];
  if (c.nullOwner > 0) out.push(`${c.name}: ${c.nullOwner} record(s) with ownerId null`);
  const dead = deadOwners(c, users);
  if (dead.length > 0) {
    const n = dead.reduce((sum, id) => sum + c.byOwner[id], 0);
    out.push(`${c.name}: ${n} record(s) owned by an id with no AuthUser (${dead.join(", ")})`);
  }
  if (c.wrongType > 0) out.push(`${c.name}: ${c.wrongType} record(s) whose ownerId is not a string`);
  return out;
}

export function planClaim(facts: ClaimFacts): ClaimPlan {
  const blockers: string[] = [];
  const { admin } = facts;
  if (!admin.found) blockers.push("admin not found");
  else {
    if (admin.role !== "admin") blockers.push("that user is not an admin");
    if (admin.disabled) blockers.push("that admin is disabled");
  }
  const adminId = admin.found ? admin.id : undefined;
  const users = new Set(facts.userIds);

  const ownership: Ownership[] = [];
  for (const c of facts.collections) {
    blockers.push(...ownerProblems(c, users));
    const dead = new Set(deadOwners(c, users));
    let otherUsers = 0;
    let unknownOwner = c.wrongType;
    for (const [id, n] of Object.entries(c.byOwner)) {
      if (id === adminId) continue;
      if (dead.has(id)) unknownOwner += n;
      else otherUsers += n;
    }
    ownership.push({
      name: c.name,
      unowned: c.unowned,
      admin: adminId ? (c.byOwner[adminId] ?? 0) : 0,
      otherUsers,
      nullOwner: c.nullOwner,
      unknownOwner,
    });

    // Checked whether or not anything is unowned, so a re-run after a failed unique index build
    // names what made it fail. Uniqueness is per owner: other owners' values are not compared.
    const u = c.unique;
    if (!u) continue;
    for (const v of repeated(u.unowned)) {
      blockers.push(`${c.name}: more than one unowned record with ${u.label} ${JSON.stringify(v)}`);
    }
    for (const v of repeated(u.admin)) {
      blockers.push(`${c.name}: the admin has more than one record with ${u.label} ${JSON.stringify(v)}`);
    }
    const mine = new Set(u.admin);
    for (const v of new Set(u.unowned)) {
      if (mine.has(v)) blockers.push(`${c.name}: an unowned record and one the admin already owns share ${u.label} ${JSON.stringify(v)}`);
    }
  }

  const changes = facts.collections.filter((c) => c.unowned > 0).map((c) => ({ name: c.name, count: c.unowned }));
  return { blockers, changes, total: changes.reduce((n, c) => n + c.count, 0), ownership };
}

export type IndexDiff = { name: string; toDrop: string[]; toCreate: string[] };

/**
 * The checks after `--apply`: nothing left without an owner, no null or unknown owners, and no
 * index that syncIndexes would still drop or create. Returns the problems; empty means verified.
 * Records of other existing users are allowed.
 */
export function verifyClaim(input: { userIds: string[]; collections: CollectionFacts[]; indexDiffs: IndexDiff[] }): string[] {
  const users = new Set(input.userIds);
  const problems: string[] = [];
  for (const c of input.collections) {
    if (c.unowned > 0) problems.push(`${c.name}: ${c.unowned} record(s) still without an owner`);
    problems.push(...ownerProblems(c, users));
  }
  for (const d of input.indexDiffs) {
    if (d.toDrop.length > 0) problems.push(`${d.name}: indexes still to drop: ${d.toDrop.join(", ")}`);
    if (d.toCreate.length > 0) problems.push(`${d.name}: indexes still to create: ${d.toCreate.join(", ")}`);
  }
  return problems;
}

type IndexSpec = [Record<string, unknown>, Record<string, unknown> | undefined];

/** The name MongoDB gives an index: options.name, or each key and direction joined by "_". */
export function indexName(keys: Record<string, unknown>, options?: { name?: unknown }): string {
  if (typeof options?.name === "string") return options.name;
  return Object.entries(keys).map(([k, v]) => `${k}_${String(v)}`).join("_");
}

/**
 * Splits the indexes to create: those whose name is free are built before any index is dropped,
 * so the old unique indexes keep guarding the data until the new ones exist. One whose name is
 * taken (an existing index with the same keys but other options) can only be built after that
 * index is dropped; syncIndexes does that.
 */
export function orderIndexCreates<T extends IndexSpec>(toCreate: T[], existingNames: string[]): { first: T[]; afterDrops: T[] } {
  const taken = new Set(existingNames);
  const first: T[] = [];
  const afterDrops: T[] = [];
  for (const spec of toCreate) (taken.has(indexName(spec[0], spec[1])) ? afterDrops : first).push(spec);
  return { first, afterDrops };
}
