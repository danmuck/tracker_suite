import { mirageRequest } from "@/lib/edgectl/server/client";
import { forward, refuseCrossSite } from "@/lib/edgectl/server/respond";
import { reportsSchema } from "@/lib/edgectl/validators";

// Reconcile all: Mirage runs one pending command of every intent and answers with their reports.
export async function POST(request: Request) {
  const refused = refuseCrossSite(request, { body: false });
  if (refused) return refused;
  return forward(() => mirageRequest("POST", ["reconcile"], { schema: reportsSchema, timeoutMs: 120_000 }));
}
