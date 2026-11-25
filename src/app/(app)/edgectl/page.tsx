"use client";

import Link from "next/link";
import { ScrollText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { LoadingState } from "@/components/loading-state";
import { PageHeader } from "@/components/page-header";
import { StatTile } from "@/components/stat-tile";
import { newestFirst, ReportsTable } from "@/components/edgectl/reports-table";
import { RunCommandButton } from "@/components/edgectl/run-command-dialog";
import { useMirage } from "@/hooks/edgectl/use-mirage";
import { useReports } from "@/hooks/edgectl/use-reports";

const LATEST = 5;

export default function EdgectlOverviewPage() {
  const { status } = useMirage();
  const { reports, hasData, isLoading, isError } = useReports();
  const latest = newestFirst(reports).slice(0, LATEST);

  return (
    <div className="space-y-6">
      <PageHeader
        title="edgectl"
        description="Mirage, its Ghosts and their Seeds"
        action={<RunCommandButton />}
      />

      {status && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile label="Mirage" value={status.mirage_id || "—"} sub={`phase ${status.phase || "unknown"}`} />
          <StatTile label="Ghosts" value={String(status.registered_ghosts)} sub="registered with Mirage" />
          <StatTile label="Active intents" value={String(status.active_intents)} sub="held by Mirage" />
          <StatTile label="Reports" value={String(status.report_count)} sub="since Mirage started" />
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Latest reports</CardTitle>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/edgectl/activity">All activity</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {!hasData ? (
            isLoading ? (
              <LoadingState variant="table" />
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {isError ? "Could not read reports from Mirage." : "No reports."}
              </p>
            )
          ) : latest.length === 0 ? (
            <EmptyState
              icon={ScrollText}
              title="No reports yet"
              description="Mirage keeps reports in memory, so a restart clears them. Run a command to get one."
            />
          ) : (
            <ReportsTable reports={latest} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
