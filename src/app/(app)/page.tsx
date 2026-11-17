"use client";

import { format } from "date-fns";
import { Plus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { moduleCards } from "@/components/dashboard";
import { modules } from "@/lib/modules";

export default function GlobalDashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Tracker Suite</h1>
        <p className="text-muted-foreground text-sm">
          {format(new Date(), "EEEE, MMMM d, yyyy")}
        </p>
      </div>

      <div className="grid auto-rows-fr gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {modules.map((mod) => {
          const ModuleCard = moduleCards[mod.id];
          return ModuleCard ? <ModuleCard key={mod.id} /> : null;
        })}

        {/* Placeholder for future modules */}
        <Card className="h-full border-dashed opacity-60">
          <CardContent className="flex flex-1 flex-col items-center justify-center py-10 text-center">
            <Plus className="h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-sm font-medium text-muted-foreground">
              More modules coming soon
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
