import { mirageRequest } from "@/lib/edgectl/server/client";
import { forward, invalid } from "@/lib/edgectl/server/respond";
import { intentSnapshotSchema, pathId } from "@/lib/edgectl/validators";

export async function GET(_request: Request, ctx: { params: Promise<{ intentId: string }> }) {
  const intentId = pathId.safeParse((await ctx.params).intentId);
  if (!intentId.success) return invalid(intentId.error);
  return forward(() => mirageRequest("GET", ["intents", intentId.data], { schema: intentSnapshotSchema }));
}
