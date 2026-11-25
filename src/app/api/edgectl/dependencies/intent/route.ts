import { buildIntent } from "@/lib/edgectl/server/edgecert";
import { forward, invalid, readJson, refuseCrossSite } from "@/lib/edgectl/server/respond";
import { proposeSchema } from "@/lib/edgectl/validators";
import type { IntentPreview } from "@/types/edgectl/api";

// What a proposal would install, from the dependency catalog. Signs nothing and does not call Mirage.
export async function POST(request: Request) {
  const refused = refuseCrossSite(request, { body: true });
  if (refused) return refused;
  const body = proposeSchema.safeParse(await readJson(request));
  if (!body.success) return invalid(body.error);
  return forward(async (): Promise<IntentPreview> => {
    const { steps } = await buildIntent(body.data.ghost_id, body.data.seed_ids);
    return { ghost_id: body.data.ghost_id, seed_ids: body.data.seed_ids, steps };
  });
}
