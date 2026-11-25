import { MirageError, mirageRequest } from "@/lib/edgectl/server/client";
import { holdApproval } from "@/lib/edgectl/server/approvals";
import { buildApproval } from "@/lib/edgectl/server/edgecert";
import { forward, invalid, refuseCrossSite } from "@/lib/edgectl/server/respond";
import { dependencyProposalSchema, pathId } from "@/lib/edgectl/validators";
import type { PreparedApproval } from "@/types/edgectl/api";

// Step one of approving: build the unsigned payload for the second operator and answer with what
// the operator must confirm (the proposal and the payload digest). Nothing is signed. The payload
// stays on this server; the browser gets only its digest.
export async function POST(request: Request, ctx: { params: Promise<{ proposalId: string }> }) {
  const refused = refuseCrossSite(request, { body: false });
  if (refused) return refused;
  const id = pathId.safeParse((await ctx.params).proposalId);
  if (!id.success) return invalid(id.error);

  return forward(async (): Promise<PreparedApproval> => {
    // No schema: edgecert must get the proposal exactly as Mirage returned it.
    const raw = await mirageRequest("GET", ["dependencies", "proposals", id.data]);
    const proposal = dependencyProposalSchema.safeParse(raw);
    if (!proposal.success) {
      throw new MirageError("bad_response", "Mirage sent data that does not match the api/v1 contract");
    }
    const unsigned = await buildApproval(raw);
    holdApproval(id.data, { payload: unsigned.payload, digest: unsigned.digest, expiresAtMs: unsigned.expires_at_ms });
    return {
      proposal: proposal.data,
      digest: unsigned.digest,
      approver: unsigned.approver,
      proposer: unsigned.proposer,
      expires_at_ms: unsigned.expires_at_ms,
    };
  });
}
