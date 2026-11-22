import { ArrowUpRight } from "lucide-react";
import { Section } from "@/components/site/section";
import { site, type Project } from "@/lib/site";

function ProjectRow({ project }: { project: Project }) {
  const content = (
    <>
      <span className="flex items-center gap-1.5 font-medium">
        {project.name}
        {project.href && (
          <ArrowUpRight className="size-3.5 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-foreground" />
        )}
      </span>
      <span className="text-sm leading-relaxed text-muted-foreground">
        {project.description}
      </span>
      <span className="font-mono text-xs text-muted-foreground md:text-right">
        {project.stack.join(" · ").toLowerCase()}
      </span>
    </>
  );
  const layout =
    "group grid gap-x-8 gap-y-1.5 px-3 py-5 md:grid-cols-[12rem_1fr_9rem] md:items-baseline";

  return (
    <li className="border-b last:border-b-0">
      {project.href ? (
        <a
          href={project.href}
          target="_blank"
          rel="noreferrer"
          className={`${layout} -mx-3 rounded-md transition-colors hover:bg-muted/60`}
        >
          {content}
        </a>
      ) : (
        <div className={`${layout} -mx-3`}>{content}</div>
      )}
    </li>
  );
}

export function Projects() {
  return (
    <Section id="projects" label="Projects">
      <ul className="border-t">
        {site.projects.map((project) => (
          <ProjectRow key={project.name} project={project} />
        ))}
      </ul>
    </Section>
  );
}
