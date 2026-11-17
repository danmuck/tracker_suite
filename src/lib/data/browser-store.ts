// Store implementation over a localStorage-like object.
// Pure: only touches the StorageLike it is given.

import { applyUpdate, matches, selectFields, sortDocs } from "./query";
import type { Filter, Update } from "./query";
import { isId } from "./api";
import { assertIdUnchanged, assertUpsertFilter, COLLECTIONS, ConflictError } from "./store";
import type { BaseDoc, Collection, CollectionName, FindOptions, Store } from "./store";

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  key(index: number): string | null;
  readonly length: number;
}

export const DATA_VERSION = 1;

/** Map-backed storage for when browser storage is unavailable; data lasts for the page session only. */
export function createMemoryStorage(): StorageLike {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem(key, value) {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
    key: (index) => [...map.keys()][index] ?? null,
    get length() {
      return map.size;
    },
  };
}

const PREFIX = "ts:data:";
const VERSION_KEY = `${PREFIX}version`;

type Doc = Record<string, unknown>;

export function newId(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

// Drops undefined values and detaches from caller-owned objects, as JSON does.
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isOperatorObject(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    !(value instanceof Date) &&
    Object.keys(value).some((k) => k.startsWith("$"))
  );
}

function isPlainObject(value: unknown): value is Doc {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// _id and createdAt never change after insert (callers reject updates to _id first).
// With `touch` false the stored updatedAt is kept as it was.
function applyKeepingImmutable(doc: Doc, update: Update, now: string, touch = true): Doc {
  return clone({
    ...applyUpdate(doc, update),
    _id: doc._id,
    createdAt: doc.createdAt,
    updatedAt: touch ? now : doc.updatedAt,
  });
}

function equalityFields(filter: Filter): Doc {
  const out: Doc = {};
  for (const [key, value] of Object.entries(filter)) {
    if (!key.startsWith("$") && !isOperatorObject(value)) out[key] = value;
  }
  return out;
}

export class BrowserStore implements Store {
  private storage: StorageLike;
  private clock: () => Date;
  private cache = new Map<CollectionName, Doc[]>();

  /** `clock` stamps createdAt / updatedAt (once per write call); tests pass a controlled one. */
  constructor(storage: StorageLike, clock: () => Date = () => new Date()) {
    this.storage = storage;
    this.clock = clock;
    if (storage.getItem(VERSION_KEY) !== String(DATA_VERSION)) {
      this.removeDataKeys(true);
      try {
        storage.setItem(VERSION_KEY, String(DATA_VERSION));
      } catch {
        // Storage unavailable: writes will report it when they are attempted.
      }
    }
  }

  collection<T extends BaseDoc>(name: CollectionName): Collection<T> {
    return new BrowserCollection<T>(this, name);
  }

  /**
   * Drops every cached collection, so the next read of each comes from storage and sees what
   * other tabs wrote since. Browser-mode requests call it before they start; the cost is one
   * JSON.parse per collection a request touches.
   */
  refresh(): void {
    this.cache.clear();
  }

  invalidate(collection?: CollectionName): void {
    if (collection) this.cache.delete(collection);
    else this.cache.clear();
  }

  clear(): void {
    this.removeDataKeys(false);
    this.cache.clear();
  }

  /** @internal The createdAt / updatedAt stamp for one write call. */
  timestamp(): string {
    return this.clock().toISOString();
  }

  /** @internal */
  read(name: CollectionName): Doc[] {
    let docs = this.cache.get(name);
    if (!docs) {
      docs = [];
      try {
        const parsed: unknown = JSON.parse(this.storage.getItem(PREFIX + name) ?? "[]");
        if (Array.isArray(parsed)) docs = parsed.filter(isPlainObject);
      } catch {
        // Corrupt JSON reads as an empty collection.
      }
      this.cache.set(name, docs);
    }
    return docs;
  }

  /** @internal Persists `next`; the in-memory copy is replaced only once storage accepts it. */
  write(name: CollectionName, next: Doc[]): void {
    try {
      this.storage.setItem(PREFIX + name, JSON.stringify(next));
    } catch {
      throw new Error("Browser storage is full or unavailable");
    }
    this.cache.set(name, next);
  }

  private removeDataKeys(includeVersion: boolean): void {
    const keys: string[] = [];
    for (let i = 0; i < this.storage.length; i++) {
      const key = this.storage.key(i);
      if (key && key.startsWith(PREFIX) && (includeVersion || key !== VERSION_KEY)) keys.push(key);
    }
    for (const key of keys) this.storage.removeItem(key);
  }
}

class BrowserCollection<T extends BaseDoc> implements Collection<T> {
  private store: BrowserStore;
  private name: CollectionName;

  constructor(store: BrowserStore, name: CollectionName) {
    this.store = store;
    this.name = name;
  }

  private docs(): Doc[] {
    return this.store.read(this.name);
  }

  private query(filter: Filter = {}, options: FindOptions = {}): Doc[] {
    // Array slice would quietly accept NaN, negative or fractional paging values and differ
    // from MongoDB, so refuse them before any work.
    for (const [name, value] of [["skip", options.skip], ["limit", options.limit]] as const) {
      if (value !== undefined && !(Number.isInteger(value) && value >= 0)) {
        throw new Error(`Unsupported ${name}: ${value}`);
      }
    }
    let result = this.docs().filter((d) => matches(d, filter));
    if (options.sort) result = sortDocs(result, options.sort);
    const skip = options.skip ?? 0;
    const limit = options.limit;
    // As in MongoDB, 0 means no limit.
    result = limit === undefined || limit === 0 ? result.slice(skip) : result.slice(skip, skip + limit);
    return result;
  }

  private out(doc: Doc, select?: string[]): T {
    return clone(select ? selectFields(doc, select) : doc) as unknown as T;
  }

  // Checks only the inserted or changed docs against the rest, so an old duplicate
  // already in storage does not block writes to unrelated docs, nor to the duplicate itself
  // as long as the write leaves the unique field alone (`before` is the doc as it was).
  private checkUnique(all: Doc[], changed: { doc: Doc; before?: Doc }[]): void {
    for (const field of COLLECTIONS[this.name].unique as readonly string[]) {
      for (const { doc, before } of changed) {
        const value = doc[field];
        if (value === undefined) continue;
        if (before && before[field] === value) continue;
        if (all.some((other) => other !== doc && other[field] === value)) {
          throw new ConflictError(this.name, field);
        }
      }
    }
  }

  private build(input: Doc, now: string, id = newId()): Doc {
    return clone({ ...input, _id: id, createdAt: now, updatedAt: now });
  }

  async findById(id: string): Promise<T | null> {
    const doc = this.docs().find((d) => d._id === id);
    return doc ? this.out(doc) : null;
  }

  async findOne(filter?: Filter, options?: FindOptions): Promise<T | null> {
    const doc = this.query(filter, options)[0];
    return doc ? this.out(doc, options?.select) : null;
  }

  async find(filter?: Filter, options?: FindOptions): Promise<T[]> {
    return this.query(filter, options).map((d) => this.out(d, options?.select));
  }

  async count(filter?: Filter): Promise<number> {
    return this.query(filter).length;
  }

  async exists(filter: Filter): Promise<boolean> {
    return this.docs().some((d) => matches(d, filter));
  }

  async distinct(field: string, filter?: Filter): Promise<unknown[]> {
    const values: unknown[] = [];
    for (const doc of this.query(filter)) {
      const value = doc[field];
      for (const v of Array.isArray(value) ? value : [value]) {
        if (v !== undefined && !values.includes(v)) values.push(clone(v));
      }
    }
    return values;
  }

  async insert(doc: Omit<T, keyof BaseDoc>): Promise<T> {
    return (await this.insertMany([doc]))[0];
  }

  async insertMany(docs: Omit<T, keyof BaseDoc>[]): Promise<T[]> {
    const now = this.store.timestamp();
    const created = docs.map((d) => this.build(d as Doc, now));
    const next = [...this.docs(), ...created];
    this.checkUnique(next, created.map((doc) => ({ doc })));
    this.store.write(this.name, next);
    return created.map((d) => this.out(d));
  }

  async updateById(id: string, update: Update, options?: { timestamps?: boolean }): Promise<T | null> {
    return this.applyOne({ _id: id }, update, {}, options?.timestamps !== false);
  }

  async updateOne(filter: Filter, update: Update, options?: { upsert?: boolean }): Promise<T | null> {
    return this.applyOne(filter, update, options ?? {}, true);
  }

  private async applyOne(
    filter: Filter,
    update: Update,
    options: { upsert?: boolean },
    touch: boolean,
  ): Promise<T | null> {
    assertIdUnchanged(update);
    if (options.upsert) assertUpsertFilter(filter);
    const now = this.store.timestamp();
    const current = this.docs();
    const index = current.findIndex((d) => matches(d, filter));
    let next: Doc[];
    let result: Doc;
    let before: Doc | undefined;
    if (index === -1) {
      if (!options.upsert) return null;
      // As in MongoDB, an upsert keeps an ObjectId-shaped _id from the filter.
      const id = typeof filter._id === "string" && isId(filter._id) ? filter._id : undefined;
      result = this.build(applyUpdate(equalityFields(filter), update, true), now, id);
      next = [...current, result];
    } else {
      before = current[index];
      result = applyKeepingImmutable(before, update, now, touch);
      next = current.map((d, i) => (i === index ? result : d));
    }
    this.checkUnique(next, [{ doc: result, before }]);
    this.store.write(this.name, next);
    return this.out(result);
  }

  async updateMany(filter: Filter, update: Update): Promise<number> {
    assertIdUnchanged(update);
    const now = this.store.timestamp();
    const changed: { doc: Doc; before: Doc }[] = [];
    const next = this.docs().map((d) => {
      if (!matches(d, filter)) return d;
      const updated = applyKeepingImmutable(d, update, now);
      changed.push({ doc: updated, before: d });
      return updated;
    });
    if (changed.length === 0) return 0;
    this.checkUnique(next, changed);
    this.store.write(this.name, next);
    return changed.length;
  }

  async batchUpdate(ops: { filter: Filter; update: Update }[]): Promise<void> {
    for (const { update } of ops) assertIdUnchanged(update);
    const now = this.store.timestamp();
    const original = this.docs();
    let next = original;
    const changedIndexes = new Set<number>();
    for (const { filter, update } of ops) {
      // First match only, as bulkWrite updateOne does in the Mongo store.
      const index = next.findIndex((d) => matches(d, filter));
      if (index === -1) continue;
      next = next.map((d, i) => (i === index ? applyKeepingImmutable(d, update, now) : d));
      changedIndexes.add(index);
    }
    this.checkUnique(
      next,
      [...changedIndexes].map((i) => ({ doc: next[i], before: original[i] })),
    );
    this.store.write(this.name, next);
  }

  async deleteById(id: string): Promise<T | null> {
    const current = this.docs();
    const doc = current.find((d) => d._id === id);
    if (!doc) return null;
    this.store.write(
      this.name,
      current.filter((d) => d !== doc),
    );
    return this.out(doc);
  }

  async deleteMany(filter: Filter): Promise<number> {
    const current = this.docs();
    const next = current.filter((d) => !matches(d, filter));
    const removed = current.length - next.length;
    if (removed > 0) this.store.write(this.name, next);
    return removed;
  }
}
