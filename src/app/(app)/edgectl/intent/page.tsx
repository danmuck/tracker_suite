"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useSWRConfig } from "swr";
import { toast } from "sonner";
import { ArrowLeft, Loader2, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LoadingState } from "@/components/loading-state";
import { StatTile } from "@/components/stat-tile";
import { CommandOutput } from "@/components/edgectl/command-output";
import { ReportsTable } from "@/components/edgectl/reports-table";
import { StateBadge } from "@/components/edgectl/state-badge";
import { executionKey } from "@/hooks/edgectl/use-execution";
import { reconcileIntent, useIntent } from "@/hooks/edgectl/use-intents";
import { isEdgectlKey } from "@/hooks/edgectl/use-mirage";
import { RequestError } from "@/lib/data/request-error";
import { formatTime, targetLabel } from "@/lib/edgectl/format";
import { intentIdParam } from "@/lib/edgectl/paths";
import type { Args, IntentCommand, IntentSnapshot } from "@/types/edgectl/api";

export default function EdgectlIntentPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <IntentView />
    </Suspense>
  );
}

function ArgsList({ args }: { args: Args }) {
  const entries = Object.entries(args);
  if (entries.length === 0) return <span className="text-muted-foreground">none</span>;
  return (
    <dl className="space-y-0.5 font-mono text-xs">
      {entries.map(([key, value]) => (
        <div key={key} className="flex gap-2">
          <dt className="shrink-0 text-muted-foreground">{key}</dt>
          <dd className="break-all whitespace-pre-wrap">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function CommandCard({ command }: { command: IntentCommand }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <span className="font-mono">
            {command.seed_selector} {command.operation}
          </span>
          <span className="text-sm font-normal text-muted-foreground">on</span>
          <span className="font-mono">{command.ghost_id}</span>
          <StateBadge state={command.state} />
        </CardTitle>
        <p className="font-mono text-xs text-muted-foreground">{command.command_id}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <p className="mb-1 text-xs text-muted-foreground">Arguments</p>
            <ArgsList args={command.args} />
          </div>
          <div className="space-y-1 text-xs text-muted-foreground">
            <p>
              {command.attempts} attempt{command.attempts === 1 ? "" : "s"} · {command.blocking ? "blocking" : "not blocking"}
            </p>
            <p>updated {formatTime(command.updated_at_ms)}</p>
          </div>
        </div>
        {command.last_error && (
          <div role="alert" className="rounded-md border border-destructive/50 bg-destructive/5 p-3 text-sm">
            <p className="font-medium text-destructive">Last error</p>
            <p className="mt-1 font-mono text-xs break-words">{command.last_error}</p>
          </div>
        )}
        <div>
          <p className="mb-1 text-xs text-muted-foreground">Output</p>
          {/* Before the first dispatch the Ghost has no record to read */}
          <CommandOutput commandId={command.attempts > 0 ? command.command_id : ""} />
        </div>
      </CardContent>
    </Card>
  );
}

function IssueStages({ intent }: { intent: IntentSnapshot }) {
  return (
    <div className="space-y-4">
      {intent.issue.stages.map((stage, i) => (
        <Card key={`${stage.id}:${i}`}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <span className="font-mono">{stage.id || `stage ${i + 1}`}</span>
              {stage.barrier && (
                <Badge variant="outline" className="font-normal">
                  barrier
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ghost</TableHead>
                  <TableHead>Seed</TableHead>
                  <TableHead>Operation</TableHead>
                  <TableHead>Arguments</TableHead>
                  <TableHead>Blocking</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stage.commands.map((command, j) => (
                  <TableRow key={j}>
                    <TableCell className="font-mono text-xs">{command.ghost_id}</TableCell>
                    <TableCell className="font-mono text-xs">{command.seed_selector}</TableCell>
                    <TableCell className="font-mono text-xs">{command.operation}</TableCell>
                    <TableCell className="whitespace-normal">
                      <ArgsList args={command.args} />
                    </TableCell>
                    <TableCell>{command.blocking ? "yes" : "no"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function IntentView() {
  const intentId = intentIdParam(useSearchParams().get("id"));
  const { intent, isLoading, error } = useIntent(intentId);
  const { mutate } = useSWRConfig();
  const [reconciling, setReconciling] = useState(false);

  async function handleReconcile() {
    if (reconciling) return;
    setReconciling(true);
    try {
      const report = await reconcileIntent(intentId);
      toast.success(report.summary || `Reconciled: ${report.completion_state}`);
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : "Reconcile failed");
    } finally {
      setReconciling(false);
      // Output is not polled: read it again for this intent's commands along with everything else.
      mutate(isEdgectlKey);
      for (const command of intent?.commands ?? []) mutate(executionKey(command.command_id));
    }
  }

  if (isLoading) return <LoadingState />;
  if (!intent) {
    const missing = !intentId || !error || (error instanceof RequestError && (error.status === 404 || error.status === 400));
    return (
      <div className="py-16 text-center">
        <p className="text-muted-foreground">
          {missing
            ? "Intent not found. Mirage keeps intents in memory, so a restart clears them."
            : "Could not read this intent from Mirage. Reload the page to try again."}
        </p>
        <Button variant="link" asChild className="mt-2">
          <Link href="/edgectl/intents">Back to Intents</Link>
        </Button>
      </div>
    );
  }

  const lastReport = intent.reports.at(-1);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <Button variant="ghost" size="icon" asChild className="shrink-0">
            <Link href="/edgectl/intents" aria-label="Back to Intents">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div className="min-w-0">
            <h1 className="truncate font-mono text-xl font-bold tracking-tight">{intent.intent_id}</h1>
            <p className="mt-0.5 truncate text-sm text-muted-foreground">{intent.issue.objective}</p>
          </div>
        </div>
        <Button onClick={handleReconcile} disabled={reconciling} className="shrink-0">
          {reconciling ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Reconcile
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Completion"
          value={lastReport?.completion_state || "no report yet"}
          sub={lastReport ? `phase ${lastReport.phase}` : "reconcile to run a command"}
        />
        <StatTile
          label="Pending commands"
          value={String(intent.pending_count)}
          sub={`of ${intent.commands.length} planned`}
        />
        <StatTile label="Target" value={targetLabel(intent.issue.target_scope)} sub={intent.issue.target_scope} />
        <StatTile label="Received" value={formatTime(intent.received_at_ms)} sub={intent.issue.actor || "no actor"} />
      </div>

      <Tabs defaultValue="commands">
        <TabsList>
          <TabsTrigger value="commands">Commands ({intent.commands.length})</TabsTrigger>
          <TabsTrigger value="issue">Issue</TabsTrigger>
          <TabsTrigger value="reports">Reports ({intent.reports.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="commands" className="mt-4 space-y-4">
          {intent.commands.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Mirage planned no commands for this issue.</p>
          ) : (
            intent.commands.map((command) => <CommandCard key={command.command_id} command={command} />)
          )}
        </TabsContent>

        <TabsContent value="issue" className="mt-4 space-y-4">
          {intent.issue.seed_dependencies && intent.issue.seed_dependencies.length > 0 && (
            <p className="text-sm text-muted-foreground">
              Seed dependencies: <span className="font-mono">{intent.issue.seed_dependencies.join(", ")}</span>
            </p>
          )}
          <IssueStages intent={intent} />
        </TabsContent>

        <TabsContent value="reports" className="mt-4">
          {intent.reports.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No reports yet. Reconcile makes Mirage run one pending command and report on it.
            </p>
          ) : (
            <ReportsTable reports={intent.reports} showIntent={false} />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
