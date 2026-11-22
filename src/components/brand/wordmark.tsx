import { cn } from "@/lib/utils";
import { site } from "@/lib/site";

/** The "dan muck." wordmark, or "dm." with variant="mark" */
export function Wordmark({
  variant = "full",
  className,
}: {
  variant?: "full" | "mark";
  className?: string;
}) {
  return (
    <span
      className={cn("font-black lowercase", className)}
      style={{ letterSpacing: "-0.06em", wordSpacing: "0.06em" }}
    >
      {variant === "mark" ? site.mark : site.name}
      <span className="text-brand">.</span>
    </span>
  );
}
