// Which database a script may touch. Pure: no connection is opened here. Server-only.

export type ScriptTarget = { db: string; uri: string; apply: boolean; rest: string[] };

const DB_NAME = /^[A-Za-z0-9_-]+$/;

/** The database name in a MongoDB URI's path, or "" when it names none. Handles host lists. */
function uriDatabase(uri: string): string {
  const match = /^mongodb(?:\+srv)?:\/\/[^/?]*(?:\/([^/?]*))?/.exec(uri);
  if (!match) throw new Error(`Refusing --uri: not a mongodb:// URI`);
  return decodeURIComponent(match[1] ?? "");
}

/**
 * Reads --db (required), --uri (default mongodb://localhost:27017/<db>) and --apply. Everything
 * else is returned in `rest`, in order. Throws when the URI names a different database than
 * --db (or none), so no connection is ever opened to the wrong one.
 */
export function parseTarget(argv: string[]): ScriptTarget {
  let db: string | undefined;
  let uri: string | undefined;
  let apply = false;
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--db" || arg === "--uri") {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("--")) throw new Error(`${arg} needs a value`);
      if (arg === "--db") db = value;
      else uri = value;
      i++;
    } else if (arg === "--apply") {
      apply = true;
    } else {
      rest.push(arg);
    }
  }
  if (!db) throw new Error("--db <name> is required");
  if (!DB_NAME.test(db)) throw new Error(`--db ${JSON.stringify(db)} is not a plain database name`);
  const finalUri = uri ?? `mongodb://localhost:27017/${db}`;
  const named = uriDatabase(finalUri);
  if (named !== db) {
    throw new Error(`Refusing --uri: it names database ${JSON.stringify(named)} but --db is ${JSON.stringify(db)}`);
  }
  return { db, uri: finalUri, apply, rest };
}

/** Value after `flag` in `rest`, or undefined. */
export function flagValue(rest: string[], flag: string): string | undefined {
  const i = rest.indexOf(flag);
  const value = i >= 0 ? rest[i + 1] : undefined;
  return value !== undefined && !value.startsWith("--") ? value : undefined;
}
