"use client";

import Link from "next/link";
import { moduleCards } from "@/components/dashboard";
import { ModuleGate } from "@/components/module-gate";
import { Section } from "@/components/site/section";
import { IS_DEMO, useResolvedDataSource, type DataSource } from "@/lib/data/mode";
import { availableModules } from "@/lib/modules";

function sourceLabel(source: DataSource | null): string | null {
  if (IS_DEMO) return "sample data · stored in your browser";
  if (source === null) return null;
  return source === "server" ? "my data" : "browser data";
}

/** The module dashboard, embedded in the landing page */
export function Workspace() {
  const source = useResolvedDataSource();
  const mods = source === null ? [] : availableModules(source);

  return (
    <Section id="workspace" label="Workspace" aside={sourceLabel(source)}>
      <div className="min-h-[28rem]">
        {/* ModuleGate seeds the demo's sample data before any card fetches */}
        <ModuleGate>
          <div className="mb-6 flex flex-wrap gap-2">
            {mods.map((mod) => (
              <Link
                key={mod.id}
                href={mod.basePath}
                className="hover:bg-accent inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors"
              >
                <mod.icon className="size-4" style={{ color: mod.accentColor }} aria-hidden />
                {mod.label}
              </Link>
            ))}
          </div>
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
