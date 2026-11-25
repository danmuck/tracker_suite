import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, readFileSync } from "node:fs";
import { createServer, type Server } from "node:https";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { statusSchema } from "@/lib/edgectl/validators";
import { failureOf, MirageError, mirageRequest, readConfig } from "./client";
import { makeTestCerts, type TestCerts } from "./test-certs";

// A stub Mirage: HTTPS, TLS 1.3, and a client certificate from the test root is required.
let certs: TestCerts;
let strangers: TestCerts; // a second root the stub does not trust
let server: Server;
let env: Record<string, string>;
const seen: { method: string; url: string; body: string; requestId: string; subject: string; headers: Record<string, unknown> }[] = [];

const ok = (data: unknown) => ({ ok: true, request_id: "req.1", trace_id: "trace.req.1", timestamp_ms: 1, data });
const status = { mirage_id: "mirage.test", phase: "seeded", registered_ghosts: 1, active_intents: 0, report_count: 0 };

before(async () => {
  certs = makeTestCerts();
  strangers = makeTestCerts();
  server = createServer(
    {
      key: readFileSync(certs.serverKeyPath),
      cert: readFileSync(certs.serverCertPath),
      ca: readFileSync(certs.caPath),
      requestCert: true,
      rejectUnauthorized: true,
      minVersion: "TLSv1.3",
    },
    (req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => chunks.push(c));
      req.on("end", () => {
        const peer = (req.socket as import("node:tls").TLSSocket).getPeerCertificate();
        seen.push({
          method: req.method ?? "",
          url: req.url ?? "",
          body: Buffer.concat(chunks).toString("utf8"),
          requestId: String(req.headers["x-request-id"] ?? ""),
          subject: peer.subject?.CN ?? "",
          headers: { ...req.headers },
        });
        const send = (code: number, body: unknown) => {
          res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
          res.end(typeof body === "string" ? body : JSON.stringify(body));
        };
        const path = (req.url ?? "").split("?")[0];
        if (path === "/api/v1/status") return send(200, ok(status));
        if (path === "/api/v1/intents" && req.method === "POST") return send(200, ok({ intent_id: "intent.1" }));
        if (path === "/api/v1/intents/missing") {
          return send(404, {
            ok: false,
            request_id: "req.2",
            trace_id: "trace.missing",
            timestamp_ms: 2,
            error: { class: "semantic", code: 1300, message: 'mirage.api: not found: intent_id "missing"', retryable: false },
          });
        }
        if (path === "/api/v1/ghosts/attach") {
          return send(502, {
            ok: false,
            request_id: "req.3",
            trace_id: "trace.req.3",
            timestamp_ms: 3,
            error: { class: "transport", code: 1000, message: "dial tcp: connection refused", retryable: true },
          });
        }
        if (path === "/api/v1/html") return send(200, "<html>not json</html>");
        if (path === "/api/v1/bare") return send(200, { hello: "world" });
        if (path === "/api/v1/wrong") return send(200, ok({ mirage_id: 7 }));
        if (path === "/api/v1/slow") return; // never answers
        return send(200, ok({ path }));
      });
    },
  );
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  env = {
    EDGECTL_API_URL: `https://127.0.0.1:${port}/api/v1`,
    EDGECTL_CLIENT_CERT: certs.clientCertPath,
    EDGECTL_CLIENT_KEY: certs.clientKeyPath,
    EDGECTL_CA: certs.caPath,
  };
});

after(() => {
  server.closeAllConnections();
  server.close();
  certs.remove();
  strangers.remove();
});

const failure = async (run: Promise<unknown>): Promise<MirageError> => {
  try {
    await run;
  } catch (error) {
    assert.ok(error instanceof MirageError, `expected a MirageError, got ${String(error)}`);
    return error;
  }
  assert.fail("expected the request to fail");
};

test("a successful call presents the client certificate and returns the envelope's data", async () => {
  seen.length = 0;
  const data = await mirageRequest("GET", ["status"], { env, schema: statusSchema });
  assert.deepEqual(data, status);
  assert.equal(seen.length, 1);
  assert.equal(seen[0].method, "GET");
  assert.equal(seen[0].url, "/api/v1/status");
  assert.equal(seen[0].subject, "client");
});

test("a POST sends its JSON body and the X-Request-Id header", async () => {
  seen.length = 0;
  const issue = { intent_id: "intent.1", target_scope: "ghost:g", objective: "o", stages: [] };
  const data = await mirageRequest("POST", ["intents"], { env, body: issue, requestId: "req.from.gui" });
  assert.deepEqual(data, { intent_id: "intent.1" });
  assert.deepEqual(JSON.parse(seen[0].body), issue);
  assert.equal(seen[0].requestId, "req.from.gui");
});

test("outgoing headers are built from scratch: JSON Content-Type with a body, nothing browser-style", async () => {
  seen.length = 0;
  await mirageRequest("POST", ["intents"], { env, body: { intent_id: "intent.1" }, requestId: "req.x" });
  await mirageRequest("POST", ["intents", "intent.1", "reconcile"], { env });
  await mirageRequest("GET", ["status"], { env });
  const [withBody, noBody, read] = seen.map((r) => r.headers);
  assert.deepEqual(Object.keys(withBody).sort(), ["connection", "content-length", "content-type", "host", "x-request-id"]);
  assert.match(String(withBody["content-type"]), /^application\/json\b/);
  for (const headers of [noBody, read]) {
    assert.deepEqual(Object.keys(headers).filter((h) => h !== "content-length" && h !== "transfer-encoding").sort(), ["connection", "host"]);
  }
  for (const headers of [withBody, noBody, read]) {
    for (const name of Object.keys(headers)) assert.doesNotMatch(name, /^(origin|referer|cookie|sec-fetch-.*)$/);
  }
});

test("path segments are percent-encoded and query values are sent", async () => {
  seen.length = 0;
  await mirageRequest("GET", ["intents", "../ghosts?x=1 #y"], { env, query: { limit: 5, skipped: undefined } });
  assert.equal(seen[0].url, "/api/v1/intents/..%2Fghosts%3Fx%3D1%20%23y?limit=5");
});

test("an error envelope keeps its code, class, message, retryable and HTTP status", async () => {
  const missing = await failure(mirageRequest("GET", ["intents", "missing"], { env }));
  assert.equal(missing.kind, "api");
  assert.equal(missing.status, 404);
  assert.equal(missing.code, 1300);
  assert.equal(missing.errorClass, "semantic");
  assert.equal(missing.retryable, false);
  assert.equal(missing.message, 'mirage.api: not found: intent_id "missing"');
  assert.equal(missing.requestId, "req.2");

  const refused = await failure(mirageRequest("POST", ["ghosts", "attach"], { env, body: { ghost_admin_addr: "x" } }));
  assert.equal(refused.kind, "api");
  assert.equal(refused.status, 502);
  assert.equal(refused.code, 1000);
  assert.equal(refused.retryable, true);
  assert.equal(refused.message, "dial tcp: connection refused");
});

test("an unset variable is not_configured and names it; no request is made", async () => {
  seen.length = 0;
  const error = await failure(mirageRequest("GET", ["status"], { env: { ...env, EDGECTL_CLIENT_KEY: "", EDGECTL_CA: undefined } }));
  assert.equal(error.kind, "not_configured");
  assert.match(error.message, /EDGECTL_CLIENT_KEY, EDGECTL_CA/);
  assert.doesNotMatch(error.message, /EDGECTL_API_URL/);
  assert.equal(seen.length, 0);
  assert.throws(() => readConfig({}), /EDGECTL_API_URL, EDGECTL_CLIENT_CERT, EDGECTL_CLIENT_KEY, EDGECTL_CA/);
});

test("a plain http or malformed URL is not_configured", async () => {
  const plain = await failure(mirageRequest("GET", ["status"], { env: { ...env, EDGECTL_API_URL: "http://127.0.0.1:1/api/v1" } }));
  assert.equal(plain.kind, "not_configured");
  assert.match(plain.message, /https/);
  const malformed = await failure(mirageRequest("GET", ["status"], { env: { ...env, EDGECTL_API_URL: "not a url" } }));
  assert.equal(malformed.kind, "not_configured");
});

test("a certificate file that cannot be read is not_configured", async () => {
  const error = await failure(
    mirageRequest("GET", ["status"], { env: { ...env, EDGECTL_CLIENT_CERT: join(certs.dir, "absent.crt") } }),
  );
  assert.equal(error.kind, "not_configured");
  assert.match(error.message, /EDGECTL_CLIENT_CERT/);
  assert.match(error.message, /ENOENT/);
});

test("nothing listening is unreachable and retryable", async () => {
  const closed = createServer();
  await new Promise<void>((resolve) => closed.listen(0, "127.0.0.1", resolve));
  const { port } = closed.address() as AddressInfo;
  await new Promise((resolve) => closed.close(resolve));
  const error = await failure(mirageRequest("GET", ["status"], { env: { ...env, EDGECTL_API_URL: `https://127.0.0.1:${port}/api/v1` } }));
  assert.equal(error.kind, "unreachable");
  assert.equal(error.retryable, true);
  assert.match(error.message, new RegExp(`No answer from Mirage at https://127\\.0\\.0\\.1:${port}`));
});

test("a client certificate the server does not trust is unreachable, with no data", async () => {
  const error = await failure(
    mirageRequest("GET", ["status"], {
      env: { ...env, EDGECTL_CLIENT_CERT: strangers.clientCertPath, EDGECTL_CLIENT_KEY: strangers.clientKeyPath },
    }),
  );
  assert.equal(error.kind, "unreachable");
});

test("a server certificate from another root is unreachable", async () => {
  const error = await failure(mirageRequest("GET", ["status"], { env: { ...env, EDGECTL_CA: strangers.caPath } }));
  assert.equal(error.kind, "unreachable");
});

test("a request that gets no answer times out as unreachable", async () => {
  const error = await failure(mirageRequest("GET", ["slow"], { env, timeoutMs: 200 }));
  assert.equal(error.kind, "unreachable");
  assert.match(error.message, /timed out/);
});

test("a body that is not an api/v1 envelope, or data of the wrong shape, is bad_response", async () => {
  assert.equal((await failure(mirageRequest("GET", ["html"], { env }))).kind, "bad_response");
  assert.equal((await failure(mirageRequest("GET", ["bare"], { env }))).kind, "bad_response");
  assert.equal((await failure(mirageRequest("GET", ["wrong"], { env, schema: statusSchema }))).kind, "bad_response");
});

test("certificate files are read again on every request", async () => {
  const certPath = join(certs.dir, "rotating.crt");
  const keyPath = join(certs.dir, "rotating.key");
  const rotating = { ...env, EDGECTL_CLIENT_CERT: certPath, EDGECTL_CLIENT_KEY: keyPath };

  copyFileSync(strangers.clientCertPath, certPath);
  copyFileSync(strangers.clientKeyPath, keyPath);
  assert.equal((await failure(mirageRequest("GET", ["status"], { env: rotating }))).kind, "unreachable");

  // The lab restarted and wrote new files at the same paths.
  copyFileSync(certs.clientCertPath, certPath);
  copyFileSync(certs.clientKeyPath, keyPath);
  assert.deepEqual(await mirageRequest("GET", ["status"], { env: rotating }), status);
});

test("failureOf maps each kind to this app's HTTP answer and keeps Mirage's code and message", () => {
  assert.deepEqual(failureOf(new MirageError("not_configured", "Not set on the server: EDGECTL_CA")), {
    status: 503,
    body: { error: "edgectl is not configured. Not set on the server: EDGECTL_CA", kind: "not_configured", code: 0, class: "", retryable: false },
  });
  const down = failureOf(new MirageError("unreachable", "No answer from Mirage at https://127.0.0.1:1: refused", { retryable: true }));
  assert.equal(down.status, 504);
  assert.match(down.body.error, /^Mirage unreachable\. /);
  assert.equal(down.body.retryable, true);
  assert.equal(failureOf(new MirageError("bad_response", "x")).status, 502);
  assert.deepEqual(
    failureOf(new MirageError("api", "not found", { status: 404, code: 1300, errorClass: "semantic" })),
    { status: 404, body: { error: "not found", kind: "api", code: 1300, class: "semantic", retryable: false } },
  );
  // An unexpected error tells the client nothing about itself.
  assert.deepEqual(failureOf(new Error("secret path /x")), {
    status: 500,
    body: { error: "Request failed", kind: "internal", code: 0, class: "", retryable: false },
  });
});
