"use client";

import { Activity } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { LoadingState } from "@/components/loading-state";
import { PageHeader } from "@/components/page-header";
import { newestFirst, ReportsTable } from "@/components/edgectl/reports-table";
import { useReports } from "@/hooks/edgectl/use-reports";

const HISTORY = 200;

export default function EdgectlActivityPage() {
  const { reports, hasData, isLoading, isError } = useReports(HISTORY);

  return (
    <div className="space-y-6">
      <PageHeader title="Activity" description={`The last ${HISTORY} reports from Mirage, newest first`} />
      {!hasData ? (
        isLoading ? (
          <LoadingState variant="table" />
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {isError ? "Could not read reports from Mirage." : "No reports."}
          </p>
        )
      ) : reports.length === 0 ? (
        <EmptyState
          icon={Activity}
          title="No reports yet"
          description="Mirage keeps reports in memory, so a restart clears them."
        />
      ) : (
        <ReportsTable reports={newestFirst(reports)} />
      )}
    </div>
  );
}
