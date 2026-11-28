import { randomBytes } from "node:crypto";
import { hash, verify } from "@node-rs/argon2";

// Argon2id parameters. Raising any of them makes needsRehash true for older hashes.
export const ARGON2_MEMORY_KIB = 65536;
export const ARGON2_TIME_COST = 3;
export const ARGON2_PARALLELISM = 1;

// No `algorithm` option: @node-rs/argon2 defaults to Argon2id, and its `Algorithm` is a
// `const enum` that cannot be inlined by the type-stripping test runner. Tests check the prefix.
const OPTIONS = {
  memoryCost: ARGON2_MEMORY_KIB,
  timeCost: ARGON2_TIME_COST,
  parallelism: ARGON2_PARALLELISM,
};

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

/** True when the password matches. A malformed hash or any library error is false. */
export async function verifyPassword(storedHash: string, password: string): Promise<boolean> {
  try {
    return await verify(storedHash, password);
  } catch {
    return false;
  }
}

const PHC = /^\$argon2id\$v=\d+\$m=(\d+),t=(\d+),p=(\d+)\$/;

/** True when the hash is not Argon2id at the current parameters (or does not parse). */
export function needsRehash(storedHash: string): boolean {
  const match = PHC.exec(storedHash);
  if (!match) return true;
  const [m, t, p] = [Number(match[1]), Number(match[2]), Number(match[3])];
  return m < ARGON2_MEMORY_KIB || t < ARGON2_TIME_COST || p < ARGON2_PARALLELISM;
}

/** A hash of a random value, computed once: verify against it for unknown accounts so timing matches. */
export const DUMMY_HASH: Promise<string> = hashPassword(randomBytes(32).toString("hex"));
