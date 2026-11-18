// Datasheet profile routes (R21–R23) as store-backed handlers, shared by the server and browser data modes.
// Served by src/app/api/finance-profile/route.ts and merge-rent/route.ts, which only call serve().
// Pure: no framework, browser or server imports (browser-reachable).

import { z } from "zod";
import { fail, ok, type Handler } from "@/lib/data/api";
import { amountOn } from "@/lib/finance/amount-schedule";
import { toDateStr } from "@/lib/finance/dates";
import { profileFromDollars, profileToDollars } from "@/lib/finance/finance-profile";
import { financeProfileSchema } from "@/lib/finance/validators";
import { accounts, assertId, loadProfile, saveTransaction, shapeTransaction, transactions } from "./docs";
import { checkProfileLinks, LinkedTransactionMissingError, saveProfileAndApply } from "./profile";

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
 * POST — fold a second Rent transaction into the linked one as dated rent changes, then delete it.
 * The merged one's amounts become rent steps (its start, then its own later schedule entries; a
 * date the kept steps already have keeps the kept amount), stored in date order; a Rent link to it
 * moves to the kept one (bug 13). A transaction in another role (the Datasheet's Salary, a
 * payment plan's transfer) is refused on either side: deleting it would orphan that role, and the
 * kept one gets the rent schedule written over its own. Every check runs before the first write.
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
  // A role the rent cannot take over (merged side) or would overwrite (kept side)
  for (const id of [mergeId, keepId]) {
    if (profile.salaryTransactionId === id) return fail(400, "That transaction is linked as Salary");
    if (await accounts(store).exists({ paymentTransactionId: id })) return fail(400, "That transaction is a loan payment");
  }
  const mergeDate = toDateStr(merge.recurrenceRule.startDate);
  const rentSteps = [...profile.rentSteps];
  // Keep the existing amount as the first step if the profile has none yet
  if (rentSteps.length === 0 && keep.recurrenceRule) {
    rentSteps.push({ effectiveDate: toDateStr(keep.recurrenceRule.startDate), monthly: keep.amount });
  }
  // What the merged transaction charged on its start date, then its later schedule entries by date
  const mergedSteps = [
    { effectiveDate: mergeDate, monthly: amountOn(merge.amount, merge.amountSchedule, mergeDate) },
    ...(merge.amountSchedule ?? [])
      .map((e) => ({ effectiveDate: toDateStr(e.effectiveDate), monthly: e.amount }))
      .filter((e) => e.effectiveDate > mergeDate)
      .sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate)),
  ];
  for (const step of mergedSteps) {
    if (!rentSteps.some((s) => s.effectiveDate === step.effectiveDate)) rentSteps.push(step);
  }
  rentSteps.sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));
  // The Rent link moves to the kept one whether it was the merged one, the kept one or unset
  const next = { ...profile, rentTransactionId: keepId, rentSteps };
  await checkProfileLinks(store, next);

  if (keep.recurrenceRule) {
    // M2: what keep.save() persists after assigning recurrenceRule.endDate
    await saveTransaction(store, keepRaw, { "recurrenceRule.endDate": merge.recurrenceRule.endDate ?? null });
  }
  await tx.deleteById(mergeId); // M3

  const updated = await saveProfileAndApply(store, next, now);
  return ok({ data: profileToDollars(await loadProfile(store)), updated });
});
