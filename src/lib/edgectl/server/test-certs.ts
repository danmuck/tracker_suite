// TEST-ONLY: makes a throwaway certificate authority with a server and a client certificate,
// using the system's openssl. Used by client.test.ts to run a stub Mirage that requires a
// client certificate.

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface TestCerts {
  dir: string;
  caPath: string;
  serverCertPath: string;
  serverKeyPath: string;
  clientCertPath: string;
  clientKeyPath: string;
  remove: () => void;
}

function openssl(dir: string, args: string[]): void {
  execFileSync("openssl", args, { cwd: dir, stdio: "pipe" });
}

function leaf(dir: string, name: string, extensions: string): void {
  writeFileSync(join(dir, `${name}.ext`), extensions);
  openssl(dir, ["req", "-newkey", "rsa:2048", "-nodes", "-keyout", `${name}.key`, "-out", `${name}.csr`, "-subj", `/CN=${name}`]);
  openssl(dir, [
    "x509", "-req", "-in", `${name}.csr`, "-CA", "ca.crt", "-CAkey", "ca.key", "-CAcreateserial",
    "-out", `${name}.crt`, "-days", "2", "-extfile", `${name}.ext`,
  ]);
}

export function makeTestCerts(): TestCerts {
  const dir = mkdtempSync(join(tmpdir(), "edgectl-test-certs-"));
  openssl(dir, ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", "ca.key", "-out", "ca.crt", "-subj", "/CN=edgectl test root", "-days", "2"]);
  leaf(dir, "server", "subjectAltName=IP:127.0.0.1,DNS:localhost\nextendedKeyUsage=serverAuth\n");
  leaf(dir, "client", "subjectAltName=URI:edgectl://operator/test\nextendedKeyUsage=clientAuth\n");
  return {
    dir,
    caPath: join(dir, "ca.crt"),
    serverCertPath: join(dir, "server.crt"),
    serverKeyPath: join(dir, "server.key"),
    clientCertPath: join(dir, "client.crt"),
    clientKeyPath: join(dir, "client.key"),
    remove: () => rmSync(dir, { recursive: true, force: true }),
  };
}
