import { MirageError, mirageRequest } from "@/lib/edgectl/server/client";
import { issueGhostCertificate } from "@/lib/edgectl/server/edgecert";
import { forward, invalid, readJson, refuseCrossSite } from "@/lib/edgectl/server/respond";
import { childGhostId, localGhostId } from "@/lib/edgectl/local-ghost";
import { addGhostSchema, ghostsSchema, principalId, spawnResultSchema } from "@/lib/edgectl/validators";

// Add a Ghost: issue its certificate as operator tooling (Mirage never issues one), then ask Mirage
// to spawn it. The certificate id must be "<local ghost id>.<target_name>"; the local Ghost is
// worked out here from Mirage's own list, never taken from the browser. Not idempotent: never retried.
export async function POST(request: Request) {
  const refused = refuseCrossSite(request, { body: true });
  if (refused) return refused;
  const body = addGhostSchema.safeParse(await readJson(request));
  if (!body.success) return invalid(body.error);

  return forward(async () => {
    const { ghosts } = await mirageRequest("GET", ["ghosts"], { schema: ghostsSchema, timeoutMs: 15_000 });
    const local = localGhostId(
      ghosts.map((ghost) => ghost.ghost_id),
      process.env.EDGECTL_LOCAL_GHOST_ID,
    );
    if (!local.ok) throw new MirageError("api", local.message, { status: 409 });
    const id = principalId.safeParse(childGhostId(local.id, body.data.target_name));
    if (!id.success) {
      throw new MirageError("api", `"${local.id}.${body.data.target_name}" is too long for a Ghost id (63 characters at most)`, {
        status: 400,
      });
    }
    if (ghosts.some((ghost) => ghost.ghost_id === id.data)) {
      throw new MirageError("api", `Ghost ${id.data} already exists`, { status: 409 });
    }
    await issueGhostCertificate(id.data);
    return mirageRequest("POST", ["ghosts", "spawn-local"], {
      body: body.data,
      schema: spawnResultSchema,
      timeoutMs: 30_000,
    });
  });
}
