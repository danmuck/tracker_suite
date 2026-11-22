import { ArrowUpRight } from "lucide-react";
import { Wordmark } from "@/components/brand/wordmark";
import { externalProps, site } from "@/lib/site";

export function Hero() {
  return (
    <section className="pt-16 pb-8 sm:pt-24">
      <p className="text-muted-foreground font-mono text-xs tracking-widest uppercase">
        {site.role}
      </p>
      <h1 className="mt-4 text-6xl leading-none sm:text-7xl lg:text-8xl">
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
