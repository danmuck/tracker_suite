import { mirageRequest } from "@/lib/edgectl/server/client";
import { forward, invalid, readJson, refuseCrossSite } from "@/lib/edgectl/server/respond";
import { attachRequestSchema, ghostRouteRefSchema } from "@/lib/edgectl/validators";

// Not idempotent: never retried here.
export async function POST(request: Request) {
  const refused = refuseCrossSite(request, { body: true });
  if (refused) return refused;
  const body = attachRequestSchema.safeParse(await readJson(request));
  if (!body.success) return invalid(body.error);
  return forward(() =>
    mirageRequest("POST", ["ghosts", "attach"], { body: body.data, schema: ghostRouteRefSchema, timeoutMs: 30_000 }),
  );
}
