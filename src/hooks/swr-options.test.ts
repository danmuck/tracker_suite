import { test } from "node:test";
import assert from "node:assert/strict";
import { NO_RETRY_ON_STATUS } from "./swr-options";
import { RequestError } from "@/lib/data/request-error";

test("reads do not retry an HTTP error status, and do retry a network failure", () => {
  const predicate = NO_RETRY_ON_STATUS.shouldRetryOnError as (error: unknown) => boolean;
  assert.equal(typeof predicate, "function");
  assert.equal(predicate(new RequestError("Project not found", 404)), false);
  assert.equal(predicate(new RequestError("Request failed: 500", 500)), false);
  assert.equal(predicate(new TypeError("Failed to fetch")), true);
  assert.equal(predicate(new Error("boom")), true);
});
