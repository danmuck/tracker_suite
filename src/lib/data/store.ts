// Storage-agnostic data interface shared by the browser and MongoDB implementations.
// Pure: no framework, browser or server imports.

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
