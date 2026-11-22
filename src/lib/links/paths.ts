// A group page is addressed by query string so the public build can be plain static files.
export function linkGroupHref(slug: string): string {
  return `/links/group?slug=${encodeURIComponent(slug)}`;
}
