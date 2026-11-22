"use client";

import { format } from "date-fns";
import { moduleCards } from "@/components/dashboard";
import { availableModules } from "@/lib/modules";
import { useResolvedDataSource } from "@/lib/data/mode";

export default function GlobalDashboardPage() {
  const source = useResolvedDataSource();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground text-sm">
          {format(new Date(), "EEEE, MMMM d, yyyy")}
        </p>
      </div>

      <div className="grid gap-6 sm:auto-rows-fr sm:grid-cols-2 lg:grid-cols-3">
        {source !== null && availableModules(source).map((mod) => {
          const ModuleCard = moduleCards[mod.id];
          return ModuleCard ? <ModuleCard key={mod.id} /> : null;
        })}
      </div>
    </div>
  );
}
