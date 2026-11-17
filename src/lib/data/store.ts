// Storage-agnostic data interface shared by the browser and MongoDB implementations.
// Pure: no framework, browser or server imports.

import { isId } from "./api";
import type { Filter, Sort, Update } from "./query";

export interface BaseDoc {
  _id: string;
  createdAt: string;
  updatedAt: string;
}

export interface FindOptions {
  sort?: Sort;
  skip?: number;
  limit?: number;
  select?: string[];
}

export const COLLECTIONS = {
  linkGroups: { unique: ["slug"] },
  links: { unique: [] },
  listings: { unique: [] },
  tours: { unique: [] },
  futureSettings: { unique: ["key"] },
} as const;

export type CollectionName = keyof typeof COLLECTIONS;

export interface Collection<T extends BaseDoc> {
  findById(id: string): Promise<T | null>;
  findOne(filter?: Filter, options?: FindOptions): Promise<T | null>;
  find(filter?: Filter, options?: FindOptions): Promise<T[]>;
  count(filter?: Filter): Promise<number>;
  exists(filter: Filter): Promise<boolean>;
  distinct(field: string, filter?: Filter): Promise<unknown[]>;
  insert(doc: Omit<T, keyof BaseDoc>): Promise<T>;
  insertMany(docs: Omit<T, keyof BaseDoc>[]): Promise<T[]>;
  updateById(id: string, update: Update): Promise<T | null>; // returns the updated doc
  updateOne(filter: Filter, update: Update, options?: { upsert?: boolean }): Promise<T | null>;
  updateMany(filter: Filter, update: Update): Promise<number>; // count matched
  batchUpdate(ops: { filter: Filter; update: Update }[]): Promise<void>;
  deleteById(id: string): Promise<T | null>; // returns the deleted doc
  deleteMany(filter: Filter): Promise<number>;
}

export interface Store {
  collection<T extends BaseDoc>(name: CollectionName): Collection<T>;
}

export class ConflictError extends Error {
  collection: string;
  field: string;

  constructor(collection: string, field: string) {
    super(`Duplicate value for ${field} in ${collection}`);
    this.name = "ConflictError";
    this.collection = collection;
    this.field = field;
  }
}

// MongoDB refuses to change _id; both stores reject it up front with the same message.
export function assertIdUnchanged(update: Update): void {
  for (const part of [update.$set, update.$setOnInsert, update.$unset, update.$inc]) {
    if (part && Object.hasOwn(part, "_id")) throw new Error("_id cannot be changed");
  }
}

// An upsert that names an _id in its filter must name a valid one, in both stores.
export function assertUpsertFilter(filter: Filter): void {
  if (!Object.hasOwn(filter, "_id")) return;
  const value = filter._id;
  const isOperator =
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    !(value instanceof Date) &&
    Object.keys(value).some((k) => k.startsWith("$"));
  if (isOperator) return;
  if (typeof value !== "string" || !isId(value)) throw new Error("Invalid _id");
}
