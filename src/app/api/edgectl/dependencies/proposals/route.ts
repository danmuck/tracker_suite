import { mirageRequest } from "@/lib/edgectl/server/client";
import { buildIntent, signIntent } from "@/lib/edgectl/server/edgecert";
import { forward, invalid, readJson, refuseCrossSite } from "@/lib/edgectl/server/respond";
import { dependencyProposalSchema, dependencyProposalsSchema, proposeSchema } from "@/lib/edgectl/validators";

export function GET() {
  return forward(() => mirageRequest("GET", ["dependencies", "proposals"], { schema: dependencyProposalsSchema }));
}

// Propose: build the intent with edgecert, sign it as the operator, and hand it to Mirage, which
// derives the steps from its own catalog. The browser supplies only the Ghost and the Seed ids.
export async function POST(request: Request) {
  const refused = refuseCrossSite(request, { body: true });
  if (refused) return refused;
  const body = proposeSchema.safeParse(await readJson(request));
  if (!body.success) return invalid(body.error);
  return forward(async () => {
    const { intent } = await buildIntent(body.data.ghost_id, body.data.seed_ids);
    const { signed_intent } = await signIntent(intent);
    return mirageRequest("POST", ["dependencies", "proposals"], {
      body: { intent: signed_intent },
      schema: dependencyProposalSchema,
    });
  });
}
