"use client";

import { Suspense } from "react";
import { Activity } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/empty-state";
import { LoadingState } from "@/components/loading-state";
import { PageHeader } from "@/components/page-header";
import { ActivityTable, newestRecordsFirst } from "@/components/edgectl/activity-table";
import { newestFirst, ReportsTable } from "@/components/edgectl/reports-table";
import { useActivity } from "@/hooks/edgectl/use-activity";
import { useReports } from "@/hooks/edgectl/use-reports";
import { useTabParam } from "@/hooks/use-tab-param";
import type { ActivityKind } from "@/types/edgectl/api";

const HISTORY = 200;
const TABS = ["reports", "audit", "custody"] as const;

export default function EdgectlActivityPage() {
  return (
    <Suspense fallback={<LoadingState variant="table" />}>
      <ActivityView />
    </Suspense>
  );
}

function Unread({ isLoading, isError, what }: { isLoading: boolean; isError: boolean; what: string }) {
  if (isLoading) return <LoadingState variant="table" />;
  return (
    <p className="py-8 text-center text-sm text-muted-foreground">
      {isError ? `Could not read ${what} from Mirage.` : `No ${what}.`}
    </p>
  );
}

function Reports() {
  const { reports, hasData, isLoading, isError } = useReports(HISTORY);
  if (!hasData) return <Unread isLoading={isLoading} isError={isError} what="reports" />;
  if (reports.length === 0) {
    return (
      <EmptyState
        icon={Activity}
        title="No reports yet"
        description="Mirage keeps reports in memory, so a restart clears them."
      />
    );
  }
  return <ReportsTable reports={newestFirst(reports)} />;
}

const EMPTY: Record<ActivityKind, { title: string; description: string }> = {
  audit: {
    title: "No audit records",
    description: "Every request Mirage allows or denies is recorded here. Mirage keeps the last 1000 in memory, so a restart clears them.",
  },
  custody: {
    title: "No custody records",
    description: "Each step of a command's path through Mirage and its local Ghost is recorded here, in memory. Run a command to see one.",
  },
};

function Records({ kind }: { kind: ActivityKind }) {
  const { records, hasData, isLoading, isError } = useActivity(kind, HISTORY);
  if (!hasData) return <Unread isLoading={isLoading} isError={isError} what={`${kind} records`} />;
  if (records.length === 0) return <EmptyState icon={Activity} {...EMPTY[kind]} />;
  return <ActivityTable records={newestRecordsFirst(records)} kind={kind} />;
}

function ActivityView() {
  const [tab, setTab] = useTabParam(TABS, "reports");
  return (
    <div className="space-y-6">
      <PageHeader title="Activity" description={`The last ${HISTORY} reports, audit records and custody records from Mirage, newest first`} />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="reports">Reports</TabsTrigger>
          <TabsTrigger value="audit">Audit</TabsTrigger>
          <TabsTrigger value="custody">Custody</TabsTrigger>
        </TabsList>
        <TabsContent value="reports">
          <Reports />
        </TabsContent>
        <TabsContent value="audit">
          <Records kind="audit" />
        </TabsContent>
        <TabsContent value="custody">
          <Records kind="custody" />
        </TabsContent>
      </Tabs>
    </div>
  );
}
