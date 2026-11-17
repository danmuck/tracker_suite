import { test } from "node:test";
import assert from "node:assert/strict";
import { NO_WHAT_IF, pickProjection, whatIfFailed, whatIfSucceeded, type WhatIfHistory } from "./pick-projection";
import { RequestError } from "@/lib/data/request-error";

type R = { data: string };
const real: R = { data: "real" };
const current: R = { data: "what-if for the sandbox on screen" };
const previous: R = { data: "what-if for an earlier sandbox state" };
const rejected = new RequestError("Invalid projection request", 400);
const offline = new TypeError("Failed to fetch");

const base = {
  useSandbox: false,
  realData: undefined as R | undefined,
  realError: undefined as unknown,
  whatIfData: undefined as R | undefined,
  whatIfError: undefined as unknown,
  lastWhatIf: NO_WHAT_IF as WhatIfHistory<R>,
  loading: false,
};
const shown = (data: R | undefined, isLoading = false, isError = false) => ({ data, isLoading, isError });
const nothing = shown(undefined, false, true);

test("history: a success records the data and clears the failure; a failure keeps the last success", () => {
  assert.deepEqual(whatIfSucceeded(previous), { data: previous, failed: false });
  assert.deepEqual(whatIfFailed(whatIfSucceeded(previous)), { data: previous, failed: true });
  assert.deepEqual(whatIfSucceeded(current), { data: current, failed: false });
  assert.deepEqual(whatIfFailed(NO_WHAT_IF), { data: undefined, failed: true });
});

test("sandbox off: the real projection, whatever the what-if state", () => {
  const sandboxNoise = { whatIfData: current, whatIfError: rejected, lastWhatIf: whatIfFailed(whatIfSucceeded(previous)) };
  assert.deepEqual(pickProjection({ ...base, loading: true }), shown(undefined, true));
  assert.deepEqual(pickProjection({ ...base, realData: real }), shown(real));
  assert.deepEqual(pickProjection({ ...base, ...sandboxNoise, realData: real }), shown(real));
  // HTTP error and network failure on the first fetch
  assert.deepEqual(pickProjection({ ...base, ...sandboxNoise, realError: rejected }), nothing);
  assert.deepEqual(pickProjection({ ...base, realError: offline }), nothing);
  // A failed revalidation after a success keeps the real data
  assert.deepEqual(pickProjection({ ...base, ...sandboxNoise, realData: real, realError: offline }), shown(real, false, true));
});

test("sandbox on, no what-if settled yet: the real projection while the first loads", () => {
  assert.deepEqual(pickProjection({ ...base, useSandbox: true, realData: real, loading: true }), shown(real));
  assert.deepEqual(pickProjection({ ...base, useSandbox: true, loading: true }), shown(undefined, true));
});

test("sandbox on and succeeding: the what-if projection", () => {
  assert.deepEqual(
    pickProjection({ ...base, useSandbox: true, realData: real, whatIfData: current, lastWhatIf: whatIfSucceeded(current) }),
    shown(current),
  );
});

test("sandbox on, current request rejected (400): nothing, even with an earlier what-if or real data", () => {
  for (const lastWhatIf of [NO_WHAT_IF, whatIfFailed(whatIfSucceeded(previous))]) {
    assert.deepEqual(pickProjection({ ...base, useSandbox: true, whatIfError: rejected, lastWhatIf }), nothing);
    assert.deepEqual(pickProjection({ ...base, useSandbox: true, realData: real, whatIfError: rejected, lastWhatIf }), nothing);
    assert.deepEqual(
      pickProjection({ ...base, useSandbox: true, realData: real, whatIfError: rejected, lastWhatIf, loading: true }),
      nothing,
    );
  }
});

test("sandbox on, the first fetch for a new sandbox state fails on the network: nothing", () => {
  assert.deepEqual(
    pickProjection({ ...base, useSandbox: true, realData: real, whatIfError: offline, lastWhatIf: whatIfFailed(whatIfSucceeded(previous)) }),
    nothing,
  );
});

test("sandbox on, a revalidation of the current state fails: its data stays on screen", () => {
  // e.g. the server restarts and the tab regains focus
  for (const whatIfError of [offline, rejected]) {
    assert.deepEqual(
      pickProjection({
        ...base, useSandbox: true, realData: real, whatIfData: current, whatIfError,
        lastWhatIf: whatIfFailed(whatIfSucceeded(current)),
      }),
      shown(current, false, true),
    );
  }
});

test("sandbox on, a new state in flight after a success: the previous what-if", () => {
  assert.deepEqual(
    pickProjection({ ...base, useSandbox: true, realData: real, lastWhatIf: whatIfSucceeded(previous), loading: true }),
    shown(previous),
  );
});

test("sandbox on, a new state in flight after a rejection or failure: nothing until it settles", () => {
  for (const lastWhatIf of [whatIfFailed(whatIfSucceeded(previous)), whatIfFailed(NO_WHAT_IF)]) {
    assert.deepEqual(pickProjection({ ...base, useSandbox: true, realData: real, lastWhatIf, loading: true }), nothing);
  }
});
