import { mirageRequest } from "@/lib/edgectl/server/client";
import { forward, invalid } from "@/lib/edgectl/server/respond";
import { executionSchema, pathId } from "@/lib/edgectl/validators";

// Mirage reads the execution record from the Ghost: a client never calls a Ghost.
export async function GET(_request: Request, ctx: { params: Promise<{ commandId: string }> }) {
  const commandId = pathId.safeParse((await ctx.params).commandId);
  if (!commandId.success) return invalid(commandId.error);
  return forward(() =>
    mirageRequest("GET", ["executions", commandId.data], { schema: executionSchema, timeoutMs: 15_000 }),
  );
}
