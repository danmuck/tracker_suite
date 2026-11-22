import { site } from "@/lib/site";
import { cn } from "@/lib/utils";

interface WordmarkProps {
  /** `mark` renders the short "dm." form for tight spaces. */
  variant?: "full" | "mark";
  className?: string;
}

/** The "dan muck." wordmark. Size it with a text-size class. */
export function Wordmark({ variant = "full", className }: WordmarkProps) {
  return (
    <span
      className={cn(
        "font-black lowercase leading-none tracking-[-0.06em] [word-spacing:0.06em] whitespace-nowrap",
        className
      )}
    >
      {variant === "mark" ? site.mark : site.name}
      <span className="text-brand">.</span>
    </span>
  );
}
