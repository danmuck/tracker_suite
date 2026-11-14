/**
 * Convert the account form's plan fields (APR percent, minimum payment dollars)
 * into stored values. `null` means "cleared" and becomes an $unset.
 */
export function planFieldsToDb(data: { apr?: number | null; minimumPayment?: number | null }) {
  const set: Record<string, number> = {};
  const unset: Record<string, 1> = {};
  if (data.apr === null) unset.apr = 1;
  else if (data.apr !== undefined) set.apr = data.apr / 100;
  if (data.minimumPayment === null) unset.minimumPayment = 1;
  else if (data.minimumPayment !== undefined) set.minimumPayment = Math.round(data.minimumPayment * 100);
  return { set, unset };
}
