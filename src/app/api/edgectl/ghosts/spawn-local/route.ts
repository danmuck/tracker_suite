import { mirageRequest } from "@/lib/edgectl/server/client";
import { forward, invalid, readJson } from "@/lib/edgectl/server/respond";
import { spawnRequestSchema, spawnResultSchema } from "@/lib/edgectl/validators";

// Not idempotent: never retried here.
export async function POST(request: Request) {
  const body = spawnRequestSchema.safeParse(await readJson(request));
  if (!body.success) return invalid(body.error);
  return forward(() =>
    mirageRequest("POST", ["ghosts", "spawn-local"], { body: body.data, schema: spawnResultSchema, timeoutMs: 30_000 }),
  );
}
