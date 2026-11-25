import { mirageRequest } from "@/lib/edgectl/server/client";
import { forward, invalid, readJson, refuseCrossSite } from "@/lib/edgectl/server/respond";
import { deployRequestSchema, deployResultSchema } from "@/lib/edgectl/validators";

// Mirage deploys a configured remote Ghost over SSH. Takes minutes; never retried here.
export async function POST(request: Request) {
  const refused = refuseCrossSite(request, { body: true });
  if (refused) return refused;
  const body = deployRequestSchema.safeParse(await readJson(request));
  if (!body.success) return invalid(body.error);
  return forward(() =>
    mirageRequest("POST", ["ghosts", "deploy"], { body: body.data, schema: deployResultSchema, timeoutMs: 600_000 }),
  );
}
