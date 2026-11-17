// Finance documents as they cross the Store boundary: plain JSON, string ids, ISO date strings.
// Pure: no framework, browser or server imports (browser-reachable).
//
// The Mongoose schemas in src/models/finance/ are the source of every default here. Handlers
// never rely on Mongoose to fill, trim or cast: inserts are built complete, reads go through
// `shape*` (what hydration fills for an older stored document), and the former
// mutate-then-save() sites go through `saveUpdate`.

import { isId } from "@/lib/data/api";
import type { BaseDoc, Collection, Store } from "@/lib/data/store";
import { toDateStr, toIso } from "@/lib/finance/dates";
import { DEFAULT_PROFILE } from "@/lib/finance/finance-profile";
import type { Account } from "@/types/finance/account";
import type { Category } from "@/types/finance/category";
import type { FinanceProfileData } from "@/types/finance/datasheet";
import type { RecurrenceFrequency, TransactionType } from "@/types/finance/transaction";

export type AccountDoc = Account;
export type CategoryDoc = Category;

export interface StoredRule {
  frequency: RecurrenceFrequency;
  interval: number;
  startDate: string;
  endDate: string | null;
  dayOfWeek?: number;
  dayOfMonth?: number;
  daysOfMonth: number[];
}

export interface TransactionDoc extends BaseDoc {
  amount: number;
  date: string;
  description: string;
  accountId: string;
  toAccountId?: string;
  type: TransactionType;
  isRecurring: boolean;
  recurrenceRule?: StoredRule;
  amountSchedule?: { effectiveDate: string; amount: number; source?: "rap" }[];
  postedThrough?: string | null;
  categoryTags: string[];
  notes?: string;
  balanceApplied: boolean;
}

export interface ProfileDoc extends BaseDoc {
  filingStatus: FinanceProfileData["filingStatus"];
  hoursPerWeek: number;
  nycResident: boolean;
  raiseRate: number;
  salaryTransactionId: string | null;
  rentTransactionId: string | null;
  salarySteps: { effectiveDate: string; annualGross: number }[];
  retirementSteps: { effectiveDate: string; percent: number }[];
  healthSteps: { effectiveDate: string; perPaycheck: number }[];
  rentSteps: { effectiveDate: string; monthly: number }[];
  whatIfSalaries: { label?: string; annualGross: number }[];
}

export const accounts = (store: Store): Collection<AccountDoc> => store.collection<AccountDoc>("accounts");
export const transactions = (store: Store): Collection<TransactionDoc> =>
  store.collection<TransactionDoc>("transactions");
export const categories = (store: Store): Collection<CategoryDoc> => store.collection<CategoryDoc>("financeCategories");
export const profiles = (store: Store): Collection<ProfileDoc> => store.collection<ProfileDoc>("financeProfile");

type Doc = Record<string, unknown>;

function isPlainObject(value: unknown): value is Doc {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// Schema defaults, as Mongoose applies them on hydration: only to a path whose value is
// undefined (a stored null or false is kept). `null` defaults are listed in SHAPE_* only:
// Mongoose fills them on read but never persists them on save().
/** Credit cards and debt: balances count what is owed, so they move opposite to a bank account's. */
export const isDebtType = (type: string | undefined): boolean => type === "credit_card" || type === "debt";

const ACCOUNT_DEFAULTS: Doc = { balance: 0, currency: "USD", isCash: false, isArchived: false };
export const RAP_DEFAULTS = { enabled: false, autoSchedule: true, recertDate: "07-01", dependents: 0 };
const TRANSACTION_DEFAULTS: Doc = { isRecurring: false, categoryTags: [], balanceApplied: true };
const RULE_DEFAULTS: Doc = { interval: 1, daysOfMonth: [] };
const SHAPE_RULE_DEFAULTS: Doc = { interval: 1, endDate: null, daysOfMonth: [] };
const CATEGORY_DEFAULTS: Doc = { isDefault: false };

/** Copy of `defaults` (arrays copied, so no caller shares them). */
function copy(value: unknown): unknown {
  return Array.isArray(value) ? [...value] : value;
}

/** `doc` with each default filled where the value is undefined; never overwrites a present value. */
function fill(doc: Doc, defaults: Doc): Doc {
  const out: Doc = { ...doc };
  for (const [key, value] of Object.entries(defaults)) {
    if (out[key] === undefined) out[key] = copy(value);
  }
  return out;
}

/** The defaults `doc` lacks, keyed by `prefix` + field. */
function missing(doc: Doc, defaults: Doc, prefix = ""): Doc {
  const out: Doc = {};
  for (const [key, value] of Object.entries(defaults)) {
    if (doc[key] === undefined) out[prefix + key] = copy(value);
  }
  return out;
}

export function shapeAccount(raw: AccountDoc): AccountDoc {
  const out = fill(raw as unknown as Doc, ACCOUNT_DEFAULTS);
  if (isPlainObject(out.rap)) out.rap = fill(out.rap, RAP_DEFAULTS);
  return out as unknown as AccountDoc;
}

export function shapeTransaction(raw: TransactionDoc): TransactionDoc {
  const out = fill(raw as unknown as Doc, TRANSACTION_DEFAULTS);
  if (isPlainObject(out.recurrenceRule)) out.recurrenceRule = fill(out.recurrenceRule, SHAPE_RULE_DEFAULTS);
  return out as unknown as TransactionDoc;
}

export function shapeCategory(raw: CategoryDoc): CategoryDoc {
  return fill(raw as unknown as Doc, CATEGORY_DEFAULTS) as unknown as CategoryDoc;
}

/** Stored profile → profile data (dates yyyy-MM-dd, ids string | null); `null` → the defaults. */
export function profileFromDoc(doc: ProfileDoc | null): FinanceProfileData {
  if (!doc) {
    return {
      ...DEFAULT_PROFILE,
      salarySteps: [],
      retirementSteps: [],
      healthSteps: [],
      rentSteps: [],
      whatIfSalaries: [],
    };
  }
  const d = doc as unknown as Doc;
  const or = <T>(value: unknown, fallback: T): T => (value === undefined ? fallback : (value as T));
  const step = <T extends { effectiveDate: string }>(s: T) => ({ ...s, effectiveDate: toDateStr(s.effectiveDate) });
  const id = (value: unknown): string | null => (value ? String(value) : null);
  return {
    filingStatus: or(d.filingStatus, DEFAULT_PROFILE.filingStatus),
    hoursPerWeek: or(d.hoursPerWeek, DEFAULT_PROFILE.hoursPerWeek),
    nycResident: or(d.nycResident, DEFAULT_PROFILE.nycResident),
    raiseRate: or(d.raiseRate, DEFAULT_PROFILE.raiseRate),
    salaryTransactionId: id(d.salaryTransactionId),
    rentTransactionId: id(d.rentTransactionId),
    salarySteps: or<ProfileDoc["salarySteps"]>(d.salarySteps, []).map(step),
    retirementSteps: or<ProfileDoc["retirementSteps"]>(d.retirementSteps, []).map(step),
    healthSteps: or<ProfileDoc["healthSteps"]>(d.healthSteps, []).map(step),
    rentSteps: or<ProfileDoc["rentSteps"]>(d.rentSteps, []).map(step),
    whatIfSalaries: or<ProfileDoc["whatIfSalaries"]>(d.whatIfSalaries, []).map((w) => ({
      ...(w.label ? { label: w.label } : {}),
      annualGross: w.annualGross,
    })),
  };
}

/** Profile data → the stored fields (dates via toIso, empty ids null, labels trimmed). */
export function profileToDoc(p: FinanceProfileData): Omit<ProfileDoc, keyof BaseDoc> {
  const doc: Omit<ProfileDoc, keyof BaseDoc> = {
    filingStatus: p.filingStatus,
    hoursPerWeek: p.hoursPerWeek,
    nycResident: p.nycResident,
    raiseRate: p.raiseRate,
    salaryTransactionId: p.salaryTransactionId || null,
    rentTransactionId: p.rentTransactionId || null,
    salarySteps: p.salarySteps.map((s) => ({ effectiveDate: toIso(s.effectiveDate), annualGross: s.annualGross })),
    retirementSteps: p.retirementSteps.map((s) => ({ effectiveDate: toIso(s.effectiveDate), percent: s.percent })),
    healthSteps: p.healthSteps.map((s) => ({ effectiveDate: toIso(s.effectiveDate), perPaycheck: s.perPaycheck })),
    rentSteps: p.rentSteps.map((s) => ({ effectiveDate: toIso(s.effectiveDate), monthly: s.monthly })),
    whatIfSalaries: p.whatIfSalaries.map((w) => ({
      ...(w.label !== undefined ? { label: w.label.trim() } : {}),
      annualGross: w.annualGross,
    })),
  };
  for (const key of Object.keys(doc) as (keyof typeof doc)[]) {
    if (doc[key] === undefined) delete doc[key];
  }
  return doc;
}

export async function loadProfile(store: Store): Promise<FinanceProfileData> {
  return profileFromDoc(await profiles(store).findOne({}));
}

/** A recurrence rule as the schema stores it: defaults applied, dates as full ISO instants. */
export function buildRule(rule: {
  frequency: RecurrenceFrequency;
  interval?: number;
  startDate: string;
  endDate?: string | null;
  dayOfWeek?: number;
  dayOfMonth?: number;
  daysOfMonth?: number[];
}): StoredRule {
  const out: StoredRule = {
    frequency: rule.frequency,
    interval: rule.interval === undefined ? 1 : rule.interval,
    startDate: toIso(rule.startDate),
    // Mongoose casts "" to null, and null is the schema default.
    endDate: rule.endDate === undefined || rule.endDate === null || rule.endDate === "" ? null : toIso(rule.endDate),
    daysOfMonth: rule.daysOfMonth === undefined ? [] : [...rule.daysOfMonth],
  };
  if (rule.dayOfWeek !== undefined) out.dayOfWeek = rule.dayOfWeek;
  if (rule.dayOfMonth !== undefined) out.dayOfMonth = rule.dayOfMonth;
  return out;
}

/** `value` trimmed (the schema's `trim`); a required field that trims to "" is refused. */
export function requiredText(value: string, field: string): string {
  const trimmed = value.trim();
  if (trimmed === "") throw new Error(`${field} is required`);
  return trimmed;
}

/** Where today's code casts a body or query id, a malformed one fails (the route's 500). */
export function assertId(value: string): void {
  if (typeof value !== "string" || !isId(value)) throw new Error("Invalid id");
}

/** Non-null schema defaults the stored account lacks, as save() would persist them. */
export function accountDefaults(raw: Record<string, unknown>): Record<string, unknown> {
  return {
    ...missing(raw, ACCOUNT_DEFAULTS),
    ...(isPlainObject(raw.rap) ? missing(raw.rap, RAP_DEFAULTS, "rap.") : {}),
  };
}

/** Non-null schema defaults the stored transaction lacks (`recurrenceRule.endDate: null` is never persisted). */
export function transactionDefaults(raw: Record<string, unknown>): Record<string, unknown> {
  return {
    ...missing(raw, TRANSACTION_DEFAULTS),
    ...(isPlainObject(raw.recurrenceRule) ? missing(raw.recurrenceRule, RULE_DEFAULTS, "recurrenceRule.") : {}),
  };
}

function getPath(doc: Doc, path: string): unknown {
  let value: unknown = doc;
  for (const part of path.split(".")) {
    if (!isPlainObject(value)) return undefined;
    value = value[part];
  }
  return value;
}

/** Deep equality; object key order is ignored, array order is not; a missing value equals only a missing value. */
function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, i) => sameValue(item, b[i]));
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    // Keys holding undefined are absent once stored (documents are JSON).
    const ka = Object.keys(a).filter((k) => a[k] !== undefined).sort();
    const kb = Object.keys(b).filter((k) => b[k] !== undefined).sort();
    if (ka.length !== kb.length || ka.some((k, i) => k !== kb[i])) return false;
    return ka.every((k) => sameValue(a[k], b[k]));
  }
  return false;
}

function assertNoUndefined(value: unknown): void {
  if (value === undefined) throw new Error("saveUpdate: undefined values are not supported; pass null or omit the key");
  if (Array.isArray(value)) value.forEach(assertNoUndefined);
  else if (isPlainObject(value)) Object.values(value).forEach(assertNoUndefined);
}

/**
 * What Mongoose 9 save() writes after in-place assignment of `changes` (field or dotted path → value).
 * `current` is the stored document after shape*; `defaults` are the non-null schema defaults the
 * unshaped stored document lacks. Changed values move updatedAt (`touch`); defaults alone do not.
 * `null` means save() would write nothing.
 *
 * Values are compared and written exactly as given: callers pass already-trimmed, already-cast,
 * complete values (dates as full ISO strings via `toIso`, ids as strings, whole subdocuments).
 * An `undefined` anywhere in `changes` throws; pass `null` or omit the key.
 *
 * A change at a path listed in `defaults` (the stored document lacks it) counts as a change even
 * when it equals the default, unless it is null: Mongoose 9.2.1 marks such a path modified
 * (`lib/document.js` `$__shouldModify`, "a path with a default was $unset on the server").
 */
export function saveUpdate(
  current: Record<string, unknown>,
  defaults: Record<string, unknown>,
  changes: Record<string, unknown>,
): { $set: Record<string, unknown>; touch: boolean } | null {
  for (const value of Object.values(changes)) assertNoUndefined(value);
  const changed: Doc = {};
  for (const [path, value] of Object.entries(changes)) {
    const resetsDefault = Object.hasOwn(defaults, path) && value !== null;
    if (resetsDefault || !sameValue(getPath(current, path), value)) changed[path] = value;
  }
  const changedPaths = Object.keys(changed);
  const filled: Doc = {};
  for (const [path, value] of Object.entries(defaults)) {
    // A changed value wins over a default at the same path or under a key set as a whole.
    if (changedPaths.some((key) => path === key || path.startsWith(key + "."))) continue;
    filled[path] = value;
  }
  if (changedPaths.length === 0 && Object.keys(filled).length === 0) return null;
  return { $set: { ...changed, ...filled }, touch: changedPaths.length > 0 };
}

export async function saveAccount(store: Store, raw: AccountDoc, changes: Record<string, unknown>): Promise<void> {
  const u = saveUpdate(
    shapeAccount(raw) as unknown as Doc,
    accountDefaults(raw as unknown as Doc),
    changes,
  );
  if (u) await accounts(store).updateById(raw._id, { $set: u.$set }, u.touch ? undefined : { timestamps: false });
}

export async function saveTransaction(
  store: Store,
  raw: TransactionDoc,
  changes: Record<string, unknown>,
): Promise<void> {
  const u = saveUpdate(
    shapeTransaction(raw) as unknown as Doc,
    transactionDefaults(raw as unknown as Doc),
    changes,
  );
  if (u) {
    await transactions(store).updateById(raw._id, { $set: u.$set }, u.touch ? undefined : { timestamps: false });
  }
}

// One check-and-insert in flight per store: concurrent callers share it, so they cannot each
// see "no Cash" and each insert one. Cleared when it settles (rejection included).
const cashInFlight = new WeakMap<Store, Promise<void>>();

/** The Cash account, inserted only when none exists (read first: never an upsert, so no write otherwise). */
export function ensureCashAccount(store: Store): Promise<void> {
  const pending = cashInFlight.get(store);
  if (pending) return pending;
  const run = (async () => {
    const acc = accounts(store);
    if (!(await acc.exists({ isCash: true }))) {
      await acc.insert({ name: "Cash", type: "bank", isCash: true, balance: 0, currency: "USD", isArchived: false });
    }
  })();
  const shared = run.finally(() => cashInFlight.delete(store));
  cashInFlight.set(store, shared);
  return shared;
}
