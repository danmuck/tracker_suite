import { mirageRequest } from "@/lib/edgectl/server/client";
import { forward } from "@/lib/edgectl/server/respond";
import { servicesSchema } from "@/lib/edgectl/validators";

// Mirage probes every Ghost for this: polled sparingly.
export function GET() {
  return forward(() => mirageRequest("GET", ["services"], { schema: servicesSchema, timeoutMs: 15_000 }));
}
