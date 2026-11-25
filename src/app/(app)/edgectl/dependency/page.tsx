"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LoadingState } from "@/components/loading-state";
import { StatTile } from "@/components/stat-tile";
import { ApproveDialog, ExecuteDialog } from "@/components/edgectl/dependency-dialogs";
import { StateBadge } from "@/components/edgectl/state-badge";
import { StepsTable } from "@/components/edgectl/steps-table";
import { useProposal } from "@/hooks/edgectl/use-proposals";
import { RequestError } from "@/lib/data/request-error";
import { formatTime } from "@/lib/edgectl/format";
import { ghostHref, idParam } from "@/lib/edgectl/paths";
import type { DependencyProposal } from "@/types/edgectl/api";

export default function EdgectlDependencyPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <ProposalView />
    </Suspense>
  );
}

const NEXT_STEP: Record<string, string> = {
  pending: "Waiting for a second operator to approve it.",
  approved: "Approved. Nothing is installed until it is executed.",
  executing: "The Ghost is installing the steps.",
  succeeded: "Installed.",
  failed: "The install failed. Propose again to retry.",
};

function Execution({ proposal }: { proposal: DependencyProposal }) {
  const execution = proposal.execution;
  if (!execution) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          Execution
          <StateBadge state={execution.succeeded ? "succeeded" : "failed"} />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {execution.error && (
          <div role="alert" className="rounded-md border border-destructive/50 bg-destructive/5 p-3 text-sm">
            <p className="font-medium text-destructive">The plan did not run</p>
            <p className="mt-1 font-mono text-xs break-words">{execution.error}</p>
          </div>
        )}
        {execution.steps.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Seed</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Error</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {execution.steps.map((step, i) => (
                <TableRow key={i}>
                  <TableCell className="font-mono text-xs">{step.seed_id}</TableCell>
                  <TableCell className="font-mono text-xs">{step.method}</TableCell>
                  <TableCell>
                    <StateBadge state={step.status} empty="none" />
                  </TableCell>
                  <TableCell className="font-mono text-xs break-words whitespace-normal">{step.error || "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {execution.rollback.length > 0 && (
          <div>
            <p className="mb-2 text-sm font-medium">Rolled back</p>
            <ul className="space-y-1 font-mono text-xs">
              {execution.rollback.map((step, i) => (
                <li key={i}>
                  {step.seed_id} ({step.method}): {step.rolled_back ? "removed" : `not removed${step.error ? `: ${step.error}` : ""}`}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ProposalView() {
  const id = idParam(useSearchParams().get("id"));
  const { proposal, isLoading, error } = useProposal(id);
  const [approveOpen, setApproveOpen] = useState(false);
  const [executeOpen, setExecuteOpen] = useState(false);

  const back = (
    <Button variant="ghost" size="sm" asChild className="-ml-2">
      <Link href="/edgectl/dependencies">
        <ArrowLeft className="mr-1 h-4 w-4" />
        Dependencies
      </Link>
    </Button>
  );

  if (!proposal) {
    const gone = error instanceof RequestError && error.status === 404;
    return (
      <div className="space-y-4">
        {back}
        {isLoading && id ? (
          <LoadingState />
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {!id
              ? "That is not a proposal id."
              : gone
                ? "Mirage has no proposal with this id. It keeps proposals in memory, so a restart clears them."
                : "Could not read this proposal from Mirage."}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {back}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex flex-wrap items-center gap-3 font-mono text-2xl font-bold tracking-tight">
            {proposal.id}
            <StateBadge state={proposal.state} />
          </h1>
          <p className="text-sm text-muted-foreground">{NEXT_STEP[proposal.state] ?? ""}</p>
        </div>
        <div className="flex gap-2">
          {proposal.state === "pending" && <Button onClick={() => setApproveOpen(true)}>Approve</Button>}
          {proposal.state === "approved" && (
            <Button variant="destructive" onClick={() => setExecuteOpen(true)}>
              Execute
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Link href={ghostHref(proposal.ghost_id)}>
          <StatTile label="Ghost" value={proposal.ghost_id} sub={proposal.seed_ids.join(", ")} />
        </Link>
        <StatTile label="Proposed by" value={shortPrincipal(proposal.proposed_by)} sub={formatTime(proposal.proposed_at_ms)} />
        <StatTile
          label="Approved by"
          value={proposal.approved_by ? shortPrincipal(proposal.approved_by) : "not yet"}
          sub={proposal.approved_by || "needs a second operator"}
        />
        <StatTile
          label="Executed by"
          value={proposal.executed_by ? shortPrincipal(proposal.executed_by) : "not yet"}
          sub={proposal.executed_by || "nothing installed"}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Install steps</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <StepsTable steps={proposal.steps} />
          {proposal.unresolved.length > 0 && (
            <p className="text-sm">
              <span className="font-medium">Not installed by this proposal:</span>{" "}
              <span className="font-mono">{proposal.unresolved.join(", ")}</span>
              <span className="text-muted-foreground"> (Mirage&apos;s catalog has no source for them)</span>
            </p>
          )}
        </CardContent>
      </Card>

      <Execution proposal={proposal} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Audit</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Step</TableHead>
                <TableHead>State after</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Detail</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {proposal.audit.map((record, i) => (
                <TableRow key={i}>
                  <TableCell className="whitespace-nowrap tabular-nums">{formatTime(record.at_ms)}</TableCell>
                  <TableCell className="font-mono text-xs">{record.kind}</TableCell>
                  <TableCell>
                    <StateBadge state={record.state} empty="none" />
                  </TableCell>
                  <TableCell className="font-mono text-xs break-all whitespace-normal">{record.actor || "—"}</TableCell>
                  <TableCell className="font-mono text-xs break-words whitespace-normal">{record.detail || "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <ApproveDialog proposalId={proposal.id} open={approveOpen} onOpenChange={setApproveOpen} />
      <ExecuteDialog proposal={proposal} open={executeOpen} onOpenChange={setExecuteOpen} />
    </div>
  );
}

/** "edgectl://operator/ops" -> "ops" */
function shortPrincipal(principal: string): string {
  return principal.split("/").filter(Boolean).at(-1) ?? principal;
}
