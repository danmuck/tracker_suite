import { mirageRequest } from "@/lib/edgectl/server/client";
import { forward } from "@/lib/edgectl/server/respond";
import { ghostSeedCatalogsSchema } from "@/lib/edgectl/validators";

export function GET() {
  return forward(() => mirageRequest("GET", ["seeds"], { schema: ghostSeedCatalogsSchema, timeoutMs: 15_000 }));
}
