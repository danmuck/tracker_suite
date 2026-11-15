import Account, { type IAccount } from "@/models/finance/Account";
import Transaction, { type ITransaction } from "@/models/finance/Transaction";
import FinanceProfile from "@/models/finance/FinanceProfile";
import { localTodayStr, toDateStr } from "./dates";
import { amountOn } from "./amount-schedule";
import { blendedApr } from "./interest";
import { estimatePayoff, type PayoffEstimate } from "./payoff";
import { paydaysInYear, priorYearAgi, rapScheduleEntries } from "./rap";
import { mergeRapEntries, type ScheduleEntry } from "./rap-merge";
import { getPeriodsPerYear } from "./tax-calculator";
import { profileDocToData } from "./apply-profile";

const RAP_YEARS_AHEAD = 10;
const DEFAULT_RAP = { enabled: false, autoSchedule: true, recertDate: "07-01", dependents: 0 };

export class PaymentPlanError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

/** API shape: dollars and percent. */
export interface PaymentPlanDTO {
  accountId: string;
  apr: number | null;
  blendedApr: number | null;
  minimumPayment: number | null;
  subLoans: { name: string; balance: number; apr: number }[];
  rap: { enabled: boolean; autoSchedule: boolean; recertDate: string; dependents: number } | null;
  payment: { transactionId: string; fromAccountId: string; fromAccountName: string; dayOfMonth: number | null; frequency: string } | null;
  schedule: ScheduleEntry[];
  nextRap: { effectiveDate: string; amount: number; incomeYear: number; agi: number } | null;
  payoff: PayoffEstimate | null;
}

const dollars = (cents: number) => cents / 100;
const percent = (fraction: number) => Math.round(fraction * 1e6) / 1e4;

async function loadAccount(accountId: string) {
  const account = await Account.findById(accountId);
  if (!account) throw new PaymentPlanError("Account not found", 404);
  if (account.type !== "credit_card" && account.type !== "debt") {
    throw new PaymentPlanError("Payment plans are for credit cards and debt accounts", 400);
  }
  return account;
}

async function loadPaymentTx(account: IAccount): Promise<ITransaction | null> {
  if (!account.paymentTransactionId) return null;
  return Transaction.findById(account.paymentTransactionId);
}

function scheduleOf(tx: ITransaction | null): ScheduleEntry[] {
  return (tx?.amountSchedule ?? [])
    .map((e) => ({ effectiveDate: toDateStr(e.effectiveDate), amount: e.amount, ...(e.source ? { source: e.source } : {}) }))
    .sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));
}

/** Estimated AGI (cents) per calendar year from the Datasheet and its linked Salary paydays. */
async function agiLookup(): Promise<(year: number) => number | null> {
  const profile = profileDocToData(await FinanceProfile.findOne());
  const salaryTx = profile.salaryTransactionId ? await Transaction.findById(profile.salaryTransactionId) : null;
  const rule = salaryTx?.recurrenceRule;
  if (!rule) return () => null;
  const periods = getPeriodsPerYear(rule.frequency);
  const ruleStr = {
    frequency: rule.frequency,
    interval: rule.interval,
    startDate: rule.startDate.toISOString(),
    endDate: rule.endDate?.toISOString() ?? null,
    dayOfWeek: rule.dayOfWeek,
    dayOfMonth: rule.dayOfMonth,
    daysOfMonth: rule.daysOfMonth,
  };
  return (year: number) => {
    // Paydays on the salary's rhythm for the whole year; salary steps decide which count
    const paydays = paydaysInYear(ruleStr, year);
    return priorYearAgi(profile, paydays, year, periods);
  };
}

async function writeSchedule(tx: ITransaction, entries: ScheduleEntry[]) {
  if (entries.length === 0) {
    await Transaction.updateOne({ _id: tx._id }, { $unset: { amountSchedule: 1 } });
    return;
  }
  tx.amountSchedule = entries.map((e) => ({
    effectiveDate: new Date(e.effectiveDate),
    amount: e.amount,
    ...(e.source ? { source: e.source } : {}),
  }));
  tx.amount = amountOn(entries[0].amount, entries, localTodayStr());
  await tx.save();
}

/** Rebuild the automatic RAP entries on the account's payment schedule (manual entries untouched). */
export async function regenerateRapSchedule(accountId: string): Promise<void> {
  const account = await Account.findById(accountId);
  if (!account) return;
  const tx = await loadPaymentTx(account);
  if (!tx) return;
  const manual = scheduleOf(tx).filter((e) => !e.source);
  const rap = account.rap;
  const generated =
    rap?.enabled && rap.autoSchedule
      ? rapScheduleEntries({
          recertDate: rap.recertDate,
          dependents: rap.dependents,
          today: localTodayStr(),
          years: RAP_YEARS_AHEAD,
          agiForYear: await agiLookup(),
        })
      : [];
  await writeSchedule(tx, mergeRapEntries(manual, generated));
}

export async function regenerateAllRapSchedules(): Promise<void> {
  const accounts = await Account.find({ "rap.enabled": true, paymentTransactionId: { $ne: null } });
  for (const a of accounts) await regenerateRapSchedule(a._id.toString());
}

export async function getPaymentPlan(accountId: string): Promise<PaymentPlanDTO> {
  const account = await loadAccount(accountId);
  const tx = await loadPaymentTx(account);
  const schedule = scheduleOf(tx);
  const today = localTodayStr();
  const apr = blendedApr(account.subLoans, account.apr);
  // Read fields explicitly: spreading a Mongoose subdocument copies its internals
  const rap = account.rap
    ? {
        enabled: account.rap.enabled ?? DEFAULT_RAP.enabled,
        autoSchedule: account.rap.autoSchedule ?? DEFAULT_RAP.autoSchedule,
        recertDate: account.rap.recertDate ?? DEFAULT_RAP.recertDate,
        dependents: account.rap.dependents ?? DEFAULT_RAP.dependents,
      }
    : null;

  let payment: PaymentPlanDTO["payment"] = null;
  if (tx) {
    const from = await Account.findById(tx.accountId);
    payment = {
      transactionId: tx._id.toString(),
      fromAccountId: tx.accountId.toString(),
      fromAccountName: from?.name ?? "Unknown account",
      dayOfMonth: tx.recurrenceRule?.dayOfMonth ?? null,
      frequency: tx.recurrenceRule?.frequency ?? "monthly",
    };
  }

  let nextRap: PaymentPlanDTO["nextRap"] = null;
  if (rap?.enabled) {
    const agiForYear = await agiLookup();
    const [first] = rapScheduleEntries({ recertDate: rap.recertDate, dependents: rap.dependents, today, years: RAP_YEARS_AHEAD, agiForYear });
    if (first) {
      const incomeYear = Number(first.effectiveDate.slice(0, 4)) - 1;
      nextRap = { effectiveDate: first.effectiveDate, amount: dollars(first.amount), incomeYear, agi: dollars(agiForYear(incomeYear) ?? 0) };
    }
  }

  const paymentDay = payment?.dayOfMonth ?? Number((schedule[0]?.effectiveDate ?? today).slice(8, 10));
  const payoff =
    tx && schedule.length > 0
      ? estimatePayoff({ balance: account.balance, apr, schedule, paymentDay, startDate: today, rap: !!rap?.enabled })
      : null;

  return {
    accountId,
    apr: account.apr != null ? percent(account.apr) : null,
    blendedApr: account.subLoans?.length ? percent(apr) : null,
    minimumPayment: account.minimumPayment != null ? dollars(account.minimumPayment) : null,
    subLoans: (account.subLoans ?? []).map((l) => ({ name: l.name, balance: dollars(l.balance), apr: percent(l.apr) })),
    rap,
    payment,
    schedule: schedule.map((e) => ({ ...e, amount: dollars(e.amount) })),
    nextRap,
    payoff,
  };
}

export async function setupPayments(
  accountId: string,
  input: { fromAccountId: string; dayOfMonth: number; startDate: string; firstAmount: number }
) {
  const account = await loadAccount(accountId);
  if (await loadPaymentTx(account)) {
    throw new PaymentPlanError("Payments are already set up for this account — unlink them first", 409);
  }
  const from = await Account.findById(input.fromAccountId);
  if (!from || from.type !== "bank" || from.isArchived) {
    throw new PaymentPlanError("Payments must come from an active bank account", 400);
  }
  const cents = Math.round(input.firstAmount * 100);
  const tx = await Transaction.create({
    amount: cents,
    date: new Date(input.startDate),
    description: `${account.name} payment`,
    accountId: from._id,
    toAccountId: account._id,
    type: "transfer",
    isRecurring: true,
    recurrenceRule: { frequency: "monthly", interval: 1, startDate: new Date(input.startDate), endDate: null, dayOfMonth: input.dayOfMonth },
    categoryTags: [account.type === "credit_card" ? "credit" : "loans", "transfer"],
    balanceApplied: false,
    amountSchedule: [{ effectiveDate: new Date(input.startDate), amount: cents }],
  });
  account.paymentTransactionId = tx._id as IAccount["paymentTransactionId"];
  await account.save();
  await regenerateRapSchedule(accountId);
}

export async function updatePaymentPlan(
  accountId: string,
  input: {
    schedule?: { effectiveDate: string; amount: number }[];
    subLoans?: { name: string; balance: number; apr: number }[];
    rap?: { enabled: boolean; autoSchedule: boolean; recertDate: string; dependents: number };
  }
) {
  const account = await loadAccount(accountId);
  if (input.schedule) {
    const tx = await loadPaymentTx(account);
    if (!tx) throw new PaymentPlanError("No payment linked — set up payments", 409);
    const manual = input.schedule.map((e) => ({ effectiveDate: e.effectiveDate, amount: Math.round(e.amount * 100) }));
    const rapEntries = scheduleOf(tx).filter((e) => e.source === "rap");
    await writeSchedule(tx, mergeRapEntries(manual, rapEntries));
  }
  if (input.subLoans) {
    account.subLoans = input.subLoans.map((l) => ({ name: l.name, balance: Math.round(l.balance * 100), apr: l.apr / 100 }));
  }
  if (input.rap) {
    if (account.type !== "debt") throw new PaymentPlanError("RAP applies to debt accounts only", 400);
    account.rap = input.rap;
  }
  if (input.subLoans || input.rap) await account.save();
  await regenerateRapSchedule(accountId);
}

/**
 * Remove the payment plan: unlink it and delete its payment transfer. Payments it
 * already posted stay in the balances (that money moved), so nothing is reversed.
 */
export async function unlinkPaymentPlan(accountId: string) {
  const account = await loadAccount(accountId);
  if (account.paymentTransactionId) await Transaction.deleteOne({ _id: account.paymentTransactionId });
  await Account.updateOne({ _id: account._id }, { $unset: { paymentTransactionId: 1 } });
}
