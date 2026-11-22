"use client";

import { ChartBlock, Headline, ModuleCard, StatRow, StatRows } from "@/components/dashboard/module-card";
import { HBarList } from "@/components/dashboard/spark";
import { useProjects } from "@/hooks/projects/use-projects";
import { projectRollup } from "@/lib/dashboard/stats";
import { modules } from "@/lib/modules";
import { projectHref } from "@/lib/projects/paths";

const MAX_PROJECTS = 5;
const color = modules.find((m) => m.id === "projects")!.accentColor;

export function ProjectsCard() {
  const { projects, isLoading } = useProjects();
  const rollup = projectRollup(projects);
  const shown = rollup.progress.filter((p) => p.total > 0).slice(0, MAX_PROJECTS);
  const busiest = rollup.progress[0];

  return (
    <ModuleCard moduleId="projects" href="/projects" isLoading={isLoading}>
      <Headline
        label="Open tasks"
        value={rollup.openTasks}
        sub={`across ${rollup.active} active project${rollup.active !== 1 ? "s" : ""}`}
      />

      {shown.length > 0 && (
        <ChartBlock caption="Tasks done per project, most open first">
          <HBarList
            color={color}
            rows={shown.map((p) => ({
              key: p.id,
              label: p.name,
              fraction: p.done / p.total,
              value: `${p.done}/${p.total}`,
              href: projectHref(p.id),
            }))}
          />
        </ChartBlock>
      )}

      <StatRows>
        <StatRow
          label="Projects"
          value={`${rollup.active} active · ${rollup.completed} completed · ${rollup.archived} archived`}
          href="/projects"
        />
        {rollup.completion !== null && (
          <StatRow
            label="Tasks done"
            value={`${Math.round(rollup.completion * 100)}% · ${rollup.doneTasks} of ${rollup.totalTasks}`}
          />
        )}
        {busiest && busiest.open > 0 && (
          <StatRow
            label="Most open"
            value={`${busiest.name} · ${busiest.open} task${busiest.open !== 1 ? "s" : ""}`}
            href={projectHref(busiest.id)}
          />
        )}
      </StatRows>
    </ModuleCard>
  );
}
