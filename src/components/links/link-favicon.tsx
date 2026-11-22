"use client";

import { Link2 } from "lucide-react";
import { IS_DEMO } from "@/lib/data/mode";
import { getFaviconUrl } from "@/lib/links/favicon";
import { cn } from "@/lib/utils";

// The public (demo) build never asks Google for favicons: that request would tell Google the
// host of every link a visitor saves, and its CSP allows images from this site only.
export function LinkFavicon({ url, className }: { url: string; className?: string }) {
  if (IS_DEMO) return <Link2 aria-hidden className={cn("text-muted-foreground", className)} />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={getFaviconUrl(url)} alt="" className={className} />;
}
