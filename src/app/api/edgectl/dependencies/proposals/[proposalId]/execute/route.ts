import { mirageRequest } from "@/lib/edgectl/server/client";
import { forward, invalid, readJson, refuseCrossSite } from "@/lib/edgectl/server/respond";
import { dependencyProposalSchema, executeSchema, pathId } from "@/lib/edgectl/validators";

// Execute an approved proposal: the Ghost really installs software on its host. The body must
// repeat the proposal id, so this can only be the result of the confirmation dialog. Takes minutes;
// never retried and never called by a test.
export async function POST(request: Request, ctx: { params: Promise<{ proposalId: string }> }) {
  const refused = refuseCrossSite(request, { body: true });
  if (refused) return refused;
  const id = pathId.safeParse((await ctx.params).proposalId);
  if (!id.success) return invalid(id.error);
  const body = executeSchema.safeParse(await readJson(request));
  if (!body.success) return invalid(body.error);
  if (body.data.confirm !== id.data) {
    return Response.json({ error: "The confirmation does not name this proposal" }, { status: 400 });
  }
  return forward(() =>
    mirageRequest("POST", ["dependencies", "proposals", id.data, "execute"], {
      schema: dependencyProposalSchema,
      timeoutMs: 900_000,
    }),
  );
}
