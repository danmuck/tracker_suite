import { MirageError, mirageRequest } from "@/lib/edgectl/server/client";
import { forward, invalid, readJson, refuseCrossSite } from "@/lib/edgectl/server/respond";
import { intentIdsSchema, intentRefSchema, intentSnapshotSchema, issueSchema } from "@/lib/edgectl/validators";
import type { IntentSummary } from "@/types/edgectl/api";

const SNAPSHOTS_AT_ONCE = 8;

async function summarize(intentId: string): Promise<IntentSummary | null> {
  try {
    const snapshot = await mirageRequest("GET", ["intents", intentId], { schema: intentSnapshotSchema });
    return {
      intent_id: snapshot.intent_id,
      objective: snapshot.issue.objective,
      target_scope: snapshot.issue.target_scope,
      received_at_ms: snapshot.received_at_ms,
      command_count: snapshot.commands.length,
      pending_count: snapshot.pending_count,
      completion_state: snapshot.reports.at(-1)?.completion_state ?? "",
    };
  } catch (error) {
    // Gone between the list and the read (a Mirage restart): leave it out.
    if (error instanceof MirageError && error.kind === "api" && error.status === 404) return null;
    throw error;
  }
}

// api/v1 lists only ids, so each intent's snapshot is read here (in memory in Mirage; no Ghost is probed).
export function GET() {
  return forward(async () => {
    const { intent_ids } = await mirageRequest("GET", ["intents"], { schema: intentIdsSchema });
    const intents: IntentSummary[] = [];
    for (let i = 0; i < intent_ids.length; i += SNAPSHOTS_AT_ONCE) {
      const batch = await Promise.all(intent_ids.slice(i, i + SNAPSHOTS_AT_ONCE).map(summarize));
      intents.push(...batch.filter((s): s is IntentSummary => s !== null));
    }
    intents.sort((a, b) => b.received_at_ms - a.received_at_ms || a.intent_id.localeCompare(b.intent_id));
    return { intents };
  });
}

// Submits an `issue`. Idempotent by intent_id in Mirage; not retried here.
export async function POST(request: Request) {
  const refused = refuseCrossSite(request, { body: true });
  if (refused) return refused;
  const issue = issueSchema.safeParse(await readJson(request));
  if (!issue.success) return invalid(issue.error);
  return forward(() => mirageRequest("POST", ["intents"], { body: issue.data, schema: intentRefSchema }));
}
