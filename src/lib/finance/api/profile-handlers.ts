// Datasheet profile routes (R21–R23) as store-backed handlers, shared by the server and browser data modes.
// Same order as src/app/api/finance-profile/route.ts and src/app/api/finance-profile/merge-rent/route.ts.
// Pure: no framework, browser or server imports (browser-reachable).

import { z } from "zod";
import { fail, ok, type Handler } from "@/lib/data/api";
import { toDateStr } from "@/lib/finance/dates";
import { profileFromDollars, profileToDollars } from "@/lib/finance/finance-profile";
import { financeProfileSchema } from "@/lib/finance/validators";
import { assertId, loadProfile, saveTransaction, shapeTransaction, transactions } from "./docs";
import { LinkedTransactionMissingError, saveProfileAndApply } from "./profile";

/** A LinkedTransactionMissingError becomes the 409 with its message; anything else is the route's 500. */
const linkErrors =
  (handler: Handler): Handler =>
  async (ctx) => {
    try {
      return await handler(ctx);
    } catch (error) {
      if (error instanceof LinkedTransactionMissingError) return fail(409, error.message);
      throw error;
    }
  };

/** GET — the Datasheet profile (money in dollars). */
export const getProfile: Handler = async ({ store }) => ok({ data: profileToDollars(await loadProfile(store)) });

/** PUT — save and write Salary/Rent amount schedules. */
export const saveProfile: Handler = linkErrors(async ({ store, body, now }) => {
  const parsed = financeProfileSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return fail(400, first?.message ?? "Validation failed", parsed.error.flatten());
  }
  const updated = await saveProfileAndApply(store, profileFromDollars(parsed.data), now);
  return ok({ data: profileToDollars(await loadProfile(store)), updated });
});

const mergeSchema = z.object({ keepId: z.string().min(1), mergeId: z.string().min(1) });

/**
 * POST — fold a second Rent transaction into the linked one as a dated rent change, then delete it.
 * As today, the kept rule's endDate is written and the merged transaction deleted before the
 * profile is saved and applied, so a failure there leaves both writes in place.
 */
export const mergeRent: Handler = linkErrors(async ({ store, body, now }) => {
  const parsed = mergeSchema.safeParse(body);
  if (!parsed.success || parsed.data.keepId === parsed.data.mergeId) {
    return fail(400, "keepId and mergeId must be two different transactions");
  }
  const { keepId, mergeId } = parsed.data;
  assertId(keepId);
  assertId(mergeId);
  const tx = transactions(store);
  const [keepRaw, mergeRaw] = await Promise.all([tx.findById(keepId), tx.findById(mergeId)]); // M1
  const keep = keepRaw ? shapeTransaction(keepRaw) : null;
  const merge = mergeRaw ? shapeTransaction(mergeRaw) : null;
  if (!keepRaw || !keep || !merge || !keep.isRecurring || !merge.isRecurring || !merge.recurrenceRule) {
    return fail(404, "Both transactions must exist and be recurring");
  }

  const profile = await loadProfile(store);
  const mergeDate = toDateStr(merge.recurrenceRule.startDate);
  const rentSteps = [...profile.rentSteps];
  // Keep the existing amount as the first step if the profile has none yet
  if (rentSteps.length === 0 && keep.recurrenceRule) {
    rentSteps.push({ effectiveDate: toDateStr(keep.recurrenceRule.startDate), monthly: keep.amount });
  }
  if (!rentSteps.some((s) => s.effectiveDate === mergeDate)) {
    rentSteps.push({ effectiveDate: mergeDate, monthly: merge.amount });
  }

  if (keep.recurrenceRule) {
    // M2: what keep.save() persists after assigning recurrenceRule.endDate
    await saveTransaction(store, keepRaw, { "recurrenceRule.endDate": merge.recurrenceRule.endDate ?? null });
  }
  await tx.deleteById(mergeId); // M3

  const updated = await saveProfileAndApply(store, { ...profile, rentTransactionId: keepId, rentSteps }, now);
  return ok({ data: profileToDollars(await loadProfile(store)), updated });
});
