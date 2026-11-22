import { ArrowUpRight } from "lucide-react";
import { Wordmark } from "@/components/brand/wordmark";
import { site } from "@/config/site";
import { cn } from "@/lib/utils";

export function Hero({ compact = false }: { compact?: boolean }) {
  return (
    <section className={cn(compact ? "pt-12 pb-4 sm:pt-16" : "pt-20 pb-8 sm:pt-28 sm:pb-12")}>
      <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
        {site.role}
      </p>
      <h1 className="mt-4">
        <Wordmark
          className={cn(
            "block",
            compact ? "text-6xl sm:text-7xl" : "text-7xl sm:text-8xl md:text-9xl"
          )}
        />
      </h1>
      <p className="mt-8 max-w-2xl text-lg leading-relaxed text-muted-foreground sm:text-xl">
        {site.intro}
      </p>
      <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
        {site.links.map((link) => (
          <a
            key={link.label}
            href={link.href}
            {...(link.href.startsWith("http") && { target: "_blank", rel: "noreferrer" })}
            className="group inline-flex items-center gap-1 font-medium underline decoration-border decoration-2 underline-offset-4 transition-colors hover:decoration-brand"
          >
            {link.label}
            <ArrowUpRight className="size-3.5 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
          </a>
        ))}
        <span className="font-mono text-xs text-muted-foreground sm:ml-auto">
          {site.languages.join(" · ").toLowerCase()}
        </span>
      </div>
    </section>
  );
}
