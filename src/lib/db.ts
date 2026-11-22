import mongoose from "mongoose";
import Account from "@/models/Account";
import { modulesEnabled } from "@/lib/suite-mode";

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
  seeded: boolean;
}

declare global {
  // eslint-disable-next-line no-var
  var mongoose: MongooseCache | undefined;
}

const cached: MongooseCache = global.mongoose ?? { conn: null, promise: null, seeded: false };

if (!global.mongoose) {
  global.mongoose = cached;
}

export async function connectDB() {
  // Module data is never reachable in public mode, whatever route asked.
  if (!modulesEnabled()) {
    throw new Error("Database access is disabled outside local mode");
  }

  if (cached.conn) return cached.conn;

  if (!cached.promise) {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
      throw new Error("Please define the MONGODB_URI environment variable in .env.local");
    }
    cached.promise = mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  }

  try {
    cached.conn = await cached.promise;
  } catch (err) {
    // Drop the failed attempt so the next request retries instead of
    // replaying this rejection for the life of the process.
    cached.promise = null;
    throw err;
  }

  if (!cached.seeded) {
    await Account.findOneAndUpdate(
      { isCash: true },
      { $setOnInsert: { name: "Cash", type: "bank", isCash: true, balance: 0, currency: "USD" } },
      { upsert: true, setDefaultsOnInsert: true }
    );
    cached.seeded = true;
  }

  return cached.conn;
}
