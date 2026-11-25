import assert from "node:assert/strict";
import { test } from "node:test";
import { crossSiteProblem, HOST_REFUSED, hostAllowed } from "./guard";

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
  assert.equal(crossSiteProblem(headers({ origin: "http://localhost:3030" }), { body: false }), HOST_REFUSED);
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

test("only loopback names and listed hosts are served", () => {
  for (const host of ["localhost", "localhost:3030", "LOCALHOST:3031", "app.localhost:3030", "127.0.0.1:3030", "[::1]:3030"]) {
    assert.equal(hostAllowed(host, {}), true, host);
  }
  for (const host of ["evil.example", "evil.example:3030", "localhost.evil.example", "127.0.0.1.evil.example:3030", "192.168.1.5:3030", "", null, "a b"]) {
    assert.equal(hostAllowed(host, {}), false, String(host));
  }
  const env = { EDGECTL_ALLOWED_HOSTS: "tracker.lan, 192.168.1.5:3030" };
  assert.equal(hostAllowed("tracker.lan:3030", env), true);
  assert.equal(hostAllowed("192.168.1.5:3030", env), true);
  assert.equal(hostAllowed("192.168.1.5:4000", env), false);
});

test("a rebound domain is refused even when its Origin matches its Host", () => {
  const rebound = { host: "evil.example:3030", origin: "http://evil.example:3030", "sec-fetch-site": "same-origin", ...json };
  assert.equal(crossSiteProblem(headers(rebound), { body: true, env: {} }), HOST_REFUSED);
});
