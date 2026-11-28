import { createHash, randomBytes } from "node:crypto";

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const CODE_COUNT = 10;
const CODE_BYTES = 10; // 80 bits = exactly 16 base32 characters, so no modulo bias

/** Encodes bytes as Crockford base32, 5 bits per character. The byte length must be a multiple of 5. */
function encode(bytes: Buffer): string {
  let out = "";
  let bits = 0;
  let acc = 0;
  for (const byte of bytes) {
    acc = (acc << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(acc >>> (bits - 5)) & 31];
      bits -= 5;
    }
    acc &= (1 << bits) - 1;
  }
  return out;
}

/** Normalizes what a person typed and hashes it (SHA-256 hex). Only a hash is ever stored. */
export function hashRecoveryCode(input: string): string {
  const normalized = input
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "")
    .replaceAll("O", "0")
    .replace(/[IL]/g, "1")
    .replace(/[^0-9A-HJKMNP-TV-Z]/g, "");
  return createHash("sha256").update(normalized).digest("hex");
}

export function generateRecoveryCodes(): { codes: string[]; hashes: string[] } {
  const codes: string[] = [];
  const hashes: string[] = [];
  const seen = new Set<string>();
  while (codes.length < CODE_COUNT) {
    const raw = encode(randomBytes(CODE_BYTES));
    if (seen.has(raw)) continue;
    seen.add(raw);
    codes.push(raw.match(/.{4}/g)!.join("-"));
    hashes.push(hashRecoveryCode(raw));
  }
  return { codes, hashes };
}
