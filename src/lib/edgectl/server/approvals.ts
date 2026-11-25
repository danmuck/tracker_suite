// Approval payloads between "prepare" (the operator is shown the digest) and "confirm" (it is
// signed). They stay on this server so the browser can never have a different payload signed than
// the one whose digest it was shown. In memory: a restart means preparing again.

interface Prepared {
  payload: Record<string, unknown>;
  digest: string;
  expiresAtMs: number;
}

const KEY = Symbol.for("tracker-suite.edgectl.approvals");
type Holder = { [KEY]?: Map<string, Prepared> };

// On globalThis so a dev-server reload of this module does not drop what was prepared.
function store(): Map<string, Prepared> {
  const holder = globalThis as Holder;
  return (holder[KEY] ??= new Map());
}

const MAX_HELD = 100;

/** Keeps the payload for `proposalId`, replacing an earlier one */
export function holdApproval(proposalId: string, prepared: Prepared, now = Date.now()): void {
  const held = store();
  for (const [id, entry] of held) if (entry.expiresAtMs <= now) held.delete(id);
  if (held.size >= MAX_HELD && !held.has(proposalId)) held.delete(held.keys().next().value as string);
  held.set(proposalId, prepared);
}

export type Taken = { ok: true; payload: Record<string, unknown>; digest: string } | { ok: false; message: string };

/**
 * The payload prepared for `proposalId`, only when `digest` is the one the operator was shown and
 * the payload has not expired. It is handed out once.
 */
export function takeApproval(proposalId: string, digest: string, now = Date.now()): Taken {
  const held = store();
  const entry = held.get(proposalId);
  if (!entry) return { ok: false, message: "No approval is prepared for this proposal. Review it again" };
  if (entry.expiresAtMs <= now) {
    held.delete(proposalId);
    return { ok: false, message: "The prepared approval has expired. Review the proposal again" };
  }
  if (entry.digest !== digest.trim().toLowerCase()) {
    return { ok: false, message: "That is not the digest that was shown for this proposal. Nothing was signed" };
  }
  held.delete(proposalId);
  return { ok: true, payload: entry.payload, digest: entry.digest };
}

/** For tests */
export function clearApprovals(): void {
  store().clear();
}
