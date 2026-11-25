// Which registered Ghost is Mirage's local one. A Ghost that Mirage spawns is named
// "<local ghost id>.<target name>", and its certificate must carry exactly that id. api/v1 does
// not say which Ghost is local, so it is worked out from the ids.

export type LocalGhost = { ok: true; id: string } | { ok: false; message: string };

/**
 * `configured` (EDGECTL_LOCAL_GHOST_ID) wins when set. Otherwise the local Ghost is the only
 * listed id that is not "<another listed id>.<name>".
 */
export function localGhostId(ghostIds: string[], configured?: string): LocalGhost {
  const fixed = configured?.trim();
  if (fixed) return { ok: true, id: fixed };
  const ids = [...new Set(ghostIds.map((id) => id.trim()).filter(Boolean))];
  const roots = ids.filter((id) => !ids.some((other) => other !== id && id.startsWith(`${other}.`)));
  if (roots.length === 1) return { ok: true, id: roots[0] };
  if (roots.length === 0) {
    return { ok: false, message: "Mirage lists no Ghost, so there is no local Ghost to add one under" };
  }
  return {
    ok: false,
    message: `Mirage lists ${roots.length} Ghosts that could be its local one (${roots.join(", ")}). Set EDGECTL_LOCAL_GHOST_ID on the server`,
  };
}

/** The id a spawned Ghost gets, and the id its certificate must be issued for */
export const childGhostId = (localId: string, targetName: string) => `${localId}.${targetName}`;
