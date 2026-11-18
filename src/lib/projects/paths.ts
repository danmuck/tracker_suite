// A project page is addressed by query string so the public build can be plain static files.
export function projectHref(id: string): string {
  return `/projects/view?id=${encodeURIComponent(id)}`;
}
