import { mirageRequest } from "@/lib/edgectl/server/client";
import { forward, invalid } from "@/lib/edgectl/server/respond";
import { pathId, reportSchema } from "@/lib/edgectl/validators";

// One call makes Mirage run one pending command of the intent and answers with its `report`.
export async function POST(_request: Request, ctx: { params: Promise<{ intentId: string }> }) {
  const intentId = pathId.safeParse((await ctx.params).intentId);
  if (!intentId.success) return invalid(intentId.error);
  return forward(() =>
    mirageRequest("POST", ["intents", intentId.data, "reconcile"], { schema: reportSchema, timeoutMs: 60_000 }),
  );
}
