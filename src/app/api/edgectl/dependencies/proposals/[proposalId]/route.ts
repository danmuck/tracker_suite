import { mirageRequest } from "@/lib/edgectl/server/client";
import { forward, invalid } from "@/lib/edgectl/server/respond";
import { dependencyProposalSchema, pathId } from "@/lib/edgectl/validators";

export async function GET(_request: Request, ctx: { params: Promise<{ proposalId: string }> }) {
  const id = pathId.safeParse((await ctx.params).proposalId);
  if (!id.success) return invalid(id.error);
  return forward(() => mirageRequest("GET", ["dependencies", "proposals", id.data], { schema: dependencyProposalSchema }));
}
