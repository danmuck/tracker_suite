import type { SWRConfiguration } from "swr";
import { NO_RETRY_ON_STATUS } from "@/hooks/swr-options";

/**
 * SWR options for every Finance read. An error status (400 for an out-of-range window, 404 for
 * a missing account, ...) is an answer, not a transient failure: it is not retried (each retry
 * of a projection or summary read would also re-run due-payment posting). A network failure
 * keeps SWR's default retry.
 */
export const FINANCE_SWR: SWRConfiguration = NO_RETRY_ON_STATUS;
