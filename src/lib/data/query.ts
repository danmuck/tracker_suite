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

function isPlainObject(value: unknown): value is Doc {
  return value !== null && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date);
}

function splitPath(key: string): string[] {
  const segments = key.split(".");
  if (segments.some((s) => s === "")) throw new Error(`Invalid path: ${key}`);
  return segments;
}

// Reads a key, following dots through nested plain objects. A missing, null or
// non-object intermediate reads as undefined; an array on the way throws.
function getPath(doc: Doc, key: string): unknown {
  if (!key.includes(".")) return doc[key];
  const segments = splitPath(key);
  let current: unknown = doc;
  for (let i = 0; i < segments.length; i++) {
    if (!isPlainObject(current)) return undefined;
    const value = current[segments[i]];
    if (i < segments.length - 1 && Array.isArray(value)) throw new Error(`Dotted path crosses an array: ${key}`);
    current = value;
  }
  return current;
}

// Copies the objects along `key` (never mutating the originals) and returns the
// object that holds the leaf. With create, missing intermediates become objects;
// an existing non-object intermediate throws. Without create, a missing
// intermediate returns null (nothing to do).
function parentForWrite(root: Doc, key: string, create: boolean): { parent: Doc; leaf: string } | null {
  const segments = splitPath(key);
  let current = root;
  for (let i = 0; i < segments.length - 1; i++) {
    const value = current[segments[i]];
    if (Array.isArray(value)) throw new Error(`Dotted path crosses an array: ${key}`);
    if (value === undefined) {
      if (!create) return null;
      const made: Doc = {};
      current[segments[i]] = made;
      current = made;
    } else if (isPlainObject(value)) {
      const copy = { ...value };
      current[segments[i]] = copy;
      current = copy;
    } else {
      throw new Error(`${create ? "Cannot create" : "Cannot unset"} field in ${key}`);
    }
  }
  return { parent: current, leaf: segments[segments.length - 1] };
}

function setPath(root: Doc, key: string, value: unknown): void {
  if (!key.includes(".")) {
    root[key] = value;
    return;
  }
  const target = parentForWrite(root, key, true);
  if (target) target.parent[target.leaf] = value;
}

function unsetPath(root: Doc, key: string): void {
  if (!key.includes(".")) {
    delete root[key];
    return;
  }
  const target = parentForWrite(root, key, false);
  if (target) delete target.parent[target.leaf];
}

// MongoDB rejects an update that touches both a path and one of its parents.
function assertNoConflicts(keys: string[]): void {
  for (let i = 0; i < keys.length; i++) {
    for (let j = 0; j < keys.length; j++) {
      const a = keys[i];
      const b = keys[j];
      if (i < j && a === b) throw new Error(`Conflicting update paths: ${a} and ${b}`);
      if (b.startsWith(`${a}.`)) throw new Error(`Conflicting update paths: ${a} and ${b}`);
    }
  }
}

function branches(op: "$or" | "$and", condition: unknown): Filter[] {
  if (!Array.isArray(condition)) throw new Error(`${op} needs an array`);
  return condition as Filter[];
}

const FIELD_OPERATORS = new Set(["$gt", "$gte", "$lt", "$lte", "$ne", "$in", "$exists", "$regex", "$options"]);

// MongoDB compares objects and arrays as whole values; this evaluator does not, so they are refused.
function assertScalarOperand(value: unknown, key: string): void {
  if (Array.isArray(value)) throw new Error(`Array equality filters are not supported: ${key}`);
  if (isPlainObject(value)) throw new Error(`Object equality filters are not supported: ${key}`);
}

// Checks the shape of the whole filter before anything is evaluated, so a
// malformed filter throws whatever the document is.
function validateFilter(filter: Filter): void {
  if (!isPlainObject(filter)) throw new Error("A filter must be an object");
  for (const [key, condition] of Object.entries(filter)) {
    if (key === "$or" || key === "$and") {
      for (const sub of branches(key, condition)) validateFilter(sub);
    } else if (key.startsWith("$")) {
      throw new Error(`Unsupported filter operator: ${key}`);
    } else {
      if (key.includes(".")) splitPath(key);
      if (!isOperatorObject(condition)) {
        assertScalarOperand(condition, key);
        continue;
      }
      for (const [op, arg] of Object.entries(condition)) {
        if (!FIELD_OPERATORS.has(op)) throw new Error(`Unsupported filter operator: ${op}`);
        if (op === "$in") {
          if (!Array.isArray(arg)) throw new Error("$in needs an array");
          for (const candidate of arg) assertScalarOperand(candidate, key);
        }
        if (op === "$ne") assertScalarOperand(arg, key);
        if (op === "$regex") new RegExp(String(arg), typeof condition.$options === "string" ? condition.$options : undefined);
      }
    }
  }
}

export function matches(doc: Doc, filter: Filter): boolean {
  validateFilter(filter);
  return matchesValid(doc, filter);
}

function matchesValid(doc: Doc, filter: Filter): boolean {
  for (const [key, condition] of Object.entries(filter)) {
    if (key === "$or") {
      if (!branches("$or", condition).some((sub) => matchesValid(doc, sub))) return false;
    } else if (key === "$and") {
      if (!branches("$and", condition).every((sub) => matchesValid(doc, sub))) return false;
    } else if (key.startsWith("$")) {
      throw new Error(`Unsupported filter operator: ${key}`);
    } else if (isOperatorObject(condition)) {
      if (!matchesOperators(getPath(doc, key), condition)) return false;
    } else if (!valueEquals(getPath(doc, key), condition)) {
      return false;
    }
  }
  return true;
}

export function applyUpdate<T extends Doc>(doc: T, update: Update, inserting = false): T {
  assertNoConflicts([update.$setOnInsert, update.$set, update.$inc, update.$unset].flatMap((part) => Object.keys(part ?? {})));
  const next: Doc = { ...doc };
  if (inserting && update.$setOnInsert) {
    for (const [key, value] of Object.entries(update.$setOnInsert)) setPath(next, key, value);
  }
  if (update.$set) {
    for (const [key, value] of Object.entries(update.$set)) setPath(next, key, value);
  }
  if (update.$inc) {
    for (const [key, by] of Object.entries(update.$inc)) {
      const current = getPath(next, key);
      setPath(next, key, (typeof current === "number" ? current : 0) + by);
    }
  }
  if (update.$unset) {
    for (const key of Object.keys(update.$unset)) unsetPath(next, key);
  }
  return next as T;
}

export function sortDocs<T extends Doc>(docs: T[], sort: Sort): T[] {
  const keys = Object.entries(sort);
  return [...docs].sort((a, b) => {
    for (const [key, dir] of keys) {
      const x = normalize(getPath(a, key)) as string | number | null | undefined;
      const y = normalize(getPath(b, key)) as string | number | null | undefined;
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
