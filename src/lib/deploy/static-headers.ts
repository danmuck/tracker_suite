// Builds the Cloudflare Pages `_headers` file for the static (browser data) build.
// Pure functions only; scripts/static-headers.ts does the file I/O.
//
// Every inline <script> Next writes into a page is allowed by its sha256 hash, so the CSP needs
// no 'unsafe-inline' for scripts. Hashes differ per page, so each page gets its own rule.
// Cloudflare joins values of the same header from several matching rules with a comma (which
// enforces both policies), so the fallback CSP on `/*` is detached (`! Content-Security-Policy`)
// in every page rule before the page sets its own.

import { createHash } from "node:crypto";

/** Cloudflare Pages limit for one header line in `_headers`. */
export const MAX_LINE = 2000;

const SECURITY_HEADERS: Record<string, string> = {
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy":
    "accelerometer=(), autoplay=(), camera=(), display-capture=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), midi=(), payment=(), usb=(), browsing-topics=()",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
};

export interface InlineScripts {
  /** sha256 hashes of executable inline scripts, in CSP source form ('sha256-…') */
  hashes: string[];
  /** Inline event handler attributes (onclick= …); a CSP without 'unsafe-inline' blocks them */
  handlers: string[];
}

const EXECUTABLE_TYPES = new Set(["", "text/javascript", "application/javascript", "module"]);

/** Inline scripts of one HTML page. Script elements are raw text, so the hash covers the exact bytes between the tags. */
export function inlineScripts(html: string): InlineScripts {
  const hashes = new Set<string>();
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    const [, attrs, body] = match;
    if (/\bsrc\s*=/i.test(attrs)) continue;
    const type = /\btype\s*=\s*["']?([^"'\s>]*)/i.exec(attrs)?.[1]?.toLowerCase() ?? "";
    if (!EXECUTABLE_TYPES.has(type)) continue;
    hashes.add(`'sha256-${createHash("sha256").update(body, "utf8").digest("base64")}'`);
  }
  const handlers = [...html.matchAll(/<[a-z][^>]*?\s(on[a-z]+)\s*=/gi)].map((m) => m[1]);
  return { hashes: [...hashes].sort(), handlers };
}

export function contentSecurityPolicy(scriptHashes: string[]): string {
  return [
    "default-src 'none'",
    ["script-src 'self'", ...scriptHashes].join(" "),
    // Radix sets style attributes and the chart component writes a <style> element.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "manifest-src 'self'",
    "worker-src 'none'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
}

/**
 * URL paths a file is served at: `index.html` → `/`, `finance/accounts.html` → `/finance/accounts`
 * (Cloudflare serves `x.html` at `/x` and redirects `/x.html` there).
 */
export function servedPaths(relativeFile: string): string[] {
  const file = relativeFile.replaceAll("\\", "/");
  if (file === "index.html") return ["/"];
  if (file.endsWith("/index.html")) {
    const dir = `/${file.slice(0, -"/index.html".length)}`;
    return [dir, `${dir}/`];
  }
  const path = `/${file.slice(0, -".html".length)}`;
  return [path, `${path}/`];
}

export interface Page {
  /** Path relative to the export folder, e.g. "finance/accounts.html" */
  file: string;
  html: string;
}

/** The `_headers` file. Throws when a page cannot be served with a strict policy. */
export function buildHeaders(pages: Page[]): string {
  const notFound = pages.find((p) => p.file === "404.html");
  if (!notFound) throw new Error("404.html is missing from the export");

  const policyFor = (page: Page): string => {
    const { hashes, handlers } = inlineScripts(page.html);
    if (handlers.length > 0) throw new Error(`${page.file} has inline event handlers: ${handlers.join(", ")}`);
    return contentSecurityPolicy(hashes);
  };

  const line = (name: string, value: string) => {
    const text = `  ${name}: ${value}`;
    if (text.length > MAX_LINE) throw new Error(`${name} is ${text.length} characters, over the ${MAX_LINE} limit`);
    return text;
  };

  const blocks: string[] = [];
  // Every response, including the 404 page served for unknown paths.
  blocks.push(
    [
      "/*",
      ...Object.entries(SECURITY_HEADERS).map(([k, v]) => line(k, v)),
      line("Content-Security-Policy", policyFor(notFound)),
    ].join("\n"),
  );
  // Content-hashed build files never change.
  blocks.push(["/_next/static/*", line("Cache-Control", "public, max-age=31536000, immutable")].join("\n"));

  for (const page of [...pages].sort((a, b) => a.file.localeCompare(b.file))) {
    if (page.file === "404.html") continue;
    const policy = line("Content-Security-Policy", policyFor(page));
    for (const path of servedPaths(page.file)) {
      blocks.push([path, "  ! Content-Security-Policy", policy].join("\n"));
    }
  }
  return `${blocks.join("\n\n")}\n`;
}
