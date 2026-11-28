// Wraps a Store so every query is confined to one owner's records.
// Pure: no framework, browser or server imports.
//
// This is the single enforcement point for per-user data. Handlers receive the wrapped store
// unchanged and never see or set ownerId: it is added to every filter and insert here, stripped
// from every record returned, and refused wherever a caller names it.

import { isId } from "./api";
import type { Filter, Sort, Update } from "./query";
import type { BaseDoc, Collection, CollectionName, FindOptions, Store } from "./store";

export const OWNER_FIELD = "ownerId";

const MANAGED = "ownerId is managed by the store";

function isOwnerPath(key: string): boolean {
  return key === OWNER_FIELD || key.startsWith(`${OWNER_FIELD}.`);
}

function refuseOwnerPath(key: string): void {
  if (isOwnerPath(key)) throw new Error(MANAGED);
}

// No key at any depth of a filter (through arrays and objects) may name the owner field.
function assertNoOwnerKey(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) assertNoOwnerKey(item);
  } else if (value !== null && typeof value === "object" && !(value instanceof Date)) {
    for (const [key, inner] of Object.entries(value)) {
      refuseOwnerPath(key);
      assertNoOwnerKey(inner);
    }
  }
}

const UPDATE_OPERATORS: ReadonlySet<string> = new Set(["$set", "$unset", "$inc", "$setOnInsert"]);

// An allowlist: any other top-level key (another operator, or a bare field that would replace
// the record) is refused, and no operator may name the owner field.
function assertUpdateClean(update: Update): void {
  for (const [operator, part] of Object.entries(update as Record<string, unknown>)) {
    if (!UPDATE_OPERATORS.has(operator)) throw new Error(`Unsupported update operator: ${operator}`);
    if (part !== null && typeof part === "object") for (const key of Object.keys(part)) refuseOwnerPath(key);
  }
}

function assertOptionsClean(options?: FindOptions): void {
  for (const key of options?.select ?? []) refuseOwnerPath(key);
  for (const key of Object.keys(options?.sort ?? ({} as Sort))) refuseOwnerPath(key);
}

function strip<T>(doc: T): T {
  if (doc === null || doc === undefined) return doc;
  const copy = { ...doc } as Record<string, unknown>;
  delete copy[OWNER_FIELD];
  return copy as T;
}

class ScopedCollection<T extends BaseDoc> implements Collection<T> {
  private inner: Collection<T>;
  private ownerId: string;

  constructor(inner: Collection<T>, ownerId: string) {
    this.inner = inner;
    this.ownerId = ownerId;
  }

  private scope(filter: Filter = {}): Filter {
    assertNoOwnerKey(filter);
    return { ...filter, [OWNER_FIELD]: this.ownerId };
  }

  private mine(id: string): Promise<boolean> {
    return this.inner.exists({ _id: id, [OWNER_FIELD]: this.ownerId });
  }

  async findById(id: string): Promise<T | null> {
    if (!isId(id)) return null;
    return strip(await this.inner.findOne({ _id: id, [OWNER_FIELD]: this.ownerId }));
  }

  async findOne(filter?: Filter, options?: FindOptions): Promise<T | null> {
    assertOptionsClean(options);
    return strip(await this.inner.findOne(this.scope(filter), options));
  }

  async find(filter?: Filter, options?: FindOptions): Promise<T[]> {
    assertOptionsClean(options);
    return (await this.inner.find(this.scope(filter), options)).map(strip);
  }

  async count(filter?: Filter): Promise<number> {
    return this.inner.count(this.scope(filter));
  }

  async exists(filter: Filter): Promise<boolean> {
    return this.inner.exists(this.scope(filter));
  }

  async distinct(field: string, filter?: Filter): Promise<unknown[]> {
    refuseOwnerPath(field);
    return this.inner.distinct(field, this.scope(filter));
  }

  private owned(doc: Omit<T, keyof BaseDoc>): Omit<T, keyof BaseDoc> {
    if (Object.hasOwn(doc, OWNER_FIELD)) throw new Error(MANAGED);
    return { ...doc, [OWNER_FIELD]: this.ownerId };
  }

  async insert(doc: Omit<T, keyof BaseDoc>): Promise<T> {
    return strip(await this.inner.insert(this.owned(doc)));
  }

  async insertMany(docs: Omit<T, keyof BaseDoc>[]): Promise<T[]> {
    const owned = docs.map((d) => this.owned(d));
    return (await this.inner.insertMany(owned)).map(strip);
  }

  async updateById(id: string, update: Update, options?: { timestamps?: boolean }): Promise<T | null> {
    assertUpdateClean(update);
    if (!isId(id) || !(await this.mine(id))) return null;
    return strip(await this.inner.updateById(id, update, options));
  }

  async updateOne(filter: Filter, update: Update, options?: { upsert?: boolean }): Promise<T | null> {
    assertUpdateClean(update);
    const scoped = this.scope(filter);
    const owned: Update = options?.upsert
      ? { ...update, $setOnInsert: { ...update.$setOnInsert, [OWNER_FIELD]: this.ownerId } }
      : update;
    return strip(await this.inner.updateOne(scoped, owned, options));
  }

  async updateMany(filter: Filter, update: Update): Promise<number> {
    assertUpdateClean(update);
    return this.inner.updateMany(this.scope(filter), update);
  }

  async batchUpdate(ops: { filter: Filter; update: Update }[]): Promise<void> {
    for (const { update } of ops) assertUpdateClean(update);
    return this.inner.batchUpdate(ops.map(({ filter, update }) => ({ filter: this.scope(filter), update })));
  }

  async deleteById(id: string): Promise<T | null> {
    if (!isId(id) || !(await this.mine(id))) return null;
    return strip(await this.inner.deleteById(id));
  }

  async deleteMany(filter: Filter): Promise<number> {
    return this.inner.deleteMany(this.scope(filter));
  }
}

export function scopedStore(store: Store, ownerId: string): Store {
  // undefined or null would match every record without an owner, and store inserts without one.
  if (typeof ownerId !== "string" || !isId(ownerId)) throw new Error("scopedStore needs an owner id (24 lowercase hex)");
  return {
    collection<T extends BaseDoc>(name: CollectionName): Collection<T> {
      return new ScopedCollection<T>(store.collection<T>(name), ownerId);
    },
  };
}
