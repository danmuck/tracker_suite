"use client";

import { useState } from "react";
import Link from "next/link";
import { Ghost as GhostIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";
import { LoadingState } from "@/components/loading-state";
import { PageHeader } from "@/components/page-header";
import { DeployGhostDialog } from "@/components/edgectl/deploy-dialog";
import { AddGhostDialog, AttachGhostDialog } from "@/components/edgectl/ghost-dialogs";
import { RunCommandButton } from "@/components/edgectl/run-command-dialog";
import { ConnectedBadge } from "@/components/edgectl/state-badge";
import { useGhosts } from "@/hooks/edgectl/use-ghosts";
import { formatTime } from "@/lib/edgectl/format";
import { ghostHref } from "@/lib/edgectl/paths";

export default function EdgectlGhostsPage() {
  const { ghosts, hasData, isLoading, isError } = useGhosts();
  const [addOpen, setAddOpen] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [deployOpen, setDeployOpen] = useState(false);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ghosts"
        description="Execution nodes registered with Mirage"
        action={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setDeployOpen(true)}>
              Deploy
            </Button>
            <Button variant="outline" onClick={() => setAttachOpen(true)}>
              Attach
            </Button>
            <Button onClick={() => setAddOpen(true)}>Add a Ghost</Button>
          </div>
        }
      />

      {!hasData ? (
        isLoading ? (
          <LoadingState variant="table" />
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {isError ? "Could not read Ghosts from Mirage." : "No Ghosts."}
          </p>
        )
      ) : ghosts.length === 0 ? (
        <EmptyState
          icon={GhostIcon}
          title="No Ghosts registered"
          description="Add a Ghost on Mirage's machine, or attach one that is already running."
          action={{ label: "Attach a Ghost", onClick: () => setAttachOpen(true) }}
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ghost</TableHead>
              <TableHead>State</TableHead>
              <TableHead>Address</TableHead>
              <TableHead>Seeds</TableHead>
              <TableHead>Last event</TableHead>
              <TableHead className="text-right">Events</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {ghosts.map((ghost) => (
              <TableRow key={ghost.ghost_id}>
                <TableCell className="font-mono text-sm font-medium">
                  <Link href={ghostHref(ghost.ghost_id)} className="hover:underline">
                    {ghost.ghost_id}
                  </Link>
                </TableCell>
                <TableCell>
                  <ConnectedBadge connected={ghost.connected} />
                </TableCell>
                <TableCell className="font-mono text-xs">{ghost.remote_addr || "—"}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {ghost.seed_list.length === 0
                      ? "—"
                      : ghost.seed_list.map((seed) => (
                          <Badge key={seed.id} variant="secondary" className="font-mono font-normal" title={seed.description}>
                            {seed.id}
                          </Badge>
                        ))}
                  </div>
                </TableCell>
                <TableCell className="whitespace-nowrap tabular-nums">
                  {ghost.last_event_at_ms ? formatTime(ghost.last_event_at_ms) : "none yet"}
                </TableCell>
                <TableCell className="text-right tabular-nums">{ghost.event_count}</TableCell>
                <TableCell className="text-right">
                  {ghost.connected && <RunCommandButton ghostId={ghost.ghost_id} variant="outline" />}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <AddGhostDialog open={addOpen} onOpenChange={setAddOpen} />
      <AttachGhostDialog open={attachOpen} onOpenChange={setAttachOpen} />
      <DeployGhostDialog open={deployOpen} onOpenChange={setDeployOpen} />
    </div>
  );
}
