// Refuses state-changing requests that another website could make a browser send. Every call to
// Mirage is signed with the operator certificate, so a POST that reaches these routes acts as the
// operator: only this app's own pages may send one. Server-only.

type HeaderSource = { get(name: string): string | null };

/**
 * Why a state-changing request is refused, or null when it may go on.
 * - A browser says where a request comes from (Sec-Fetch-Site, Origin): it must be this app.
 * - A body must be declared as JSON. A cross-site form cannot do that without a preflight,
 *   which this app never answers.
 * A request with neither header is not from a browser (curl, a script on this machine) and passes.
 */
export function crossSiteProblem(headers: HeaderSource, options: { body: boolean }): string | null {
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
