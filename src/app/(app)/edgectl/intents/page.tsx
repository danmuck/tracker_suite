"use client";

import { useState } from "react";
import Link from "next/link";
import { useSWRConfig } from "swr";
import { toast } from "sonner";
import { ListChecks, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";
import { LoadingState } from "@/components/loading-state";
import { PageHeader } from "@/components/page-header";
import { RunCommandButton } from "@/components/edgectl/run-command-dialog";
import { StateBadge } from "@/components/edgectl/state-badge";
import { reconcileAll, useIntents } from "@/hooks/edgectl/use-intents";
import { isEdgectlKey } from "@/hooks/edgectl/use-mirage";
import { formatTime, targetLabel } from "@/lib/edgectl/format";
import { intentHref } from "@/lib/edgectl/paths";

export default function EdgectlIntentsPage() {
  const { intents, hasData, isLoading, isError } = useIntents();
  const { mutate } = useSWRConfig();
  const [reconciling, setReconciling] = useState(false);
  const pending = intents.reduce((sum, intent) => sum + intent.pending_count, 0);

  async function handleReconcileAll() {
    if (reconciling) return;
    setReconciling(true);
    try {
      const { reports } = await reconcileAll();
      toast.success(`Reconciled: ${reports.length} report${reports.length === 1 ? "" : "s"}`);
    } catch (error) {
      toast.error(error instanceof Error && error.message ? error.message : "Reconcile all failed");
    } finally {
      mutate(isEdgectlKey);
      setReconciling(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Intents"
        description="Every issue Mirage holds, newest first"
        action={
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleReconcileAll}
              disabled={reconciling || intents.length === 0}
              title={`Mirage runs one pending command of every intent (${pending} pending)`}
            >
              {reconciling && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Reconcile all
            </Button>
            <RunCommandButton />
          </div>
        }
      />
      {!hasData ? (
        isLoading ? (
          <LoadingState variant="table" />
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {isError ? "Could not read intents from Mirage." : "No intents."}
          </p>
        )
      ) : intents.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          title="No intents"
          description="Mirage keeps intents in memory, so a restart clears them. Run a command to submit an issue."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Intent</TableHead>
              <TableHead>Objective</TableHead>
              <TableHead>Target</TableHead>
              <TableHead className="text-right">Commands</TableHead>
              <TableHead className="text-right">Pending</TableHead>
              <TableHead>Completion</TableHead>
              <TableHead>Received</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {intents.map((intent) => (
              <TableRow key={intent.intent_id}>
                <TableCell className="font-mono text-xs">
                  <Link href={intentHref(intent.intent_id)} className="hover:underline">
                    {intent.intent_id}
                  </Link>
                </TableCell>
                <TableCell className="whitespace-normal">{intent.objective}</TableCell>
                <TableCell className="font-mono text-xs">{targetLabel(intent.target_scope)}</TableCell>
                <TableCell className="text-right tabular-nums">{intent.command_count}</TableCell>
                <TableCell className="text-right tabular-nums">{intent.pending_count}</TableCell>
                <TableCell>
                  <StateBadge state={intent.completion_state} empty="no report yet" />
                </TableCell>
                <TableCell className="whitespace-nowrap tabular-nums">{formatTime(intent.received_at_ms)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
