// What the scratchpad editor saves, and which save answers it may keep. Pure: no framework,
// browser or server imports.
//
// `sent` is the content the server has, or will have once the saves already requested land: the
// loaded content at first, then the value of each requested save. A value equal to it is never
// sent again, so an untouched editor (a blur, a debounce that ends where it started) never writes.
// `null` means unknown (the latest save failed): the next request is sent whatever it holds.
//
// Saves are numbered. Only an answer newer than every answer applied so far may update the cache:
// an older save that resolves last never puts older content back.

export interface ScratchpadSync {
  sent: string | null;
  /** Number of the latest requested save (0: none yet). */
  seq: number;
  /** Number of the newest save whose answer was applied (0: none). */
  applied: number;
}

export const startSync = (loaded: string): ScratchpadSync => ({ sent: loaded, seq: 0, applied: 0 });

/** Whether `value` needs a save; if so, the save's number and the state with it requested. */
export function requestSave(
  state: ScratchpadSync,
  value: string,
): { state: ScratchpadSync; save: { seq: number; value: string } | null } {
  if (state.sent !== null && value === state.sent) return { state, save: null };
  const seq = state.seq + 1;
  return { state: { ...state, sent: value, seq }, save: { seq, value } };
}

/** A save answered: `apply` says whether its document may go into the cache. */
export function saveSucceeded(state: ScratchpadSync, seq: number): { state: ScratchpadSync; apply: boolean } {
  if (seq <= state.applied) return { state, apply: false };
  return { state: { ...state, applied: seq }, apply: true };
}

/**
 * A save failed. If it was the latest request, what the server holds is unknown, so the next
 * request is sent even if it repeats the value; an older failure is covered by the newer save.
 */
export function saveFailed(state: ScratchpadSync, seq: number): ScratchpadSync {
  return seq === state.seq ? { ...state, sent: null } : state;
}
