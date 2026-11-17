// Store implementation over a localStorage-like object.
// Pure: only touches the StorageLike it is given.

import { applyUpdate, matches, selectFields, sortDocs } from "./query";
import type { Filter, Update } from "./query";
import { COLLECTIONS, ConflictError } from "./store";
import type { BaseDoc, Collection, CollectionName, FindOptions, Store } from "./store";

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  key(index: number): string | null;
  readonly length: number;
}

export const DATA_VERSION = 1;

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

function equalityFields(filter: Filter): Doc {
  const out: Doc = {};
  for (const [key, value] of Object.entries(filter)) {
    if (!key.startsWith("$") && !isOperatorObject(value)) out[key] = value;
  }
  return out;
}

export class BrowserStore implements Store {
  private storage: StorageLike;
  private cache = new Map<CollectionName, Doc[]>();

  constructor(storage: StorageLike) {
    this.storage = storage;
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

  invalidate(collection?: CollectionName): void {
    if (collection) this.cache.delete(collection);
    else this.cache.clear();
  }

  clear(): void {
    this.removeDataKeys(false);
    this.cache.clear();
  }

  /** @internal */
  read(name: CollectionName): Doc[] {
    let docs = this.cache.get(name);
    if (!docs) {
      docs = [];
      try {
        const parsed: unknown = JSON.parse(this.storage.getItem(PREFIX + name) ?? "[]");
        if (Array.isArray(parsed)) docs = parsed as Doc[];
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
    let result = this.docs().filter((d) => matches(d, filter));
    if (options.sort) result = sortDocs(result, options.sort);
    const skip = options.skip ?? 0;
    result = options.limit === undefined ? result.slice(skip) : result.slice(skip, skip + options.limit);
    return result;
  }

  private out(doc: Doc, select?: string[]): T {
    return clone(select ? selectFields(doc, select) : doc) as unknown as T;
  }

  private checkUnique(all: Doc[]): void {
    for (const field of COLLECTIONS[this.name].unique as readonly string[]) {
      const seen = new Set<unknown>();
      for (const doc of all) {
        const value = doc[field];
        if (value === undefined) continue;
        if (seen.has(value)) throw new ConflictError(this.name, field);
        seen.add(value);
      }
    }
  }

  private build(input: Doc, now: string): Doc {
    return clone({ ...input, _id: newId(), createdAt: now, updatedAt: now });
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
    const now = new Date().toISOString();
    const created = docs.map((d) => this.build(d as Doc, now));
    const next = [...this.docs(), ...created];
    this.checkUnique(next);
    this.store.write(this.name, next);
    return created.map((d) => this.out(d));
  }

  async updateById(id: string, update: Update): Promise<T | null> {
    return this.updateOne({ _id: id }, update);
  }

  async updateOne(filter: Filter, update: Update, options?: { upsert?: boolean }): Promise<T | null> {
    const now = new Date().toISOString();
    const current = this.docs();
    const index = current.findIndex((d) => matches(d, filter));
    let next: Doc[];
    let result: Doc;
    if (index === -1) {
      if (!options?.upsert) return null;
      result = this.build(applyUpdate(equalityFields(filter), update, true), now);
      next = [...current, result];
    } else {
      result = clone({ ...applyUpdate(current[index], update), updatedAt: now });
      next = current.map((d, i) => (i === index ? result : d));
    }
    this.checkUnique(next);
    this.store.write(this.name, next);
    return this.out(result);
  }

  async updateMany(filter: Filter, update: Update): Promise<number> {
    const now = new Date().toISOString();
    let changed = 0;
    const next = this.docs().map((d) => {
      if (!matches(d, filter)) return d;
      changed++;
      return clone({ ...applyUpdate(d, update), updatedAt: now });
    });
    if (changed === 0) return 0;
    this.checkUnique(next);
    this.store.write(this.name, next);
    return changed;
  }

  async batchUpdate(ops: { filter: Filter; update: Update }[]): Promise<void> {
    const now = new Date().toISOString();
    let next = this.docs();
    for (const { filter, update } of ops) {
      next = next.map((d) => (matches(d, filter) ? clone({ ...applyUpdate(d, update), updatedAt: now }) : d));
    }
    this.checkUnique(next);
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
