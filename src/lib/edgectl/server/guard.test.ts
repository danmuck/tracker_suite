import assert from "node:assert/strict";
import { test } from "node:test";
import { crossSiteProblem } from "./guard";

const headers = (values: Record<string, string>) => new Headers(values);
const json = { "content-type": "application/json" };
const own = { host: "localhost:3030", origin: "http://localhost:3030", "sec-fetch-site": "same-origin" };

test("this app's own request passes, with and without a body", () => {
  assert.equal(crossSiteProblem(headers({ ...own, ...json }), { body: true }), null);
  assert.equal(crossSiteProblem(headers(own), { body: false }), null);
});

test("a request with no browser headers passes when its body is declared as JSON", () => {
  assert.equal(crossSiteProblem(headers({ host: "localhost:3030", ...json }), { body: true }), null);
  assert.equal(crossSiteProblem(headers({ host: "localhost:3030" }), { body: false }), null);
});

test("a cross-site or same-site request is refused", () => {
  for (const site of ["cross-site", "same-site", "none"]) {
    const problem = crossSiteProblem(headers({ ...own, ...json, "sec-fetch-site": site }), { body: true });
    assert.match(problem ?? "", /did not come from this app/, site);
  }
});

test("an Origin that is not this app's host is refused", () => {
  for (const origin of ["https://evil.example", "http://localhost:4000", "null", "not a url"]) {
    const problem = crossSiteProblem(headers({ host: "localhost:3030", origin, ...json }), { body: true });
    assert.match(problem ?? "", /did not come from this app/, origin);
  }
  assert.match(crossSiteProblem(headers({ origin: "http://localhost:3030" }), { body: false }) ?? "", /did not come/);
});

test("a bodiless cross-site POST is refused too", () => {
  const problem = crossSiteProblem(headers({ host: "localhost:3030", origin: "https://evil.example" }), { body: false });
  assert.match(problem ?? "", /did not come from this app/);
});

test("a body that is not declared as JSON is refused", () => {
  for (const type of ["text/plain", "application/x-www-form-urlencoded", "multipart/form-data; boundary=x", ""]) {
    const values: Record<string, string> = { host: "localhost:3030" };
    if (type) values["content-type"] = type;
    assert.equal(crossSiteProblem(headers(values), { body: true }), "Content-Type must be application/json", type);
  }
  assert.equal(
    crossSiteProblem(headers({ host: "localhost:3030", "content-type": "Application/JSON; charset=utf-8" }), { body: true }),
    null,
  );
});
