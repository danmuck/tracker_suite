export interface SubLoan {
  name: string;
  balance: number; // cents
  apr: number; // fraction, 0.065
}

/** One month of interest in cents on an owed balance; 0 when nothing is owed. */
export function monthlyInterest(owedCents: number, apr: number): number {
  if (owedCents <= 0 || !(apr > 0)) return 0;
  return Math.round((owedCents * apr) / 12);
}

/** Balance-weighted rate of the sub-loans, or `fallback` when there are none (or no weight). */
export function blendedApr(subLoans: SubLoan[] | undefined, fallback: number | undefined): number {
  const total = (subLoans ?? []).reduce((sum, l) => sum + Math.max(0, l.balance), 0);
  if (!subLoans?.length || total <= 0) return fallback ?? 0;
  return subLoans.reduce((sum, l) => sum + Math.max(0, l.balance) * l.apr, 0) / total;
}

export interface RapMonthEnd {
  charged: number;
  waived: number;
  match: number;
}

const RAP_MATCH_MAX = 5_000; // $50

/**
 * RAP month-end (cents): unpaid interest is not charged, and when the borrower
 * repaid less than $50 of principal the government reduces principal by
 * min($50, payment) − principal repaid. The match never exceeds `charged`, so it
 * can't push the balance below what it was after the payment.
 */
export function rapMonthEnd(interest: number, paid: number): RapMonthEnd {
  const charged = Math.min(interest, paid);
  const principalPaid = paid - charged;
  const match = Math.max(0, Math.min(RAP_MATCH_MAX, paid) - principalPaid);
  return { charged, waived: interest - charged, match };
}
