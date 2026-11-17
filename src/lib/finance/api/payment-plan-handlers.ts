// Payment-plan routes (R7–R10) as store-backed handlers, shared by the server and browser data modes.
// Same order as src/app/api/accounts/[accountId]/payment-plan/route.ts.
// Pure: no framework, browser or server imports (browser-reachable).

import { fail, ok, type ApiResult, type Handler } from "@/lib/data/api";
import { paymentPlanSetupSchema, paymentPlanUpdateSchema } from "@/lib/finance/validators";
import {
  PaymentPlanError,
  getPaymentPlan,
  setupPayments,
  unlinkPaymentPlan,
  updatePaymentPlan,
} from "./payment-plan";
import { postDuePayments } from "./post-payments";

/** A PaymentPlanError becomes its status and message; anything else is the route's 500. */
const planErrors =
  (handler: Handler): Handler =>
  async (ctx) => {
    try {
      return await handler(ctx);
    } catch (error) {
      if (error instanceof PaymentPlanError) return fail(error.status, error.message);
      throw error;
    }
  };

const validationError = (issues: { message: string }[]): ApiResult =>
  fail(400, issues[0]?.message ?? "Validation failed");

/** GET — plan fields, linked payment, schedule, next RAP payment and payoff estimate. */
export const getPlan: Handler = planErrors(async ({ store, params, now }) => {
  await postDuePayments(store, now);
  return ok({ data: await getPaymentPlan(store, params.accountId, now) });
});

/** POST — create the monthly bank → account payment transfer and link it. */
export const setupPlan: Handler = planErrors(async ({ store, params, body, now }) => {
  await postDuePayments(store, now);
  const parsed = paymentPlanSetupSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error.issues);
  await setupPayments(store, params.accountId, parsed.data, now);
  return ok({ data: await getPaymentPlan(store, params.accountId, now) });
});

/** PUT — replace manual schedule entries, sub-loans, and/or RAP settings. */
export const updatePlan: Handler = planErrors(async ({ store, params, body, now }) => {
  await postDuePayments(store, now);
  const parsed = paymentPlanUpdateSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error.issues);
  await updatePaymentPlan(store, params.accountId, parsed.data, now);
  return ok({ data: await getPaymentPlan(store, params.accountId, now) });
});

/** DELETE — unlink the plan and delete its payment transfer (posted payments stay). */
export const unlinkPlan: Handler = planErrors(async ({ store, params, now }) => {
  await postDuePayments(store, now);
  await unlinkPaymentPlan(store, params.accountId);
  return ok({ data: await getPaymentPlan(store, params.accountId, now) });
});
