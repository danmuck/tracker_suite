"use client";

import Link from "next/link";
import { moduleCards } from "@/components/dashboard";
import { ModuleGate } from "@/components/module-gate";
import { Section } from "@/components/site/section";
import { IS_DEMO, useResolvedDataSource, type DataSource } from "@/lib/data/mode";
import { availableModules, type ModuleConfig } from "@/lib/modules";

function sourceNote(source: DataSource | null): string {
  if (source === null) return "";
  if (IS_DEMO) return "sample data · stored in your browser";
  return source === "browser" ? "browser data" : "my data";
}

/** Jump links to every module, so the whole suite is one click from the top of the page. */
function ModuleLinks({ mods }: { mods: ModuleConfig[] }) {
  return (
    <nav aria-label="Modules" className="mb-6 flex flex-wrap gap-2">
      {mods.map((mod) => (
        <Link
          key={mod.id}
          href={mod.navItems[0]?.href ?? mod.basePath}
          className="inline-flex items-center gap-2 rounded-md border bg-card px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent"
        >
          <mod.icon className="size-3.5" style={{ color: mod.accentColor }} />
          {mod.label}
        </Link>
      ))}
    </nav>
  );
}

/**
 * The working part of the landing page: one live card per module. Hosted, the cards
 * read sample data from the visitor's browser; on the owner's server they read the
 * selected data source and every module is listed.
 */
export function Workspace() {
  const source = useResolvedDataSource();
  const mods = source === null ? [] : availableModules(source);

  return (
    <Section
      id="workspace"
      label="Workspace"
      aside={
        <span className="font-mono text-xs text-muted-foreground">{sourceNote(source)}</span>
      }
    >
      {/* Reserve room while the data source resolves and the demo seeds, so the page does not jump. */}
      <div className="min-h-[28rem]">
        <ModuleGate>
          <ModuleLinks mods={mods} />
          <div className="grid gap-6 sm:auto-rows-fr sm:grid-cols-2 lg:grid-cols-3">
            {mods.map((mod) => {
              const ModuleCard = moduleCards[mod.id];
              return ModuleCard ? <ModuleCard key={mod.id} /> : null;
            })}
          </div>
        </ModuleGate>
      </div>
    </Section>
  );
}
