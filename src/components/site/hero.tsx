import { ArrowUpRight } from "lucide-react";
import { Wordmark } from "@/components/brand/wordmark";
import { cn } from "@/lib/utils";
import { externalProps, site } from "@/lib/site";

/** `compact` is the smaller hero used on the local server, where the workspace is the point */
export function Hero({ compact = false }: { compact?: boolean }) {
  return (
    <section className={cn(compact ? "pt-10 pb-4 sm:pt-14" : "pt-16 pb-8 sm:pt-24")}>
      <p className="text-muted-foreground font-mono text-xs tracking-widest uppercase">
        {site.role}
      </p>
      <h1
        className={cn(
          "mt-4",
          compact ? "text-6xl sm:text-7xl" : "text-7xl sm:text-8xl lg:text-9xl",
          // after the size, which sets its own line height
          "leading-none"
        )}
      >
        <Wordmark />
      </h1>
      <p className="text-muted-foreground mt-6 max-w-2xl text-lg">{site.intro}</p>
      <div className="mt-8 flex flex-wrap items-center justify-between gap-x-8 gap-y-4">
        <ul className="flex flex-wrap gap-x-6 gap-y-2">
          {site.links.map((link) => (
            <li key={link.label}>
              <a
                href={link.href}
                {...externalProps(link.href)}
                className="decoration-brand inline-flex items-center gap-1 text-sm font-medium underline decoration-2 underline-offset-4 hover:decoration-4"
              >
                {link.label}
                <ArrowUpRight className="size-3.5" aria-hidden />
              </a>
            </li>
          ))}
        </ul>
        <p className="text-muted-foreground font-mono text-xs">{site.languages.join(" · ")}</p>
      </div>
    </section>
  );
}
