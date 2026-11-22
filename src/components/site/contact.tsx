import { ArrowUpRight } from "lucide-react";
import { Section } from "@/components/site/section";
import { externalProps, site } from "@/lib/site";

export function Contact() {
  return (
    <Section id="contact" label="Contact">
      <ul className="divide-y border-y">
        {site.links.map((link) => (
          <li key={link.label}>
            <a
              href={link.href}
              {...externalProps(link.href)}
              className="group hover:bg-accent/50 -mx-3 flex items-center gap-4 px-3 py-4 transition-colors"
            >
              <span className="w-24 shrink-0 font-semibold">{link.label}</span>
              <span className="text-muted-foreground min-w-0 flex-1 font-mono text-sm break-words">
                {link.handle}
              </span>
              <ArrowUpRight
                className="text-muted-foreground size-4 shrink-0 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                aria-hidden
              />
            </a>
          </li>
        ))}
      </ul>
    </Section>
  );
}
