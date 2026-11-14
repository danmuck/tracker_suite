import FinanceProfile, { type IFinanceProfile } from "@/models/finance/FinanceProfile";
import Transaction from "@/models/finance/Transaction";
import { toDateStr, localTodayStr } from "./dates";
import { buildRentSchedule, buildSalarySchedule } from "./datasheet";
import { amountOn } from "./amount-schedule";
import { getPeriodsPerYear } from "./tax-calculator";
import { DEFAULT_PROFILE } from "./finance-profile";
import type { FinanceProfileData, ScheduleEntry } from "@/types/finance/datasheet";

export class LinkedTransactionMissingError extends Error {
  constructor(public kind: "Salary" | "Rent") {
    super(`Linked ${kind} transaction not found — pick one`);
  }
}

/** Mongo document → plain profile data (cents, yyyy-MM-dd). */
export function profileDocToData(doc: IFinanceProfile | null): FinanceProfileData {
  if (!doc) return { ...DEFAULT_PROFILE };
  const step = <T extends { effectiveDate: Date }>(s: T) => ({ ...s, effectiveDate: toDateStr(s.effectiveDate) });
  const o = doc.toObject();
  return {
    filingStatus: o.filingStatus,
    hoursPerWeek: o.hoursPerWeek,
    nycResident: o.nycResident,
    raiseRate: o.raiseRate,
    salaryTransactionId: o.salaryTransactionId ? o.salaryTransactionId.toString() : null,
    rentTransactionId: o.rentTransactionId ? o.rentTransactionId.toString() : null,
    salarySteps: o.salarySteps.map(step),
    retirementSteps: o.retirementSteps.map(step),
    healthSteps: o.healthSteps.map(step),
    rentSteps: o.rentSteps.map(step),
    whatIfSalaries: o.whatIfSalaries.map((w: { label?: string; annualGross: number }) => ({
      ...(w.label ? { label: w.label } : {}),
      annualGross: w.annualGross,
    })),
  };
}

/** Plain profile data → values for Mongo (dates as UTC-midnight Dates). */
function profileDataToDoc(p: FinanceProfileData) {
  const step = <T extends { effectiveDate: string }>(s: T) => ({ ...s, effectiveDate: new Date(s.effectiveDate) });
  return {
    ...p,
    salaryTransactionId: p.salaryTransactionId || null,
    rentTransactionId: p.rentTransactionId || null,
    salarySteps: p.salarySteps.map(step),
    retirementSteps: p.retirementSteps.map(step),
    healthSteps: p.healthSteps.map(step),
    rentSteps: p.rentSteps.map(step),
  };
}

export async function loadProfile(): Promise<FinanceProfileData> {
  return profileDocToData(await FinanceProfile.findOne());
}

async function writeSchedule(id: string, kind: "Salary" | "Rent", build: (frequency: string) => ScheduleEntry[]) {
  const tx = await Transaction.findById(id);
  if (!tx) throw new LinkedTransactionMissingError(kind);
  const schedule = build(tx.recurrenceRule?.frequency ?? "biweekly");
  if (schedule.length === 0) {
    await clearSchedule(id);
    return false;
  }
  const today = localTodayStr();
  tx.amountSchedule = schedule.map((e) => ({ effectiveDate: new Date(e.effectiveDate), amount: e.amount }));
  tx.amount = amountOn(schedule[0].amount, schedule, today);
  await tx.save();
  return true;
}

/** Stop the Datasheet managing a transaction: its plain `amount` applies again. */
async function clearSchedule(id: string | null | undefined) {
  if (id) await Transaction.updateOne({ _id: id }, { $unset: { amountSchedule: 1 } });
}

/**
 * Validate links, save the profile, and write net-pay / rent schedules onto
 * the linked recurring transactions. Throws LinkedTransactionMissingError.
 */
export async function saveProfileAndApply(p: FinanceProfileData) {
  // Check links before saving anything so a bad link leaves no partial write
  if (p.salaryTransactionId && !(await Transaction.exists({ _id: p.salaryTransactionId }))) {
    throw new LinkedTransactionMissingError("Salary");
  }
  if (p.rentTransactionId && !(await Transaction.exists({ _id: p.rentTransactionId }))) {
    throw new LinkedTransactionMissingError("Rent");
  }

  const previous = await loadProfile();
  await FinanceProfile.findOneAndUpdate({}, profileDataToDoc(p), { upsert: true, runValidators: true });

  // Transactions that were unlinked or swapped out keep no stale schedule
  if (previous.salaryTransactionId !== (p.salaryTransactionId || null)) await clearSchedule(previous.salaryTransactionId);
  if (previous.rentTransactionId !== (p.rentTransactionId || null)) await clearSchedule(previous.rentTransactionId);

  const updated = { salary: false, rent: false };
  if (p.salaryTransactionId) {
    updated.salary = await writeSchedule(p.salaryTransactionId, "Salary", (f) =>
      buildSalarySchedule(p, getPeriodsPerYear(f))
    );
  }
  if (p.rentTransactionId) {
    updated.rent = await writeSchedule(p.rentTransactionId, "Rent", () => buildRentSchedule(p));
  }
  return updated;
}
