import { mirageRequest } from "@/lib/edgectl/server/client";
import { forward } from "@/lib/edgectl/server/respond";
import { deployTargetsSchema } from "@/lib/edgectl/validators";

// The Ghosts Mirage is configured to deploy (its ghost_manifests). In Mirage's memory: no Ghost is probed.
export function GET() {
  return forward(() => mirageRequest("GET", ["ghosts", "deploy-targets"], { schema: deployTargetsSchema }));
}
