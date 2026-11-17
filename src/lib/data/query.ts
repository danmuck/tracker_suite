// Evaluates a small subset of MongoDB filters, updates and sorts over plain objects.
// Pure: no framework, browser or server imports.

export type Filter = Record<string, unknown>;
export type Update = {
  $set?: Record<string, unknown>;
  $unset?: Record<string, unknown>;
  $inc?: Record<string, number>;
  $setOnInsert?: Record<string, unknown>;
};
export type Sort = Record<string, 1 | -1>;

type Doc = Record<string, unknown>;

// Dates are compared as ISO strings, which is how they are stored.
function normalize(value: unknown): unknown {
  return value instanceof Date ? value.toISOString() : value;
}

function isOperatorObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value) || value instanceof Date) return false;
  const keys = Object.keys(value);
  return keys.length > 0 && keys.some((k) => k.startsWith("$"));
}

// Equality where a null/undefined expectation matches missing or null, and
// an array-valued field matches when any element equals the expected value.
function valueEquals(actual: unknown, expected: unknown): boolean {
  const want = normalize(expected);
  if (want === null || want === undefined) return actual === null || actual === undefined;
  if (Array.isArray(actual)) return actual.some((item) => normalize(item) === want);
  return normalize(actual) === want;
}

function compare(actual: unknown, expected: unknown, test: (diff: number) => boolean): boolean {
  const a = normalize(actual);
  const b = normalize(expected);
  if (typeof a === "number" && typeof b === "number") return test(a - b);
  if (typeof a === "string" && typeof b === "string") return test(a < b ? -1 : a > b ? 1 : 0);
  return false;
}

function matchesOperators(actual: unknown, ops: Record<string, unknown>): boolean {
  for (const [op, arg] of Object.entries(ops)) {
    switch (op) {
      case "$gt":
        if (!compare(actual, arg, (d) => d > 0)) return false;
        break;
      case "$gte":
        if (!compare(actual, arg, (d) => d >= 0)) return false;
        break;
      case "$lt":
        if (!compare(actual, arg, (d) => d < 0)) return false;
        break;
      case "$lte":
        if (!compare(actual, arg, (d) => d <= 0)) return false;
        break;
      case "$ne":
        if (valueEquals(actual, arg)) return false;
        break;
      case "$in":
        if (!Array.isArray(arg)) throw new Error("$in needs an array");
        if (!arg.some((candidate) => valueEquals(actual, candidate))) return false;
        break;
      case "$exists":
        if ((actual !== undefined) !== Boolean(arg)) return false;
        break;
      case "$regex": {
        const re = new RegExp(String(arg), typeof ops.$options === "string" ? ops.$options : undefined);
        if (typeof actual !== "string" || !re.test(actual)) return false;
        break;
      }
      case "$options":
        break; // consumed by $regex
      default:
        throw new Error(`Unsupported filter operator: ${op}`);
    }
  }
  return true;
}

function assertFlat(key: string): void {
  if (key.includes(".")) throw new Error(`Dotted paths are not supported: ${key}`);
}

// Checked up front so a dotted key fails even when an earlier condition already decided the match.
function assertFilterFlat(filter: Filter): void {
  for (const [key, condition] of Object.entries(filter)) {
    if (key === "$or") for (const sub of orBranches(condition)) assertFilterFlat(sub);
    else if (!key.startsWith("$")) assertFlat(key);
  }
}

function orBranches(condition: unknown): Filter[] {
  if (!Array.isArray(condition)) throw new Error("$or needs an array");
  return condition as Filter[];
}

export function matches(doc: Doc, filter: Filter): boolean {
  assertFilterFlat(filter);
  return matchesFlat(doc, filter);
}

function matchesFlat(doc: Doc, filter: Filter): boolean {
  for (const [key, condition] of Object.entries(filter)) {
    if (key === "$or") {
      if (!orBranches(condition).some((sub) => matchesFlat(doc, sub))) return false;
    } else if (key.startsWith("$")) {
      throw new Error(`Unsupported filter operator: ${key}`);
    } else if (isOperatorObject(condition)) {
      if (!matchesOperators(doc[key], condition)) return false;
    } else if (!valueEquals(doc[key], condition)) {
      return false;
    }
  }
  return true;
}

export function applyUpdate<T extends Doc>(doc: T, update: Update, inserting = false): T {
  for (const part of [update.$setOnInsert, update.$set, update.$inc, update.$unset]) {
    for (const key of Object.keys(part ?? {})) assertFlat(key);
  }
  const next: Doc = { ...doc };
  if (inserting && update.$setOnInsert) Object.assign(next, update.$setOnInsert);
  if (update.$set) Object.assign(next, update.$set);
  if (update.$inc) {
    for (const [key, by] of Object.entries(update.$inc)) {
      next[key] = (typeof next[key] === "number" ? (next[key] as number) : 0) + by;
    }
  }
  if (update.$unset) {
    for (const key of Object.keys(update.$unset)) delete next[key];
  }
  return next as T;
}

export function sortDocs<T extends Doc>(docs: T[], sort: Sort): T[] {
  const keys = Object.entries(sort);
  return [...docs].sort((a, b) => {
    for (const [key, dir] of keys) {
      const x = normalize(a[key]) as string | number | null | undefined;
      const y = normalize(b[key]) as string | number | null | undefined;
      // null and missing are the same value, and sort first ascending, as in Mongo.
      const xMissing = x === undefined || x === null;
      const yMissing = y === undefined || y === null;
      if (x === y || (xMissing && yMissing)) continue;
      if (xMissing) return -dir;
      if (yMissing) return dir;
      return (x < y ? -1 : 1) * dir;
    }
    return 0;
  });
}

export function selectFields<T extends Doc>(doc: T, fields: string[]): Partial<T> {
  const out: Doc = {};
  if ("_id" in doc) out._id = doc._id;
  for (const field of fields) if (field in doc) out[field] = doc[field];
  return out as Partial<T>;
}
