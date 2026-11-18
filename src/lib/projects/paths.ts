// A project page is addressed by query string so the public build can be plain static files.
export function projectHref(id: string): string {
  return `/projects/view?id=${encodeURIComponent(id)}`;
}

/**
 * The project id from a page address, or "" when it is not a stored id (24 hex characters, the
 * same in MongoDB and browser storage). The id goes into API paths, so anything else — such as
 * "../tasks/x" in a crafted link — must never reach a request.
 */
export function projectIdParam(value: string | null): string {
  return value && /^[0-9a-f]{24}$/i.test(value) ? value : "";
}
