import { Section } from "@/components/site/section";
import { site } from "@/lib/site";

const label = "text-muted-foreground font-mono text-xs tracking-widest uppercase";
const subheading = `${label} mb-3`;

export function About() {
  return (
    <Section id="about" label="About">
      <div className="grid gap-12 lg:grid-cols-2">
        <div className="space-y-8">
          <div className="space-y-4 text-lg">
            {site.about.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
          <div>
            <h3 className={subheading}>Interests</h3>
            <ul className="flex flex-wrap gap-2">
              {site.interests.map((interest) => (
                <li key={interest} className="rounded-full border px-3 py-1 text-sm">
                  {interest}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className={subheading}>Education</h3>
            <ul className="space-y-3">
              {site.education.map((entry) => (
                <li key={entry.school} className="flex justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-medium">{entry.school}</p>
                    <p className="text-muted-foreground text-sm">
                      {entry.degree}
                      {entry.detail ? ` · ${entry.detail}` : ""}
                    </p>
                  </div>
                  <p className="text-muted-foreground font-mono text-xs">{entry.year}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <dl className="divide-y border-y self-start">
          {site.skills.map((group) => (
            <div key={group.label} className="grid gap-1 py-4 sm:grid-cols-[8rem_minmax(0,1fr)]">
              <dt className={label}>{group.label}</dt>
              <dd className="font-mono text-sm">{group.items.join(" · ")}</dd>
            </div>
          ))}
        </dl>
      </div>
    </Section>
  );
}
