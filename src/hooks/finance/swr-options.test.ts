import { test } from "node:test";
import assert from "node:assert/strict";
import { FINANCE_SWR } from "./swr-options";
import { RequestError } from "@/lib/data/request-error";

test("Finance reads do not retry an HTTP error status, and do retry a network failure", () => {
  const retry = FINANCE_SWR.shouldRetryOnError;
  assert.equal(typeof retry, "function");
  const predicate = retry as (error: unknown) => boolean;
  assert.equal(predicate(new RequestError("Account not found", 404)), false);
  assert.equal(predicate(new RequestError("Request failed: 400", 400)), false);
  assert.equal(predicate(new TypeError("Failed to fetch")), true);
  assert.equal(predicate(new Error("boom")), true);
});

test("RequestError keeps the message and carries the status", () => {
  const error = new RequestError("Request failed: 500", 500);
  assert.ok(error instanceof Error);
  assert.equal(error.message, "Request failed: 500");
  assert.equal(error.status, 500);
});
