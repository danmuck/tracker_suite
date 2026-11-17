// Store implementation over the Mongoose models. Server-only.

import type { Model } from "mongoose";
import LinkGroup from "@/models/links/LinkGroup";
import Link from "@/models/links/Link";
import Listing from "@/models/future/Listing";
import Tour from "@/models/future/Tour";
import FutureSettings from "@/models/future/FutureSettings";
import type { Filter, Update } from "./query";
import { assertIdUnchanged, ConflictError } from "./store";
import type { BaseDoc, Collection, CollectionName, FindOptions, Store } from "./store";

type Doc = Record<string, unknown>;
// The models are strictly typed per collection; this layer treats documents as plain objects.
type AnyModel = Model<Doc>;

const MODELS: Record<CollectionName, AnyModel> = {
  linkGroups: LinkGroup as unknown as AnyModel,
  links: Link as unknown as AnyModel,
  listings: Listing as unknown as AnyModel,
  tours: Tour as unknown as AnyModel,
  futureSettings: FutureSettings as unknown as AnyModel,
};

const OBJECT_ID = /^[0-9a-f]{24}$/i;

// Plain JSON: string ids, ISO date strings, no undefined values.
function plain<T>(doc: unknown): T {
  return JSON.parse(JSON.stringify(doc)) as T;
}

type DuplicateKeyError = {
  keyPattern?: Record<string, unknown>;
  writeErrors?: { errmsg?: unknown }[];
};

/**
 * The field behind a duplicate-key error. Single-document writes carry `keyPattern`.
 * A bulkWrite throws MongoBulkWriteError (mongodb 7.0.0, lib/bulk/common.js), whose
 * WriteError entries keep only code, index, errmsg, errInfo and op: the server's keyPattern
 * is dropped, so the field is read from the errmsg ("... dup key: { slug: \"a\" }").
 */
export function duplicateKeyField(error: DuplicateKeyError): string {
  const fromPattern = Object.keys(error.keyPattern ?? {})[0];
  if (fromPattern) return fromPattern;
  const message = error.writeErrors?.[0]?.errmsg;
  const fromMessage = typeof message === "string" ? /dup key: \{ "?([\w$]+)"?:/.exec(message)?.[1] : undefined;
  return fromMessage ?? "unknown";
}

function rethrow(error: unknown, collection: string): never {
  if (typeof error === "object" && error !== null && (error as { code?: unknown }).code === 11000) {
    throw new ConflictError(collection, duplicateKeyField(error as DuplicateKeyError));
  }
  throw error;
}

class MongoCollection<T extends BaseDoc> implements Collection<T> {
  private model: AnyModel;
  private name: CollectionName;

  constructor(name: CollectionName) {
    this.name = name;
    this.model = MODELS[name];
  }

  private async guard<R>(run: () => Promise<R>): Promise<R> {
    try {
      return await run();
    } catch (error) {
      return rethrow(error, this.name);
    }
  }

  private async list(filter: Filter, options: FindOptions = {}): Promise<T[]> {
    let query = this.model.find(filter);
    if (options.sort) query = query.sort(options.sort);
    if (options.skip) query = query.skip(options.skip);
    if (options.limit !== undefined) query = query.limit(options.limit);
    if (options.select) query = query.select(options.select.join(" "));
    return plain<T[]>(await query.lean());
  }

  async findById(id: string): Promise<T | null> {
    if (!OBJECT_ID.test(id)) return null;
    const doc = await this.model.findById(id).lean();
    return doc ? plain<T>(doc) : null;
  }

  async findOne(filter: Filter = {}, options: FindOptions = {}): Promise<T | null> {
    return (await this.list(filter, { ...options, limit: 1 }))[0] ?? null;
  }

  async find(filter: Filter = {}, options?: FindOptions): Promise<T[]> {
    return this.list(filter, options);
  }

  async count(filter: Filter = {}): Promise<number> {
    return this.model.countDocuments(filter);
  }

  async exists(filter: Filter): Promise<boolean> {
    return (await this.model.exists(filter)) !== null;
  }

  async distinct(field: string, filter: Filter = {}): Promise<unknown[]> {
    return plain<unknown[]>(await this.model.distinct(field, filter));
  }

  async insert(doc: Omit<T, keyof BaseDoc>): Promise<T> {
    return (await this.insertMany([doc]))[0];
  }

  async insertMany(docs: Omit<T, keyof BaseDoc>[]): Promise<T[]> {
    if (docs.length === 0) return [];
    // Round-tripping through JSON drops undefined values so omitted fields are not persisted.
    const created = await this.guard(() => this.model.create(plain<Doc[]>(docs)));
    return plain<T[]>(created.map((d) => d.toObject()));
  }

  async updateById(id: string, update: Update): Promise<T | null> {
    assertIdUnchanged(update);
    if (!OBJECT_ID.test(id)) return null;
    const doc = await this.guard(() =>
      this.model.findByIdAndUpdate(id, update, { returnDocument: "after", runValidators: true }).lean(),
    );
    return doc ? plain<T>(doc) : null;
  }

  async updateOne(filter: Filter, update: Update, options?: { upsert?: boolean }): Promise<T | null> {
    assertIdUnchanged(update);
    const doc = await this.guard(() =>
      this.model
        .findOneAndUpdate(filter, update, {
          returnDocument: "after",
          runValidators: true,
          upsert: options?.upsert ?? false,
          setDefaultsOnInsert: true,
        })
        .lean(),
    );
    return doc ? plain<T>(doc) : null;
  }

  async updateMany(filter: Filter, update: Update): Promise<number> {
    assertIdUnchanged(update);
    const result = await this.guard(() => this.model.updateMany(filter, update, { runValidators: true }));
    return result.matchedCount;
  }

  async batchUpdate(ops: { filter: Filter; update: Update }[]): Promise<void> {
    for (const { update } of ops) assertIdUnchanged(update);
    if (ops.length === 0) return;
    // Mongoose 9.2.1 has no update-validator option for bulkWrite updateOne (castBulkWrite.js never runs them).
    await this.guard(() =>
      this.model.bulkWrite(ops.map(({ filter, update }) => ({ updateOne: { filter, update: update as never } }))),
    );
  }

  async deleteById(id: string): Promise<T | null> {
    if (!OBJECT_ID.test(id)) return null;
    const doc = await this.model.findByIdAndDelete(id).lean();
    return doc ? plain<T>(doc) : null;
  }

  async deleteMany(filter: Filter): Promise<number> {
    return (await this.model.deleteMany(filter)).deletedCount;
  }
}

export const mongoStore: Store = {
  collection<T extends BaseDoc>(name: CollectionName): Collection<T> {
    return new MongoCollection<T>(name);
  },
};
