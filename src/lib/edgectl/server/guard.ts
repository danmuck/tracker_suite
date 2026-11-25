// Refuses state-changing requests that another website could make a browser send. Every call to
// Mirage is signed with the operator certificate, so a POST that reaches these routes acts as the
// operator: only this app's own pages may send one. Server-only.

type HeaderSource = { get(name: string): string | null };
type Env = Record<string, string | undefined>;

/**
 * Whether `host` (a Host header) is a name this app is served under: a loopback name, or one
 * listed in EDGECTL_ALLOWED_HOSTS (comma-separated; "name" for any port, or "name:port").
 * Without this a website could point its own domain at 127.0.0.1 (DNS rebinding): its requests
 * would then be same-origin to the browser, and it could read the answers too.
 */
export function hostAllowed(host: string | null | undefined, env: Env = process.env): boolean {
  const value = host?.trim().toLowerCase();
  if (!value) return false;
  let hostname: string;
  try {
    hostname = new URL(`http://${value}`).hostname;
  } catch {
    return false;
  }
  if (hostname === "localhost" || hostname.endsWith(".localhost")) return true;
  if (hostname === "127.0.0.1" || hostname === "[::1]") return true;
  const extra = (env.EDGECTL_ALLOWED_HOSTS ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  return extra.includes(hostname) || extra.includes(value);
}

export const HOST_REFUSED =
  "Refused: edgectl is only served on localhost. Add this host name to EDGECTL_ALLOWED_HOSTS on the server to allow it";

/**
 * Why a state-changing request is refused, or null when it may go on.
 * - A browser says where a request comes from (Sec-Fetch-Site, Origin): it must be this app.
 * - A body must be declared as JSON. A cross-site form cannot do that without a preflight,
 *   which this app never answers.
 * - The Host must be a name this app is served under (hostAllowed).
 * A request with neither browser header is not from a browser (curl, a script on this machine) and passes.
 */
export function crossSiteProblem(
  headers: HeaderSource,
  options: { body: boolean; env?: Env },
): string | null {
  if (!hostAllowed(headers.get("host"), options.env)) return HOST_REFUSED;

  const site = headers.get("sec-fetch-site");
  if (site !== null && site.trim().toLowerCase() !== "same-origin") {
    return "Refused: this request did not come from this app";
  }

  const origin = headers.get("origin");
  if (origin !== null) {
    const host = headers.get("host")?.trim().toLowerCase();
    let originHost: string | null = null;
    try {
      originHost = new URL(origin).host.toLowerCase();
    } catch {
      // "null" and anything else that is not a URL
    }
    if (!host || originHost === null || originHost !== host) {
      return "Refused: this request did not come from this app";
    }
  }

  if (options.body) {
    const mediaType = (headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (mediaType !== "application/json") return "Content-Type must be application/json";
  }
  return null;
}
