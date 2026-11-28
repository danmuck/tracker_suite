// Shared by the auth scripts: connect to the one database named by --db, or refuse.
import mongoose from "mongoose";
import type { ScriptTarget } from "../../src/lib/auth/server/script-target.ts";

/**
 * Connects to target.uri and throws (after disconnecting) unless the connection really is on
 * target.db. Index building on connect is off: a script writes only what it says it writes.
 */
export async function connectTo(target: ScriptTarget): Promise<void> {
  mongoose.set("autoIndex", false);
  mongoose.set("autoCreate", false);
  await mongoose.connect(target.uri, { dbName: target.db });
  const actual = mongoose.connection.db?.databaseName;
  if (actual !== target.db) {
    await mongoose.disconnect();
    throw new Error(`Refusing: connected to ${JSON.stringify(actual)}, but --db is ${JSON.stringify(target.db)}`);
  }
}
