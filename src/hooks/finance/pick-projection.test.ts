import { test } from "node:test";
import assert from "node:assert/strict";
import { pickProjection } from "./pick-projection";

const real = { data: "real" };
const whatIf = { data: "what-if" };
const previous = { data: "previous what-if" };
const failure = new Error("Invalid projection request");

const base = {
  useSandbox: false,
  realData: undefined,
  realError: undefined,
  whatIfData: undefined,
  whatIfError: undefined,
  loading: false,
};

test("sandbox off: the real projection", () => {
  assert.deepEqual(pickProjection({ ...base, realData: real, whatIfData: previous }), {
    data: real, isLoading: false, isError: false });
  assert.deepEqual(pickProjection({ ...base, loading: true }), { data: undefined, isLoading: true, isError: false });
  assert.deepEqual(pickProjection({ ...base, realError: failure }), { data: undefined, isLoading: false, isError: true });
});

test("sandbox on and succeeding: the what-if projection", () => {
  assert.deepEqual(pickProjection({ ...base, useSandbox: true, realData: real, whatIfData: whatIf }), {
    data: whatIf, isLoading: false, isError: false });
});

test("sandbox on and its first what-if still loading: the real projection meanwhile", () => {
  assert.deepEqual(pickProjection({ ...base, useSandbox: true, realData: real, loading: true }), {
    data: real, isLoading: false, isError: false });
});

test("sandbox on and the what-if rejected: no projection, even with previous what-if or real data", () => {
  const expected = { data: undefined, isLoading: false, isError: true };
  assert.deepEqual(pickProjection({ ...base, useSandbox: true, whatIfError: failure }), expected);
  assert.deepEqual(pickProjection({ ...base, useSandbox: true, realData: real, whatIfError: failure }), expected);
  assert.deepEqual(
    pickProjection({ ...base, useSandbox: true, realData: real, whatIfData: previous, whatIfError: failure }),
    expected,
  );
  // Still not loading while the real projection is: the rejection is the answer.
  assert.deepEqual(pickProjection({ ...base, useSandbox: true, whatIfError: failure, loading: true }), expected);
});

test("sandbox on with a new what-if in flight after a success: the previous what-if", () => {
  assert.deepEqual(
    pickProjection({ ...base, useSandbox: true, realData: real, whatIfData: previous, loading: true }),
    { data: previous, isLoading: false, isError: false },
  );
});
