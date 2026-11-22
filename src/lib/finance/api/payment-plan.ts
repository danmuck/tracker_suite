// Payment plans over the Store: reading a plan, setting up, updating and unlinking payments, and
// the RAP schedule. Changes to a loaded account or transaction go through saveAccount /
// saveTransaction, which reproduce Mongoose save() semantics.
// Pure: no framework, browser or server imports (browser-reachable).

import { addYears } from "date-fns";
import { isId } from "@/lib/data/api";
import type { Store } from "@/lib/data/store";
import { amountOn } from "@/lib/finance/amount-schedule";
import { asDate, fromDateStr, localDateStr, toDateStr, toIso } from "@/lib/finance/dates";
import { blendedApr } from "@/lib/finance/interest";
import { estimatePayoff, type PayoffEstimate } from "@/lib/finance/payoff";
import { paydaysInYear, priorYearAgi, rapScheduleEntries } from "@/lib/finance/rap";
import { mergeRapEntries, type ScheduleEntry } from "@/lib/finance/rap-merge";
import { expandRecurrence } from "@/lib/finance/recurrence";
import { getPeriodsPerYear } from "@/lib/finance/tax-calculator";
import {
  accounts,
  assertId,
  loadProfile,
  RAP_DEFAULTS,
  saveAccount,
  saveTransaction,
  shapeAccount,
  shapeTransaction,
  transactions,
  type AccountDoc,
  type StoredRule,
  type TransactionDoc,
} from "./docs";
import { clearTransactionLinks } from "./links";

const RAP_YEARS_AHEAD = 10;
const PAYOFF_YEARS_AHEAD = 50;
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

/** A recurrence rule in words, including its interval (weekly × 4 = "every 4 weeks"). */
export function describeCadence(
  rule: Pick<StoredRule, "frequency" | "interval" | "dayOfWeek" | "dayOfMonth"> | null | undefined,
): string {
  if (!rule) return "monthly";
  const interval = rule.interval || 1;
  const weekday = rule.dayOfWeek != null ? ` on ${WEEKDAYS[rule.dayOfWeek]}` : "";
  switch (rule.frequency) {
    case "monthly":
      if (interval > 1) return `every ${interval} months`;
      return rule.dayOfMonth ? `monthly on the ${ordinal(rule.dayOfMonth)}` : "monthly";
    case "weekly":
      return interval > 1 ? `every ${interval} weeks${weekday}` : `weekly${weekday}`;
    case "biweekly":
      return `every 2 weeks${weekday}`; // the biweekly rule has a fixed two-week step
    case "semi_monthly":
      return "twice a month";
    case "annually":
      return interval > 1 ? `every ${interval} years` : "yearly";
    case "daily":
      return interval > 1 ? `every ${interval} days` : "daily";
    default:
      return rule.frequency;
  }
}

export class PaymentPlanError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
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
  payment: {
    transactionId: string;
    fromAccountId: string;
    fromAccountName: string;
    dayOfMonth: number | null;
    frequency: string;
    /** How often it is paid, in words: "monthly on the 12th", "every 4 weeks on Friday" */
    cadence: string;
  } | null;
  schedule: ScheduleEntry[];
  nextRap: { effectiveDate: string; amount: number; incomeYear: number; agi: number } | null;
  payoff: PayoffEstimate | null;
}

const dollars = (cents: number) => cents / 100;
const percent = (fraction: number) => Math.round(fraction * 1e6) / 1e4;

/** The account (shaped) and its stored copy; 404 for a malformed or missing id, 400 for a bank account. */
async function loadAccount(store: Store, accountId: string): Promise<{ raw: AccountDoc; account: AccountDoc }> {
  const raw = isId(accountId) ? await accounts(store).findById(accountId) : null; // PP1
  if (!raw) throw new PaymentPlanError("Account not found", 404);
  const account = shapeAccount(raw);
  if (account.type !== "credit_card" && account.type !== "debt") {
    throw new PaymentPlanError("Payment plans are for credit cards and debt accounts", 400);
  }
  return { raw, account };
}

/** The linked payment transaction (shaped) and its stored copy, or null. */
async function loadPaymentTx(
  store: Store,
  account: AccountDoc,
): Promise<{ raw: TransactionDoc; tx: TransactionDoc } | null> {
  if (!account.paymentTransactionId) return null;
  const raw = await transactions(store).findById(account.paymentTransactionId); // PP2
  return raw ? { raw, tx: shapeTransaction(raw) } : null;
}

function scheduleOf(tx: TransactionDoc | null): ScheduleEntry[] {
  return (tx?.amountSchedule ?? [])
    .map((e) => ({ effectiveDate: toDateStr(e.effectiveDate), amount: e.amount, ...(e.source ? { source: e.source } : {}) }))
    .sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));
}

/** Estimated AGI (cents) per calendar year from the Datasheet and its linked Salary paydays. */
async function agiLookup(store: Store): Promise<(year: number) => number | null> {
  const profile = await loadProfile(store); // PP3
  const salaryRaw = profile.salaryTransactionId ? await transactions(store).findById(profile.salaryTransactionId) : null; // PP4
  const rule = salaryRaw ? shapeTransaction(salaryRaw).recurrenceRule : undefined;
  if (!rule) return () => null;
  const periods = getPeriodsPerYear(rule.frequency);
  const ruleStr = {
    frequency: rule.frequency,
    interval: rule.interval,
    startDate: asDate(rule.startDate).toISOString(),
    endDate: rule.endDate ? asDate(rule.endDate).toISOString() : null,
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

async function writeSchedule(store: Store, raw: TransactionDoc, entries: ScheduleEntry[], now: Date) {
  if (entries.length === 0) {
    await transactions(store).updateById(raw._id, { $unset: { amountSchedule: 1 } }); // PP5
    return;
  }
  // PP6: what tx.save() persists after assigning amountSchedule and amount
  await saveTransaction(store, raw, {
    amountSchedule: entries.map((e) => ({
      effectiveDate: toIso(e.effectiveDate),
      amount: e.amount,
      ...(e.source ? { source: e.source } : {}),
    })),
    amount: amountOn(entries[0].amount, entries, localDateStr(now)),
  });
}

/** Rebuild the automatic RAP entries on the account's payment schedule (manual entries untouched). */
export async function regenerateRapSchedule(store: Store, accountId: string, now: Date): Promise<void> {
  const accountRaw = await accounts(store).findById(accountId); // PP7
  if (!accountRaw) return;
  const account = shapeAccount(accountRaw);
  const loaded = await loadPaymentTx(store, account);
  if (!loaded) return;
  const manual = scheduleOf(loaded.tx).filter((e) => !e.source);
  const rap = account.rap;
  const generated =
    rap?.enabled && rap.autoSchedule
      ? rapScheduleEntries({
          recertDate: rap.recertDate,
          dependents: rap.dependents,
          today: localDateStr(now),
          years: RAP_YEARS_AHEAD,
          agiForYear: await agiLookup(store),
        })
      : [];
  await writeSchedule(store, loaded.raw, mergeRapEntries(manual, generated), now);
}

export async function regenerateAllRapSchedules(store: Store, now: Date): Promise<void> {
  const list = (await accounts(store).find({ "rap.enabled": true, paymentTransactionId: { $ne: null } })).map(shapeAccount); // PP8
  for (const a of list) await regenerateRapSchedule(store, a._id, now);
}

export async function getPaymentPlan(store: Store, accountId: string, now: Date): Promise<PaymentPlanDTO> {
  const { account } = await loadAccount(store, accountId);
  const loaded = await loadPaymentTx(store, account);
  const tx = loaded ? loaded.tx : null;
  const schedule = scheduleOf(tx);
  const today = localDateStr(now);
  const apr = blendedApr(account.subLoans, account.apr);
  const rap = account.rap
    ? {
        enabled: account.rap.enabled ?? RAP_DEFAULTS.enabled,
        autoSchedule: account.rap.autoSchedule ?? RAP_DEFAULTS.autoSchedule,
        recertDate: account.rap.recertDate ?? RAP_DEFAULTS.recertDate,
        dependents: account.rap.dependents ?? RAP_DEFAULTS.dependents,
      }
    : null;

  let payment: PaymentPlanDTO["payment"] = null;
  if (tx) {
    const from = await accounts(store).findById(tx.accountId); // PP9
    payment = {
      transactionId: tx._id,
      fromAccountId: tx.accountId,
      fromAccountName: from?.name ?? "Unknown account",
      dayOfMonth: tx.recurrenceRule?.dayOfMonth ?? null,
      frequency: tx.recurrenceRule?.frequency ?? "monthly",
      cadence: describeCadence(tx.recurrenceRule),
    };
  }

  let nextRap: PaymentPlanDTO["nextRap"] = null;
  if (rap?.enabled) {
    const agiForYear = await agiLookup(store);
    const [first] = rapScheduleEntries({ recertDate: rap.recertDate, dependents: rap.dependents, today, years: RAP_YEARS_AHEAD, agiForYear });
    if (first) {
      const incomeYear = Number(first.effectiveDate.slice(0, 4)) - 1;
      nextRap = { effectiveDate: first.effectiveDate, amount: dollars(first.amount), incomeYear, agi: dollars(agiForYear(incomeYear) ?? 0) };
    }
  }

  const paymentDay = payment?.dayOfMonth ?? Number((schedule[0]?.effectiveDate ?? today).slice(8, 10));
  // Payments already posted are in the balance; estimate from the ones still to come
  const rule = tx?.recurrenceRule;
  const posted = tx?.postedThrough ? toDateStr(tx.postedThrough) : "";
  const paymentDates = rule
    ? expandRecurrence(
        {
          frequency: rule.frequency,
          interval: rule.interval,
          startDate: asDate(rule.startDate).toISOString(),
          endDate: rule.endDate ? asDate(rule.endDate).toISOString() : null,
          dayOfWeek: rule.dayOfWeek,
          dayOfMonth: rule.dayOfMonth,
          daysOfMonth: rule.daysOfMonth,
        },
        fromDateStr(today),
        addYears(fromDateStr(today), PAYOFF_YEARS_AHEAD),
      )
        .map((d) => toDateStr(d))
        .filter((d) => d > posted)
    : undefined;
  const payoff =
    tx && schedule.length > 0
      ? estimatePayoff({ balance: account.balance, apr, schedule, paymentDay, startDate: today, rap: !!rap?.enabled, paymentDates })
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
  store: Store,
  accountId: string,
  input: { fromAccountId: string; dayOfMonth: number; startDate: string; firstAmount: number },
  now: Date,
): Promise<void> {
  const { raw, account } = await loadAccount(store, accountId);
  if (await loadPaymentTx(store, account)) {
    throw new PaymentPlanError("Payments are already set up for this account — unlink them first", 409);
  }
  // Today a malformed id is a Mongoose cast error here (the route's 500)
  assertId(input.fromAccountId);
  const fromRaw = await accounts(store).findById(input.fromAccountId); // PP10
  const from = fromRaw ? shapeAccount(fromRaw) : null;
  if (!from || from.type !== "bank" || from.isArchived) {
    throw new PaymentPlanError("Payments must come from an active bank account", 400);
  }
  const cents = Math.round(input.firstAmount * 100);
  const start = toIso(input.startDate);
  // PP11: the document Transaction.create stores (schema defaults written out)
  const created = await transactions(store).insert({
    amount: cents,
    date: start,
    description: `${account.name} payment`,
    accountId: from._id,
    toAccountId: account._id,
    type: "transfer",
    isRecurring: true,
    recurrenceRule: { frequency: "monthly", interval: 1, startDate: start, endDate: null, dayOfMonth: input.dayOfMonth, daysOfMonth: [] },
    categoryTags: [account.type === "credit_card" ? "credit" : "loans", "transfer"],
    balanceApplied: false,
    amountSchedule: [{ effectiveDate: start, amount: cents }],
  });
  // PP12: account.paymentTransactionId = tx._id; account.save(). If the link cannot be written,
  // the transfer just created is removed so no unlinked recurring payment is left behind.
  try {
    await saveAccount(store, raw, { paymentTransactionId: created._id });
  } catch (error) {
    try {
      await transactions(store).deleteById(created._id);
    } catch {
      // The link failure is the one reported; a failed cleanup must not replace it
    }
    throw error;
  }
  await regenerateRapSchedule(store, accountId, now);
}

export async function updatePaymentPlan(
  store: Store,
  accountId: string,
  input: {
    schedule?: { effectiveDate: string; amount: number }[];
    subLoans?: { name: string; balance: number; apr: number }[];
    rap?: { enabled: boolean; autoSchedule: boolean; recertDate: string; dependents: number };
  },
  now: Date,
): Promise<void> {
  const { raw, account } = await loadAccount(store, accountId);
  // Every refusal comes before the first write
  if (input.rap && account.type !== "debt") throw new PaymentPlanError("RAP applies to debt accounts only", 400);
  if (input.schedule) {
    const loaded = await loadPaymentTx(store, account);
    if (!loaded) throw new PaymentPlanError("No payment linked — set up payments", 409);
    const manual = input.schedule.map((e) => ({ effectiveDate: e.effectiveDate, amount: Math.round(e.amount * 100) }));
    const rapEntries = scheduleOf(loaded.tx).filter((e) => e.source === "rap");
    await writeSchedule(store, loaded.raw, mergeRapEntries(manual, rapEntries), now);
  }
  const changes: Record<string, unknown> = {};
  if (input.subLoans) {
    changes.subLoans = input.subLoans.map((l) => ({ name: l.name.trim(), balance: Math.round(l.balance * 100), apr: l.apr / 100 }));
  }
  if (input.rap) {
    changes.rap = {
      enabled: input.rap.enabled,
      autoSchedule: input.rap.autoSchedule,
      recertDate: input.rap.recertDate,
      dependents: input.rap.dependents,
    };
  }
  // PP13: account.subLoans / account.rap assigned, then account.save()
  if (input.subLoans || input.rap) await saveAccount(store, raw, changes);
  await regenerateRapSchedule(store, accountId, now);
}

/**
 * Remove the payment plan: unlink it and delete its payment transfer. Payments it
 * already posted stay in the balances (that money moved), so nothing is reversed.
 */
export async function unlinkPaymentPlan(store: Store, accountId: string): Promise<void> {
  const { account } = await loadAccount(store, accountId);
  if (account.paymentTransactionId) {
    await transactions(store).deleteById(account.paymentTransactionId); // PP14
    // Every link to the deleted transfer goes, this plan's own included (PP15, bug 7)
    await clearTransactionLinks(store, [account.paymentTransactionId]);
  } else {
    await accounts(store).updateById(account._id, { $unset: { paymentTransactionId: 1 } }); // PP15
  }
}
