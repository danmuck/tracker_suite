import { MirageError, mirageRequest } from "@/lib/edgectl/server/client";
import { takeApproval } from "@/lib/edgectl/server/approvals";
import { signApproval } from "@/lib/edgectl/server/edgecert";
import { forward, invalid, readJson, refuseCrossSite } from "@/lib/edgectl/server/respond";
import { approveSchema, dependencyProposalSchema, pathId } from "@/lib/edgectl/validators";

// Step two of approving: the operator confirmed the digest they were shown. The payload signed is
// the one this server kept for that digest (edgecert refuses any other), and the call to Mirage
// goes out on a connection authenticated as the second operator. Never retried.
export async function POST(request: Request, ctx: { params: Promise<{ proposalId: string }> }) {
  const refused = refuseCrossSite(request, { body: true });
  if (refused) return refused;
  const id = pathId.safeParse((await ctx.params).proposalId);
  if (!id.success) return invalid(id.error);
  const body = approveSchema.safeParse(await readJson(request));
  if (!body.success) return invalid(body.error);

  return forward(async () => {
    const taken = takeApproval(id.data, body.data.digest);
    if (!taken.ok) throw new MirageError("api", taken.message, { status: 409 });
    const { approval } = await signApproval(taken.payload, taken.digest);
    return mirageRequest("POST", ["dependencies", "proposals", id.data, "approve"], {
      body: { approval },
      schema: dependencyProposalSchema,
      identity: "approver",
    });
  });
}
