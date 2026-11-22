import mongoose from "mongoose";
import Account from "@/models/finance/Account";
import { once } from "@/lib/data/once";

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
  /** Runs the seeds once per process; every connectDB call awaits the same run (see once) */
  seed?: () => Promise<void>;
}

declare global {
  var mongoose: MongooseCache | undefined;
}

const cached: MongooseCache = global.mongoose ?? { conn: null, promise: null };

if (!global.mongoose) {
  global.mongoose = cached;
}

export async function runSeeds() {
  await Account.findOneAndUpdate(
    { isCash: true },
    { $setOnInsert: { name: "Cash", type: "bank", isCash: true, balance: 0, currency: "USD" } },
    { upsert: true, setDefaultsOnInsert: true }
  );
}

export async function connectDB() {
  if (process.env.NEXT_PUBLIC_DEMO === "1") {
    throw new Error("The demo does not use a server database");
  }
  // No request proceeds until the seed has finished: a request arriving while the first one is
  // still seeding must not reach ensureCashAccount and insert a second Cash account.
  cached.seed ??= once(runSeeds);
  if (cached.conn) {
    await cached.seed();
    return cached.conn;
  }

  const MONGODB_URI = process.env.MONGODB_URI;
  if (!MONGODB_URI) {
    throw new Error("Please define the MONGODB_URI environment variable in .env.local");
  }

  if (!cached.promise) {
    cached.promise = mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
  }

  try {
    cached.conn = await cached.promise;
  } catch (error) {
    // Forget the failed attempt so the next request reconnects, instead of every request
    // replaying this rejection until the server is restarted.
    cached.promise = null;
    throw error;
  }

  await cached.seed();

  return cached.conn;
}
