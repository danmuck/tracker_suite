import { mirageRequest } from "@/lib/edgectl/server/client";
import { forward } from "@/lib/edgectl/server/respond";
import { ghostsSchema } from "@/lib/edgectl/validators";

export function GET() {
  return forward(() => mirageRequest("GET", ["ghosts"], { schema: ghostsSchema, timeoutMs: 15_000 }));
}
