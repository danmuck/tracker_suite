import { ArrowUpRight } from "lucide-react";
import { Section } from "@/components/site/section";
import { site } from "@/lib/site";

export function Contact() {
  return (
    <Section id="contact" label="Contact">
      <ul className="border-t">
        {site.links.map((link) => (
          <li key={link.label} className="border-b">
            <a
              href={link.href}
              {...(link.href.startsWith("http") && { target: "_blank", rel: "noreferrer" })}
              className="group -mx-3 flex items-baseline gap-4 rounded-md px-3 py-4 transition-colors hover:bg-muted/60"
            >
              <span className="w-24 shrink-0 font-mono text-xs uppercase tracking-widest text-muted-foreground">
                {link.label}
              </span>
              <span className="truncate font-medium">{link.handle}</span>
              <ArrowUpRight className="ml-auto size-4 shrink-0 self-center text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-foreground" />
            </a>
          </li>
        ))}
      </ul>
    </Section>
  );
}
