// Decides what `claim-data` may do, from facts the script reads. Pure: no database access. Server-only.

export type UniqueFacts = {
  /** What the per-owner unique index is on, for messages: "slug", "isCash", ... */
  label: string;
  /** One entry per record, so repeats are kept. Unowned records, the admin's records, other owners' records. */
  unowned: string[];
  admin: string[];
  others: string[];
};

export type CollectionFacts = {
  name: string;
  unowned: number;
  /** Records owned by someone other than the admin. Never touched. */
  others: number;
  unique?: UniqueFacts;
};

export type ClaimFacts = {
  admin: { found: boolean; role?: string; disabled?: boolean };
  collections: CollectionFacts[];
};

export type ClaimPlan = {
  blockers: string[];
  changes: { name: string; count: number }[];
  total: number;
};

function repeated(values: string[]): string[] {
  const seen = new Set<string>();
  const again = new Set<string>();
  for (const v of values) (seen.has(v) ? again : seen).add(v);
  return [...again];
}

export function planClaim(facts: ClaimFacts): ClaimPlan {
  const blockers: string[] = [];
  const { admin } = facts;
  if (!admin.found) blockers.push("admin not found");
  else {
    if (admin.role !== "admin") blockers.push("that user is not an admin");
    if (admin.disabled) blockers.push("that admin is disabled");
  }

  for (const c of facts.collections) {
    const u = c.unique;
    if (!u || c.unowned === 0) continue;
    for (const v of repeated(u.unowned)) {
      blockers.push(`${c.name}: more than one unowned record with ${u.label} ${JSON.stringify(v)}`);
    }
    const mine = new Set(u.admin);
    const theirs = new Set(u.others);
    for (const v of new Set(u.unowned)) {
      if (mine.has(v)) blockers.push(`${c.name}: an unowned record and one the admin already owns share ${u.label} ${JSON.stringify(v)}`);
      else if (theirs.has(v)) blockers.push(`${c.name}: an unowned record and another owner's record share ${u.label} ${JSON.stringify(v)}`);
    }
  }

  const changes = facts.collections.filter((c) => c.unowned > 0).map((c) => ({ name: c.name, count: c.unowned }));
  return { blockers, changes, total: changes.reduce((n, c) => n + c.count, 0) };
}
