import { mirageRequest } from "@/lib/edgectl/server/client";
import { forward, invalid } from "@/lib/edgectl/server/respond";
import { ghostStatusSchema, pathId } from "@/lib/edgectl/validators";

// Read through Mirage, which asks the Ghost: this app never calls a Ghost.
export async function GET(_request: Request, ctx: { params: Promise<{ ghostId: string }> }) {
  const ghostId = pathId.safeParse((await ctx.params).ghostId);
  if (!ghostId.success) return invalid(ghostId.error);
  return forward(() => mirageRequest("GET", ["ghosts", ghostId.data, "status"], { schema: ghostStatusSchema }));
}
