"use client";

import { useState } from "react";
import Link from "next/link";
import { PackagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";
import { LoadingState } from "@/components/loading-state";
import { PageHeader } from "@/components/page-header";
import { ProposeDialog } from "@/components/edgectl/dependency-dialogs";
import { StateBadge } from "@/components/edgectl/state-badge";
import { useProposals } from "@/hooks/edgectl/use-proposals";
import { formatTime } from "@/lib/edgectl/format";
import { ghostHref, proposalHref } from "@/lib/edgectl/paths";

export default function EdgectlDependenciesPage() {
  const { proposals, hasData, isLoading, isError } = useProposals();
  const [proposeOpen, setProposeOpen] = useState(false);
  const newestFirst = [...proposals].sort((a, b) => b.proposed_at_ms - a.proposed_at_ms || b.id.localeCompare(a.id));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dependencies"
        description="Proposals to install what a Seed needs on a Ghost's host: proposed, approved by a second operator, then executed"
        action={<Button onClick={() => setProposeOpen(true)}>Propose</Button>}
      />

      {!hasData ? (
        isLoading ? (
          <LoadingState variant="table" />
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {isError ? "Could not read proposals from Mirage." : "No proposals."}
          </p>
        )
      ) : proposals.length === 0 ? (
        <EmptyState
          icon={PackagePlus}
          title="No proposals"
          description="Mirage keeps proposals in memory, so a restart clears them. Propose one to install a Seed's dependencies."
          action={{ label: "Propose", onClick: () => setProposeOpen(true) }}
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Proposal</TableHead>
              <TableHead>State</TableHead>
              <TableHead>Ghost</TableHead>
              <TableHead>Seeds</TableHead>
              <TableHead className="text-right">Steps</TableHead>
              <TableHead>Proposed by</TableHead>
              <TableHead>Proposed</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {newestFirst.map((proposal) => (
              <TableRow key={proposal.id}>
                <TableCell className="font-mono text-xs">
                  <Link href={proposalHref(proposal.id)} className="hover:underline">
                    {proposal.id}
                  </Link>
                </TableCell>
                <TableCell>
                  <StateBadge state={proposal.state} />
                </TableCell>
                <TableCell className="font-mono text-xs">
                  <Link href={ghostHref(proposal.ghost_id)} className="hover:underline">
                    {proposal.ghost_id}
                  </Link>
                </TableCell>
                <TableCell className="font-mono text-xs whitespace-normal">{proposal.seed_ids.join(", ")}</TableCell>
                <TableCell className="text-right tabular-nums">{proposal.steps.length}</TableCell>
                <TableCell className="font-mono text-xs break-all whitespace-normal">{proposal.proposed_by}</TableCell>
                <TableCell className="whitespace-nowrap tabular-nums">{formatTime(proposal.proposed_at_ms)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <ProposeDialog open={proposeOpen} onOpenChange={setProposeOpen} />
    </div>
  );
}
