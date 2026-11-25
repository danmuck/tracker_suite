// Runs `edgecert`, edgectl's operator tooling, for the two things Mirage never does: issuing a
// Ghost certificate and signing dependency intents and approvals. Signing and digests are never
// reimplemented here. Server-only: private keys are named by path and read by the tool; nothing
// this module returns contains key material.

import { execFile } from "node:child_process";
import { access, constants } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { z } from "zod";
import type { Capabilities, Capability } from "@/types/edgectl/api";
import { digestSchema, installStepSchema, principalId } from "@/lib/edgectl/validators";
import { APPROVER_ENV_NAMES, ENV_NAMES, MirageError, readApproverPaths, readConfig } from "./client";

type Env = Record<string, string | undefined>;

const BIN = "EDGECTL_EDGECERT_BIN";
export const ISSUE_ENV_NAMES = ["EDGECTL_CA_ISSUER_CERT", "EDGECTL_CA_ISSUER_KEY", "EDGECTL_CERTS_DIR"] as const;

const missing = (names: readonly string[], env: Env) => names.filter((name) => !env[name]?.trim());

function notConfigured(what: string, names: string[]): MirageError {
  return new MirageError("not_configured", `${what} is not configured. Not set on the server: ${names.join(", ")}`);
}

function binPath(what: string, env: Env): string {
  const bin = env[BIN]?.trim();
  if (!bin) throw notConfigured(what, [BIN]);
  if (!isAbsolute(bin)) throw new MirageError("not_configured", `${BIN} must be an absolute path`);
  return bin;
}

const off = (message: string): Capability => ({ enabled: false, message });
const on: Capability = { enabled: true, message: "" };

/** Which features that need edgecert are usable, from the environment and whether the tool can be run */
export async function capabilities(env: Env = process.env): Promise<Capabilities> {
  const bin = env[BIN]?.trim() ?? "";
  let tool = "";
  if (!bin) tool = `Not set on the server: ${BIN}`;
  else if (!isAbsolute(bin)) tool = `${BIN} must be an absolute path`;
  else {
    try {
      await access(bin, constants.X_OK);
    } catch {
      tool = `${BIN} (${bin}) is not a program this server can run`;
    }
  }
  const need = (what: string, names: readonly string[]): Capability => {
    if (tool) return off(`${what} is not configured. ${tool}`);
    const absent = missing(names, env);
    return absent.length > 0 ? off(`${what} is not configured. Not set on the server: ${absent.join(", ")}`) : on;
  };
  return {
    issue: need("Certificate issuance", ISSUE_ENV_NAMES),
    propose: need("Signing a proposal", ENV_NAMES),
    approve: need("Approving", [...APPROVER_ENV_NAMES, "EDGECTL_CA"]),
  };
}

const TIMEOUT_MS = 20_000;
const MAX_OUTPUT_BYTES = 2 * 1024 * 1024;

/**
 * One edgecert run. `args` is an argument array handed to the program as it is: no shell ever
 * sees it. The tool gets an empty environment.
 */
function run(bin: string, args: string[], stdin?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      bin,
      args,
      { timeout: TIMEOUT_MS, maxBuffer: MAX_OUTPUT_BYTES, env: {} as NodeJS.ProcessEnv, encoding: "utf8" },
      (error, stdout, stderr) => {
        if (!error) return resolve(stdout);
        const said = String(stderr).trim().split("\n").filter(Boolean).at(-1) ?? "";
        const reason = said || (error as NodeJS.ErrnoException).code || error.message;
        reject(new MirageError("tool", `edgecert ${args[0]}: ${reason}`));
      },
    );
    child.stdin?.on("error", () => {});
    child.stdin?.end(stdin ?? "");
  });
}

async function runJson<T>(bin: string, args: string[], stdin: string | undefined, schema: z.ZodType<T>): Promise<T> {
  const out = await run(bin, args, stdin);
  let value: unknown;
  try {
    value = JSON.parse(out);
  } catch {
    throw new MirageError("tool", `edgecert ${args[0]} did not print JSON`);
  }
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new MirageError("tool", `edgecert ${args[0]} printed something unexpected`);
  return parsed.data;
}

/** A value the tool produced and must get back unchanged: never inspected or reshaped here */
const opaque = z.record(z.string(), z.unknown());

/**
 * Issues a Ghost certificate into Mirage's certificate directory, as `<id>.crt` and `<id>.key`.
 * `id` must be the full id the Ghost will have ("<local ghost id>.<target name>").
 */
export async function issueGhostCertificate(id: string, env: Env = process.env): Promise<void> {
  const what = "Certificate issuance";
  const bin = binPath(what, env);
  const absent = missing(ISSUE_ENV_NAMES, env);
  if (absent.length > 0) throw notConfigured(what, absent);
  const checked = principalId.safeParse(id);
  if (!checked.success) throw new MirageError("tool", `"${id}" is not a valid certificate id`);
  await run(bin, [
    "issue",
    "-ca-cert",
    env.EDGECTL_CA_ISSUER_CERT!.trim(),
    "-ca-key",
    env.EDGECTL_CA_ISSUER_KEY!.trim(),
    "-role",
    "ghost",
    "-id",
    checked.data,
    "-ip",
    "127.0.0.1",
    "-dns",
    "localhost",
    "-out",
    env.EDGECTL_CERTS_DIR!.trim(),
  ]);
}

const intentOutput = z.object({ intent: opaque, digest: digestSchema, steps: z.array(installStepSchema).nullish() });

/** The unsigned intent for installing `seedIds`' dependencies on `ghostId`, and the steps it would install. Needs no key. */
export async function buildIntent(ghostId: string, seedIds: string[], env: Env = process.env) {
  const bin = binPath("Signing a proposal", env);
  const out = await runJson(bin, ["intent", "-ghost", ghostId, "-seeds", seedIds.join(",")], undefined, intentOutput);
  return { intent: out.intent, digest: out.digest, steps: out.steps ?? [] };
}

const signedIntentOutput = z.object({ signed_intent: opaque, digest: digestSchema, principal: z.string() });

/** Signs an intent from `buildIntent` as the operator (the proposer) */
export async function signIntent(intent: Record<string, unknown>, env: Env = process.env) {
  const bin = binPath("Signing a proposal", env);
  const config = readConfig(env);
  return runJson(
    bin,
    ["sign-intent", "-cert", config.certPath, "-key", config.keyPath],
    JSON.stringify(intent),
    signedIntentOutput,
  );
}

const approvalOutput = z.object({
  payload: opaque,
  digest: digestSchema,
  approver: z.string(),
  proposer: z.string(),
  expires_at_ms: z.number().int(),
});

export type UnsignedApproval = z.infer<typeof approvalOutput>;

/**
 * Checks a proposal and builds the unsigned approval payload for the second operator. `proposal`
 * must be the object exactly as Mirage returned it.
 */
export async function buildApproval(proposal: unknown, env: Env = process.env): Promise<UnsignedApproval> {
  const bin = binPath("Approving", env);
  const approver = readApproverPaths(env);
  const config = readConfig(env);
  return runJson(
    bin,
    ["approval", "-cert", approver.certPath, "-key", approver.keyPath, "-ca", config.caPath],
    JSON.stringify(proposal),
    approvalOutput,
  );
}

const signedApprovalOutput = z.object({ approval: opaque, digest: digestSchema, principal: z.string() });

/**
 * Signs `payload` as the second operator. The tool refuses unless the payload's digest is `digest`,
 * the one the operator confirmed.
 */
export async function signApproval(payload: Record<string, unknown>, digest: string, env: Env = process.env) {
  const bin = binPath("Approving", env);
  const approver = readApproverPaths(env);
  const checked = digestSchema.parse(digest);
  return runJson(
    bin,
    ["sign-approval", "-cert", approver.certPath, "-key", approver.keyPath, "-digest", checked],
    JSON.stringify(payload),
    signedApprovalOutput,
  );
}
