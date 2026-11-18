import type { SWRConfiguration } from "swr";
import { RequestError } from "@/lib/data/request-error";

/**
 * SWR options for reads through `fetcher`. An error status (400 for a bad query, 404 for a
 * missing record, ...) is an answer, not a transient failure: it is not retried. A network
 * failure keeps SWR's default retry.
 */
export const NO_RETRY_ON_STATUS: SWRConfiguration = {
  shouldRetryOnError: (error: unknown) => !(error instanceof RequestError),
};
