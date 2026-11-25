"use client";

import { Headline, ModuleCard, StatRow, StatRows } from "@/components/dashboard/module-card";
import { useMirage } from "@/hooks/edgectl/use-mirage";

const PROBLEM = {
  not_configured: "Not configured",
  unreachable: "Unreachable",
  error: "Error",
} as const;

export function EdgectlCard() {
  const { connection, status, isLoading } = useMirage();

  return (
    <ModuleCard moduleId="edgectl" href="/edgectl" isLoading={isLoading && !connection}>
      {status ? (
        <>
          <Headline label="Mirage" value={status.mirage_id || "—"} sub={`phase ${status.phase || "unknown"}`} />
          <StatRows>
            <StatRow label="Ghosts" value={status.registered_ghosts} href="/edgectl/ghosts" />
            <StatRow label="Active intents" value={status.active_intents} href="/edgectl/intents" />
            <StatRow label="Reports" value={status.report_count} href="/edgectl/activity" />
          </StatRows>
        </>
      ) : (
        <Headline
          label="Mirage"
          value={connection && connection.state !== "ok" ? PROBLEM[connection.state] : "Unknown"}
          sub={connection && connection.state !== "ok" ? connection.message : "This app's server did not answer."}
        />
      )}
    </ModuleCard>
  );
}
