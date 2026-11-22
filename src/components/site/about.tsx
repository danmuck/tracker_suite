import { Section } from "@/components/site/section";
import { site } from "@/lib/site";

function Detail({ title, items }: { title: string; items: readonly string[] }) {
  return (
    <div>
      <h3 className="text-sm font-medium">{title}</h3>
      <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

export function About() {
  return (
    <Section id="about" label="About">
      <div className="grid gap-x-16 gap-y-10 md:grid-cols-2">
        <div className="space-y-8">
          <div className="space-y-4 text-lg leading-relaxed">
            {site.about.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
          <div className="grid gap-8 sm:grid-cols-2">
            <Detail title="Interests" items={site.interests} />
            <Detail title="Education" items={site.education} />
          </div>
        </div>
        <dl className="divide-y border-y self-start">
          {site.skills.map((group) => (
            <div key={group.label} className="grid grid-cols-[7rem_1fr] gap-4 py-3.5">
              <dt className="font-mono text-xs uppercase tracking-widest text-muted-foreground pt-0.5">
                {group.label}
              </dt>
              <dd className="text-sm leading-relaxed">{group.items.join(", ")}</dd>
            </div>
          ))}
        </dl>
      </div>
    </Section>
  );
}
