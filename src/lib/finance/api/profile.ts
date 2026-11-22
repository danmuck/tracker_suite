// Saving the Datasheet profile and applying it to the linked Salary and Rent transactions, over the Store.
// Used by the profile routes in both data sources.
// Pure: no framework, browser or server imports (browser-reachable).

import type { Store } from "@/lib/data/store";
import { amountOn } from "@/lib/finance/amount-schedule";
import { buildRentSchedule, buildSalarySchedule } from "@/lib/finance/datasheet";
import { localDateStr, toIso } from "@/lib/finance/dates";
import { getPeriodsPerYear } from "@/lib/finance/tax-calculator";
import type { FinanceProfileData, ScheduleEntry } from "@/types/finance/datasheet";
import { assertId, loadProfile, profileToDoc, profiles, saveTransaction, shapeTransaction, transactions } from "./docs";
import { regenerateAllRapSchedules } from "./payment-plan";

export class LinkedTransactionMissingError extends Error {
  kind: "Salary" | "Rent";

  constructor(kind: "Salary" | "Rent") {
    super(`Linked ${kind} transaction not found — pick one`);
    this.kind = kind;
  }
}

/** Stop the Datasheet managing a transaction: its plain `amount` applies again (AP4). */
async function clearSchedule(store: Store, id: string | null | undefined): Promise<void> {
  if (id) await transactions(store).updateById(id, { $unset: { amountSchedule: 1 } });
}

async function writeSchedule(
  store: Store,
  id: string,
  kind: "Salary" | "Rent",
  build: (frequency: string) => ScheduleEntry[],
  now: Date,
): Promise<boolean> {
  const raw = await transactions(store).findById(id); // AP2
  if (!raw) throw new LinkedTransactionMissingError(kind);
  const tx = shapeTransaction(raw);
  const schedule = build(tx.recurrenceRule?.frequency ?? "biweekly");
  if (schedule.length === 0) {
    await clearSchedule(store, id);
    return false;
  }
  // AP3: what tx.save() persists after assigning amountSchedule, amount and, for Rent with a
  // rule, recurrenceRule.startDate and date (rent begins when the first rent step does)
  const start = toIso(schedule[0].effectiveDate);
  await saveTransaction(store, raw, {
    amountSchedule: schedule.map((e) => ({ effectiveDate: toIso(e.effectiveDate), amount: e.amount })),
    amount: amountOn(schedule[0].amount, schedule, localDateStr(now)),
    ...(kind === "Rent" && raw.recurrenceRule ? { "recurrenceRule.startDate": start, date: start } : {}),
  });
  return true;
}

/**
 * The profile's Salary and Rent links: a malformed id throws (the route's 500), a missing
 * transaction throws LinkedTransactionMissingError (the 409). Reads only.
 */
export async function checkProfileLinks(store: Store, p: FinanceProfileData): Promise<void> {
  const tx = transactions(store);
  if (p.salaryTransactionId) {
    assertId(p.salaryTransactionId);
    if (!(await tx.exists({ _id: p.salaryTransactionId }))) throw new LinkedTransactionMissingError("Salary");
  }
  if (p.rentTransactionId) {
    assertId(p.rentTransactionId);
    if (!(await tx.exists({ _id: p.rentTransactionId }))) throw new LinkedTransactionMissingError("Rent");
  }
}

/**
 * Validate links, save the profile, and write net-pay / rent schedules onto the linked
 * recurring transactions, then refresh automatic RAP schedules. Throws LinkedTransactionMissingError.
 */
export async function saveProfileAndApply(
  store: Store,
  p: FinanceProfileData,
  now: Date,
): Promise<{ salary: boolean; rent: boolean }> {
  // Check links before saving anything so a bad link leaves no partial write (AP5, AP6)
  await checkProfileLinks(store, p);

  const previous = await loadProfile(store); // AP1
  await profiles(store).updateOne({}, { $set: profileToDoc(p) }, { upsert: true }); // AP7

  // Transactions that were unlinked or swapped out keep no stale schedule
  if (previous.salaryTransactionId !== (p.salaryTransactionId || null)) {
    await clearSchedule(store, previous.salaryTransactionId);
  }
  if (previous.rentTransactionId !== (p.rentTransactionId || null)) {
    await clearSchedule(store, previous.rentTransactionId);
  }

  const updated = { salary: false, rent: false };
  if (p.salaryTransactionId) {
    updated.salary = await writeSchedule(
      store,
      p.salaryTransactionId,
      "Salary",
      (f) => buildSalarySchedule(p, getPeriodsPerYear(f)),
      now,
    );
  }
  if (p.rentTransactionId) {
    updated.rent = await writeSchedule(store, p.rentTransactionId, "Rent", () => buildRentSchedule(p), now);
  }
  // RAP payments are priced from Datasheet income, so refresh them too
  await regenerateAllRapSchedules(store, now);
  return updated;
}
