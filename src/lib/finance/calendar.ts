// Month grid helpers for the Finance calendar. Days are yyyy-MM-dd strings and
// months yyyy-MM strings, so nothing here depends on the timezone.

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

/** `value` when it is a valid yyyy-MM month, otherwise the month of `todayStr` (yyyy-MM-dd) */
export function parseMonth(value: string | null | undefined, todayStr: string): string {
  return value && MONTH_RE.test(value) ? value : todayStr.slice(0, 7);
}

/** The month `delta` months after (or before, when negative) `month` */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const index = y * 12 + (m - 1) + delta;
  const year = Math.floor(index / 12);
  return `${String(year).padStart(4, "0")}-${String(index - year * 12 + 1).padStart(2, "0")}`;
}

/**
 * The month as Sunday-to-Saturday weeks. Each cell is a yyyy-MM-dd day of the
 * month, or null for the blanks before the 1st and after the last day.
 */
export function monthWeeks(month: string): (string | null)[][] {
  const [y, m] = month.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells: (string | null)[] = Array(first).fill(null);
  for (let d = 1; d <= count; d++) cells.push(`${month}-${String(d).padStart(2, "0")}`);
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/** Cents with the direction money moves: income positive, expenses negative, transfers zero */
export function signedAmount(tx: { type: "credit" | "debit" | "transfer"; amount: number }): number {
  if (tx.type === "credit") return tx.amount;
  if (tx.type === "debit") return -tx.amount;
  return 0;
}

/** Sum of the bank-type accounts' balances (cents) in a day's balance map */
export function bankBalance(
  balances: Record<string, number>,
  accounts: { _id: string; type: string }[]
): number {
  return accounts
    .filter((a) => a.type === "bank")
    .reduce((sum, a) => sum + (balances[a._id] ?? 0), 0);
}

/** Sum of the credit card accounts' balances owed (cents) in a day's balance map */
export function cardBalance(
  balances: Record<string, number>,
  accounts: { _id: string; type: string }[]
): number {
  return accounts
    .filter((a) => a.type === "credit_card")
    .reduce((sum, a) => sum + (balances[a._id] ?? 0), 0);
}

/**
 * What the Week end column shows for credit cards (cents): the balance owed as
 * a negative amount, or the available credit when nothing is owed. Archived
 * cards have no balance in a day's map and add no limit.
 */
export function creditPosition(
  balances: Record<string, number>,
  accounts: { _id: string; type: string; creditLimit?: number; isArchived?: boolean }[]
): number {
  const owed = cardBalance(balances, accounts);
  if (owed > 0) return -owed;
  // A card in credit (overpaid) adds to what can be spent
  return cardLimit(accounts) - owed;
}

/** Total credit limit (cents) of the active credit cards */
function cardLimit(accounts: { type: string; creditLimit?: number; isArchived?: boolean }[]): number {
  return accounts
    .filter((a) => a.type === "credit_card" && !a.isArchived)
    .reduce((sum, a) => sum + (a.creditLimit ?? 0), 0);
}

/**
 * Share of the total credit limit that is owed, 0 to 1 or more; 0 when nothing
 * is owed, null when something is owed and no card has a limit.
 */
export function creditUtilization(
  balances: Record<string, number>,
  accounts: { _id: string; type: string; creditLimit?: number; isArchived?: boolean }[]
): number | null {
  const owed = cardBalance(balances, accounts);
  if (owed <= 0) return 0;
  const limit = cardLimit(accounts);
  return limit > 0 ? owed / limit : null;
}

/**
 * The Saturday (yyyy-MM-dd) that ends a `monthWeeks` row. For a month's last
 * row that is usually a day in the next month.
 */
export function weekEndDate(week: (string | null)[]): string {
  const index = week.findIndex(Boolean);
  const [y, m, d] = (week[index] as string).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + (6 - index))).toISOString().slice(0, 10);
}
