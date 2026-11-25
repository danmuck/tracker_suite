import { pathId } from "@/lib/edgectl/validators";

// An intent page is addressed by query string, like the other detail pages in this app.
export function intentHref(intentId: string): string {
  return `/edgectl/intent?id=${encodeURIComponent(intentId)}`;
}

export function ghostHref(ghostId: string): string {
  return `/edgectl/ghost?id=${encodeURIComponent(ghostId)}`;
}

export function proposalHref(proposalId: string): string {
  return `/edgectl/dependency?id=${encodeURIComponent(proposalId)}`;
}

/**
 * The intent id from a page address, or "" when it could not be an edgectl id. The id goes into
 * API paths, so a crafted link such as "?id=../ghosts" must never reach a request.
 */
export function intentIdParam(value: string | null): string {
  return idParam(value);
}

/** Any edgectl id (intent, Ghost, proposal) from a page address, or "" when it could not be one */
export function idParam(value: string | null): string {
  const parsed = pathId.safeParse(value ?? "");
  return parsed.success ? parsed.data : "";
}

/** Path of one of this app's edgectl API routes, with each id percent-encoded */
export function apiPath(...segments: string[]): string {
  return ["/api/edgectl", ...segments.map(encodeURIComponent)].join("/");
}
