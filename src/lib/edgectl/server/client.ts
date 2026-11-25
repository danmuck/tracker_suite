// Server-only client for Mirage's api/v1 (HTTPS with mutual TLS). This server is the operator
// client: it holds the operator certificate, and the browser never sees it or talks to Mirage.
// Nothing under src/lib/edgectl/server/ may be imported by browser-reachable code
// (src/lib/data/browser-safe-imports.test.ts).

import { readFile } from "node:fs/promises";
import { request } from "node:https";
import type { z } from "zod";

export const ENV_NAMES = ["EDGECTL_API_URL", "EDGECTL_CLIENT_CERT", "EDGECTL_CLIENT_KEY", "EDGECTL_CA"] as const;

export interface MirageConfig {
  /** Base URL including /api/v1, no trailing slash */
  url: string;
  certPath: string;
  keyPath: string;
  caPath: string;
}

export type MirageErrorKind =
  /** An EDGECTL_* variable is unset or wrong, or a certificate file cannot be read */
  | "not_configured"
  /** No answer from Mirage: connection refused, TLS failure, timeout */
  | "unreachable"
  /** Mirage answered with an error envelope */
  | "api"
  /** Mirage answered with something that is not an api/v1 envelope of the expected shape */
  | "bad_response"
  /** The edgecert tool failed or printed something unexpected (server/edgecert.ts) */
  | "tool";

export class MirageError extends Error {
  kind: MirageErrorKind;
  /** HTTP status Mirage answered with; 0 when it did not answer */
  status: number;
  /** error.code of the envelope (errors.toml wire code); 0 when there is none */
  code: number;
  /** error.class of the envelope */
  errorClass: string;
  retryable: boolean;
  requestId: string;

  constructor(
    kind: MirageErrorKind,
    message: string,
    detail: { status?: number; code?: number; errorClass?: string; retryable?: boolean; requestId?: string } = {},
  ) {
    super(message);
    this.name = "MirageError";
    this.kind = kind;
    this.status = detail.status ?? 0;
    this.code = detail.code ?? 0;
    this.errorClass = detail.errorClass ?? "";
    this.retryable = detail.retryable ?? false;
    this.requestId = detail.requestId ?? "";
  }
}

type Env = Record<string, string | undefined>;

/** The configuration from the environment; throws not_configured naming what is missing */
export function readConfig(env: Env = process.env): MirageConfig {
  const missing = ENV_NAMES.filter((name) => !env[name]?.trim());
  if (missing.length > 0) {
    throw new MirageError("not_configured", `Not set on the server: ${missing.join(", ")}`);
  }
  const raw = env.EDGECTL_API_URL!.trim().replace(/\/+$/, "");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new MirageError("not_configured", "EDGECTL_API_URL is not a URL");
  }
  if (url.protocol !== "https:") {
    throw new MirageError("not_configured", "EDGECTL_API_URL must start with https://");
  }
  return {
    url: raw,
    certPath: env.EDGECTL_CLIENT_CERT!.trim(),
    keyPath: env.EDGECTL_CLIENT_KEY!.trim(),
    caPath: env.EDGECTL_CA!.trim(),
  };
}

/** Who a call is made as. "approver" is the second operator, used only to approve a dependency proposal. */
export type MirageIdentity = "operator" | "approver";

export const APPROVER_ENV_NAMES = ["EDGECTL_APPROVER_CERT", "EDGECTL_APPROVER_KEY"] as const;

/** Certificate and key paths of the second operator; throws not_configured naming what is missing */
export function readApproverPaths(env: Env = process.env): { certPath: string; keyPath: string } {
  const missing = APPROVER_ENV_NAMES.filter((name) => !env[name]?.trim());
  if (missing.length > 0) {
    throw new MirageError("not_configured", `Approving is not configured. Not set on the server: ${missing.join(", ")}`);
  }
  return { certPath: env.EDGECTL_APPROVER_CERT!.trim(), keyPath: env.EDGECTL_APPROVER_KEY!.trim() };
}

async function readCredential(name: string, path: string): Promise<Buffer> {
  try {
    return await readFile(path);
  } catch (error) {
    const reason = (error as NodeJS.ErrnoException).code ?? "read failed";
    // The path is configuration, not secret material; the file's content never leaves this module.
    throw new MirageError("not_configured", `Cannot read ${name} (${path}): ${reason}`);
  }
}

export interface MirageRequestOptions<T> {
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  /** Parses `data`; a mismatch is a bad_response */
  schema?: z.ZodType<T>;
  timeoutMs?: number;
  requestId?: string;
  /** Whose certificate the connection uses; the operator's when left out */
  identity?: MirageIdentity;
  env?: Env;
}

const DEFAULT_TIMEOUT_MS = 10_000;
/** The contract's request body limit; used for responses too */
const MAX_BODY_BYTES = 16 * 1024 * 1024;

function unreachable(config: MirageConfig, reason: string): MirageError {
  return new MirageError("unreachable", `No answer from Mirage at ${new URL(config.url).origin}: ${reason}`, {
    retryable: true,
  });
}

interface RawResponse {
  status: number;
  text: string;
}

function send(
  config: MirageConfig,
  credentials: { cert: Buffer; key: Buffer; ca: Buffer },
  method: string,
  url: URL,
  payload: string | undefined,
  timeoutMs: number,
  requestId: string | undefined,
): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    // Built from scratch: nothing from the browser's request (Origin, Sec-Fetch-*, cookies) is ever
    // passed on. Mirage refuses browser-style requests, and a body without this Content-Type.
    const headers: Record<string, string> = {};
    if (payload !== undefined) {
      headers["Content-Type"] = "application/json; charset=utf-8";
      headers["Content-Length"] = String(Buffer.byteLength(payload));
    }
    if (requestId) headers["X-Request-Id"] = requestId;

    const req = request(
      url,
      {
        method,
        headers,
        ...credentials,
        // A new connection each time: the certificate files change whenever a lab restarts.
        agent: false,
        minVersion: "TLSv1.3",
      },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_BODY_BYTES) {
            req.destroy();
            reject(new MirageError("bad_response", "Mirage sent a response over the size limit"));
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () => resolve({ status: res.statusCode ?? 0, text: Buffer.concat(chunks).toString("utf8") }));
        res.on("error", (error) => reject(unreachable(config, error.message)));
      },
    );
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`timed out after ${Math.round(timeoutMs / 1000)} s`));
    });
    req.on("error", (error: NodeJS.ErrnoException) => {
      reject(unreachable(config, error.message || error.code || "connection failed"));
    });
    req.end(payload);
  });
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * One api/v1 call. `path` is the segments after /api/v1, each percent-encoded here. Returns the
 * envelope's `data`; throws MirageError for everything else. Never retries.
 */
export async function mirageRequest<T = unknown>(
  method: "GET" | "POST",
  path: string[],
  options: MirageRequestOptions<T> = {},
): Promise<T> {
  const config = readConfig(options.env);
  const asApprover = options.identity === "approver";
  const who = asApprover ? readApproverPaths(options.env) : config;
  const [cert, key, ca] = await Promise.all([
    readCredential(asApprover ? "EDGECTL_APPROVER_CERT" : "EDGECTL_CLIENT_CERT", who.certPath),
    readCredential(asApprover ? "EDGECTL_APPROVER_KEY" : "EDGECTL_CLIENT_KEY", who.keyPath),
    readCredential("EDGECTL_CA", config.caPath),
  ]);

  const url = new URL(`${config.url}/${path.map(encodeURIComponent).join("/")}`);
  for (const [name, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined) url.searchParams.set(name, String(value));
  }
  const payload = options.body === undefined ? undefined : JSON.stringify(options.body);

  const raw = await send(
    config,
    { cert, key, ca },
    method,
    url,
    payload,
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    options.requestId,
  );

  let envelope: unknown;
  try {
    envelope = JSON.parse(raw.text);
  } catch {
    throw new MirageError("bad_response", `Mirage answered ${raw.status} with a body that is not JSON`, {
      status: raw.status,
    });
  }
  if (!isRecord(envelope) || typeof envelope.ok !== "boolean") {
    throw new MirageError("bad_response", `Mirage answered ${raw.status} without an api/v1 envelope`, {
      status: raw.status,
    });
  }
  const requestId = typeof envelope.request_id === "string" ? envelope.request_id : "";

  if (!envelope.ok) {
    const error = isRecord(envelope.error) ? envelope.error : {};
    throw new MirageError("api", typeof error.message === "string" ? error.message : `Mirage answered ${raw.status}`, {
      status: raw.status,
      code: typeof error.code === "number" ? error.code : 0,
      errorClass: typeof error.class === "string" ? error.class : "",
      retryable: error.retryable === true,
      requestId,
    });
  }

  if (!options.schema) return envelope.data as T;
  const parsed = options.schema.safeParse(envelope.data);
  if (!parsed.success) {
    throw new MirageError("bad_response", "Mirage sent data that does not match the api/v1 contract", {
      status: raw.status,
      requestId,
    });
  }
  return parsed.data;
}

export interface Failure {
  status: number;
  body: { error: string; kind: MirageErrorKind | "internal"; code: number; class: string; retryable: boolean };
}

/**
 * The HTTP answer this app gives for a failed Mirage call: 503 not configured, 504 no answer
 * from Mirage, 502 unexpected response, otherwise Mirage's own status with its code and message.
 */
export function failureOf(error: unknown): Failure {
  if (!(error instanceof MirageError)) {
    return {
      status: 500,
      body: { error: "Request failed", kind: "internal", code: 0, class: "", retryable: false },
    };
  }
  const status =
    error.kind === "not_configured"
      ? 503
      : error.kind === "unreachable"
        ? 504
        : error.kind === "bad_response"
          ? 502
          : error.kind === "tool"
            ? 500
            : error.status >= 400 && error.status <= 599
              ? error.status
              : 502;
  const prefix =
    error.kind === "not_configured" && !error.message.includes("not configured")
      ? "edgectl is not configured. "
      : error.kind === "unreachable"
        ? "Mirage unreachable. "
        : "";
  return {
    status,
    body: {
      error: `${prefix}${error.message}`,
      kind: error.kind,
      code: error.code,
      class: error.errorClass,
      retryable: error.retryable,
    },
  };
}
