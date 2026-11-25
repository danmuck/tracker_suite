"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LoadingState } from "@/components/loading-state";
import { StatTile } from "@/components/stat-tile";
import { RunCommandButton } from "@/components/edgectl/run-command-dialog";
import { ConnectedBadge, StateBadge } from "@/components/edgectl/state-badge";
import { useGhostEvents, useGhostStatus, useGhostVerification } from "@/hooks/edgectl/use-ghost-console";
import { useGhosts } from "@/hooks/edgectl/use-ghosts";
import { useTabParam } from "@/hooks/use-tab-param";
import { formatTime } from "@/lib/edgectl/format";
import { idParam, intentHref } from "@/lib/edgectl/paths";

const HISTORY = 50;
const TABS = ["events", "verification"] as const;

export default function EdgectlGhostPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <GhostView />
    </Suspense>
  );
}

function Unread({ isLoading, isError, what }: { isLoading: boolean; isError: boolean; what: string }) {
  if (isLoading) return <LoadingState variant="table" />;
  return (
    <p className="py-8 text-center text-sm text-muted-foreground">
      {isError ? `Mirage could not read ${what} from this Ghost.` : `No ${what}.`}
    </p>
  );
}

function IntentLink({ id }: { id: string }) {
  if (!id) return <>—</>;
  return (
    <Link href={intentHref(id)} className="hover:underline">
      {id}
    </Link>
  );
}

function Events({ ghostId }: { ghostId: string }) {
  const { events, hasData, isLoading, isError } = useGhostEvents(ghostId, HISTORY);
  if (!hasData) return <Unread isLoading={isLoading} isError={isError} what="events" />;
  if (events.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">This Ghost has run no command yet.</p>;
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Time</TableHead>
          <TableHead>Seed</TableHead>
          <TableHead>Outcome</TableHead>
          <TableHead>Intent</TableHead>
          <TableHead>Command</TableHead>
          <TableHead>Event</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {[...events].reverse().map((event, i) => (
          <TableRow key={`${event.event_id}:${i}`}>
            <TableCell className="whitespace-nowrap tabular-nums">{formatTime(event.timestamp_ms)}</TableCell>
            <TableCell className="font-mono text-xs">{event.seed_id || "—"}</TableCell>
            <TableCell>
              <StateBadge state={event.outcome} empty="none" />
            </TableCell>
            <TableCell className="font-mono text-xs">
              <IntentLink id={event.intent_id} />
            </TableCell>
            <TableCell className="font-mono text-xs break-all whitespace-normal">{event.command_id || "—"}</TableCell>
            <TableCell className="font-mono text-xs break-all whitespace-normal">{event.event_id || "—"}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function Verification({ ghostId }: { ghostId: string }) {
  const { records, hasData, isLoading, isError } = useGhostVerification(ghostId, HISTORY);
  if (!hasData) return <Unread isLoading={isLoading} isError={isError} what="verification records" />;
  if (records.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">No verification records yet.</p>;
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Time</TableHead>
          <TableHead>Seed and operation</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Outcome</TableHead>
          <TableHead className="text-right">Exit</TableHead>
          <TableHead>Messages</TableHead>
          <TableHead>Ids</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {[...records].reverse().map((record, i) => (
          <TableRow key={`${record.execution_id}:${i}`}>
            <TableCell className="whitespace-nowrap tabular-nums">{formatTime(record.timestamp_ms)}</TableCell>
            <TableCell className="font-mono text-xs">
              {record.seed_id} {record.operation}
            </TableCell>
            <TableCell>
              <StateBadge state={record.status} empty="none" />
            </TableCell>
            <TableCell>
              <StateBadge state={record.outcome} empty="none" />
              {record.seed_status && record.seed_status !== record.outcome && (
                <span className="ml-2 font-mono text-xs text-muted-foreground">seed {record.seed_status}</span>
              )}
            </TableCell>
            <TableCell className="text-right tabular-nums">{record.exit_code}</TableCell>
            <TableCell className="font-mono text-xs whitespace-normal">
              #{record.command_message_id}: type {record.command_message_type} → {record.event_message_type}
            </TableCell>
            <TableCell className="whitespace-normal">
              <dl className="space-y-0.5 font-mono text-xs">
                {(
                  [
                    ["command", record.command_id],
                    ["execution", record.execution_id],
                    ["event", record.event_id],
                    ["trace", record.trace_id],
                  ] as const
                )
                  .filter(([, value]) => value)
                  .map(([label, value]) => (
                    <div key={label} className="flex gap-2">
                      <dt className="shrink-0 text-muted-foreground">{label}</dt>
                      <dd className="break-all">{value}</dd>
                    </div>
                  ))}
              </dl>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function GhostView() {
  const ghostId = idParam(useSearchParams().get("id"));
  const { status, isLoading, error } = useGhostStatus(ghostId);
  const { ghosts } = useGhosts();
  const [tab, setTab] = useTabParam(TABS, "events");
  const listed = ghosts.find((ghost) => ghost.ghost_id === ghostId);

  const back = (
    <Button variant="ghost" size="sm" asChild className="-ml-2">
      <Link href="/edgectl/ghosts">
        <ArrowLeft className="mr-1 h-4 w-4" />
        Ghosts
      </Link>
    </Button>
  );

  if (!ghostId) {
    return (
      <div className="space-y-4">
        {back}
        <p className="py-8 text-center text-sm text-muted-foreground">That is not a Ghost id.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {back}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-mono text-2xl font-bold tracking-tight">{ghostId}</h1>
          <p className="text-sm text-muted-foreground">One Ghost, read through Mirage</p>
        </div>
        <RunCommandButton ghostId={ghostId} />
      </div>

      {!status ? (
        isLoading ? (
          <LoadingState />
        ) : (
          <div role="alert" className="rounded-md border border-destructive/50 bg-destructive/5 p-3 text-sm">
            <p className="font-medium text-destructive">Mirage could not read this Ghost&apos;s status</p>
            <p className="mt-1 font-mono text-xs break-words">
              {error instanceof Error ? error.message : "No answer"}
            </p>
          </div>
        )
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile label="Phase" value={status.phase || "—"} sub="Ghost lifecycle phase" />
          <StatTile label="Seeds" value={String(status.seed_count)} sub="registered on this Ghost" />
          <StatTile
            label="Session events"
            value={listed ? String(listed.event_count) : "—"}
            sub={listed?.last_event_at_ms ? `last ${formatTime(listed.last_event_at_ms)}` : "none over Mirage's session"}
          />
          <StatTile label="Address" value={listed?.remote_addr || "—"} sub={listed ? "as registered with Mirage" : "not in Mirage's Ghost list"} />
        </div>
      )}

      {listed && (
        <div className="flex flex-wrap items-center gap-2">
          <ConnectedBadge connected={listed.connected} />
          {listed.seed_list.map((seed) => (
            <Badge key={seed.id} variant="secondary" className="font-mono font-normal" title={seed.description}>
              {seed.id}
            </Badge>
          ))}
        </div>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="events">Recent events</TabsTrigger>
          <TabsTrigger value="verification">Verification</TabsTrigger>
        </TabsList>
        <TabsContent value="events">
          <Events ghostId={ghostId} />
        </TabsContent>
        <TabsContent value="verification">
          <Verification ghostId={ghostId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
