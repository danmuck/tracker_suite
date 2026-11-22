// Guard helpers for "client code reaches data only through src/hooks/request.ts" tests.
// TEST-ONLY: node-only (reads files with node:fs). Nothing outside a *.test.ts file may import from
// src/lib/data/test-support/; browser-safe-imports.test.ts fails if browser-reachable code does.

import { readdirSync } from "node:fs";
import { join } from "node:path";

/** Every non-test source file under `dir`, recursively. */
export function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? files(join(dir, e.name))
      : /\.(tsx?|jsx?|mjs)$/.test(e.name) && !/\.test\.(tsx?|jsx?|mjs)$/.test(e.name)
        ? [join(dir, e.name)]
        : [],
  );
}

/**
 * Blanks out comments and string/template literals (keeping newlines, so line
 * numbers survive). Handles //, /* *\/, '...', "...", `...` with backslash
 * escapes. A template literal is blanked whole, including any ${...} inside it,
 * and regex literals are not recognised: good enough for prose and UI text.
 */
export function stripCommentsAndStrings(src: string): string {
  let out = "";
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (c === "/" && n === "/") {
      while (i < src.length && src[i] !== "\n") i++;
    } else if (c === "/" && n === "*") {
      i += 2;
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) {
        if (src[i] === "\n") out += "\n";
        i++;
      }
      i += 2;
    } else if (c === '"' || c === "'" || c === "`") {
      i++;
      while (i < src.length && src[i] !== c) {
        if (src[i] === "\\") i++;
        if (src[i] === "\n") out += "\n";
        i++;
      }
      i++;
      out += '""';
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

const FORBIDDEN: RegExp[] = [
  // the identifier fetch on its own (call, generic call, spaced call, passed by reference, assigned)
  /(?<![\w$.])fetch(?![\w$])/,
  // fetch reached through a global object
  /(?<![\w$.])(?:window|globalThis|self)\s*(?:\?\.|\.)\s*fetch(?![\w$])/,
  /(?<![\w$.])(?:XMLHttpRequest|axios|EventSource|WebSocket)(?![\w$])/,
  /(?<![\w$.])sendBeacon(?![\w$])|\.\s*sendBeacon(?![\w$])/,
  /(?<![\w$.])new\s+Request\s*\(/,
];

/** Returns the 1-based line numbers of forbidden direct server access. */
export function findDirectAccess(src: string): number[] {
  const lines = stripCommentsAndStrings(src).split("\n");
  return lines.flatMap((l, i) => (FORBIDDEN.some((re) => re.test(l)) ? [i + 1] : []));
}
