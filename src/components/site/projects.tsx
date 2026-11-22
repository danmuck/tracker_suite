import { ArrowUpRight } from "lucide-react";
import { Section } from "@/components/site/section";
import { site, type SiteProject } from "@/lib/site";

const rowClass =
  "grid gap-x-8 gap-y-1 py-5 sm:grid-cols-[12rem_minmax(0,1fr)] lg:grid-cols-[14rem_minmax(0,1fr)_16rem]";

function Row({ project }: { project: SiteProject }) {
  return (
    <>
      <h3 className="flex items-center gap-1 font-semibold">
        {project.name}
        {project.href ? (
          <ArrowUpRight
            className="text-muted-foreground size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
            aria-hidden
          />
        ) : null}
      </h3>
      <p className="text-muted-foreground text-sm">{project.description}</p>
      <p className="text-muted-foreground font-mono text-xs sm:col-start-2 lg:col-start-3 lg:text-right">
        {project.stack.join(" · ")}
      </p>
    </>
  );
}

export function Projects() {
  return (
    <Section id="projects" label="Projects">
      <ul className="divide-y border-y">
        {site.projects.map((project) => (
          <li key={project.name}>
            {project.href ? (
              <a
                href={project.href}
                target="_blank"
                rel="noreferrer"
                className={`group hover:bg-accent/50 -mx-3 px-3 transition-colors ${rowClass}`}
              >
                <Row project={project} />
              </a>
            ) : (
              <div className={rowClass}>
                <Row project={project} />
              </div>
            )}
          </li>
        ))}
      </ul>
    </Section>
  );
}
