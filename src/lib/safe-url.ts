// Links people save are shown as clickable anchors, so only web addresses may become an href.
// A `javascript:` or `data:` address would run script on this site when clicked.

import { z } from "zod";

/** True for an absolute http(s) address that the URL parser accepts. */
export function isWebUrl(value: string): boolean {
  if (!/^https?:\/\//i.test(value.trim())) return false;
  try {
    const { protocol } = new URL(value.trim());
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

/** The address to put in an href, or undefined when it is not a web address (stored before validation existed). */
export function safeHref(value: string | null | undefined): string | undefined {
  return value && isWebUrl(value) ? value.trim() : undefined;
}

/** Zod string for a web address; same rule as isWebUrl. */
export function webUrl(message = "Link must start with http:// or https://") {
  return z.string().trim().max(2000).refine(isWebUrl, message);
}
