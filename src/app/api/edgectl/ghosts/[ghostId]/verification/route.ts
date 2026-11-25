import { mirageRequest } from "@/lib/edgectl/server/client";
import { forward, invalid } from "@/lib/edgectl/server/respond";
import { ghostVerificationSchema, pathId, reportLimitSchema } from "@/lib/edgectl/validators";

// Read through Mirage, which asks the Ghost: this app never calls a Ghost.
export async function GET(request: Request, ctx: { params: Promise<{ ghostId: string }> }) {
  const ghostId = pathId.safeParse((await ctx.params).ghostId);
  if (!ghostId.success) return invalid(ghostId.error);
  const raw = new URL(request.url).searchParams.get("limit");
  const limit = raw === null ? undefined : reportLimitSchema.safeParse(raw);
  if (limit && !limit.success) return invalid(limit.error);
  return forward(() =>
    mirageRequest("GET", ["ghosts", ghostId.data, "verification"], { query: { limit: limit?.data }, schema: ghostVerificationSchema }),
  );
}
