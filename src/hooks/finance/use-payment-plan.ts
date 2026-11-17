"use client";

import useSWR, { mutate as globalMutate } from "swr";
import { fetcher, send as request } from "@/hooks/request";
import { FINANCE_SWR } from "@/hooks/finance/swr-options";

/** Payment plan as returned by the API (dollars, percent). */
export interface PaymentPlan {
  accountId: string;
  apr: number | null;
  blendedApr: number | null;
  minimumPayment: number | null;
  subLoans: { name: string; balance: number; apr: number }[];
  rap: RapSettings | null;
  payment: { transactionId: string; fromAccountId: string; fromAccountName: string; dayOfMonth: number | null; frequency: string; cadence: string } | null;
  schedule: { effectiveDate: string; amount: number; source?: "rap" }[];
  nextRap: { effectiveDate: string; amount: number; incomeYear: number; agi: number } | null;
  payoff: { payoffDate: string | null; totalInterest: number; months: number } | null;
}

export interface RapSettings {
  enabled: boolean;
  autoSchedule: boolean;
  recertDate: string;
  dependents: number;
}

const planKey = (accountId: string) => `/api/accounts/${accountId}/payment-plan`;

export function usePaymentPlan(accountId: string) {
  // 400 (bank account) and 404 (missing) are expected answers, not transient failures: not retried
  const { data, error, isLoading } = useSWR(accountId ? planKey(accountId) : null, fetcher, FINANCE_SWR);
  return { plan: data?.data as PaymentPlan | undefined, isLoading, isError: !!error };
}

/** Plans change what projections, reports and transaction lists show: refresh them all. */
async function refreshAfterWrite(accountId: string, plan: PaymentPlan) {
  await globalMutate(planKey(accountId), { data: plan }, { revalidate: false });
  await globalMutate(
    (key) =>
      typeof key === "string" &&
      (key.startsWith("/api/projections") ||
        key.startsWith("/api/summary") ||
        key.startsWith("/api/transactions") ||
        key.startsWith("/api/accounts"))
  );
}

async function send(accountId: string, method: string, body?: unknown): Promise<PaymentPlan> {
  const json = await request<{ data: PaymentPlan }>(planKey(accountId), method, body);
  await refreshAfterWrite(accountId, json.data);
  return json.data;
}

export function setupPayments(
  accountId: string,
  input: { fromAccountId: string; dayOfMonth: number; startDate: string; firstAmount: number }
) {
  return send(accountId, "POST", input);
}

export function updatePaymentPlan(
  accountId: string,
  input: {
    schedule?: { effectiveDate: string; amount: number }[];
    subLoans?: { name: string; balance: number; apr: number }[];
    rap?: RapSettings;
  }
) {
  return send(accountId, "PUT", input);
}

export function unlinkPaymentPlan(accountId: string) {
  return send(accountId, "DELETE");
}
