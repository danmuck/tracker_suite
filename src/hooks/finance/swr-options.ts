import type { SWRConfiguration } from "swr";
import { RequestError } from "@/lib/data/request-error";

/**
 * SWR options for every Finance read. An error status (400 for an out-of-range window, 404 for
 * a missing account, ...) is an answer, not a transient failure: it is not retried (each retry
 * of a projection or summary read would also re-run due-payment posting). A network failure
 * keeps SWR's default retry.
 */
export const FINANCE_SWR: SWRConfiguration = {
  shouldRetryOnError: (error: unknown) => !(error instanceof RequestError),
};
