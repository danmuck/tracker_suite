import { cn } from "@/lib/utils";
import { site } from "@/lib/site";

/** The "dm." tile: the same mark as the browser tab icon, in the theme's colors */
export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      role="img"
      aria-label={site.title}
      className={cn("size-8 shrink-0", className)}
    >
      <rect
        x="1.25"
        y="1.25"
        width="29.5"
        height="29.5"
        rx="5.75"
        strokeWidth={2.5}
        className="fill-brand stroke-[color:color-mix(in_oklab,var(--brand),black_20%)] dark:stroke-brand"
      />
      <text
        x="14"
        y="21.5"
        textAnchor="middle"
        fontWeight={900}
        fontSize={15}
        letterSpacing={-1}
        className="fill-black"
      >
        {site.mark}
      </text>
      <circle cx="26.8" cy="20.1" r="1.4" className="fill-brand-foreground dark:fill-foreground" />
    </svg>
  );
}
