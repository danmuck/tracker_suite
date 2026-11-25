"use client";

import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LoadingState } from "@/components/loading-state";
import { PageHeader } from "@/components/page-header";
import { ConnectedBadge } from "@/components/edgectl/state-badge";
import { useRouting, useServices } from "@/hooks/edgectl/use-routing";
import { ghostHref } from "@/lib/edgectl/paths";

function Unread({ isLoading, isError, what }: { isLoading: boolean; isError: boolean; what: string }) {
  if (isLoading) return <LoadingState variant="table" />;
  return (
    <p className="py-6 text-center text-sm text-muted-foreground">
      {isError ? `Could not read ${what} from Mirage.` : `No ${what}.`}
    </p>
  );
}

function GhostLink({ id }: { id: string }) {
  return (
    <Link href={ghostHref(id)} className="font-mono text-xs hover:underline">
      {id}
    </Link>
  );
}

export default function EdgectlRoutingPage() {
  const routing = useRouting();
  const services = useServices();

  return (
    <div className="space-y-6">
      <PageHeader title="Routing" description="How Mirage reaches each Ghost, and which Ghosts offer each Seed" />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Routing table</CardTitle>
          <CardDescription>The admin address Mirage uses for each Ghost</CardDescription>
        </CardHeader>
        <CardContent>
          {!routing.hasData ? (
            <Unread isLoading={routing.isLoading} isError={routing.isError} what="routes" />
          ) : routing.routes.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Mirage has no route to any Ghost.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ghost</TableHead>
                  <TableHead>Admin address</TableHead>
                  <TableHead>State</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {routing.routes.map((route) => (
                  <TableRow key={route.ghost_id}>
                    <TableCell>
                      <GhostLink id={route.ghost_id} />
                    </TableCell>
                    <TableCell className="font-mono text-xs">{route.admin_addr || "—"}</TableCell>
                    <TableCell>
                      <ConnectedBadge connected={route.connected} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Available services</CardTitle>
          <CardDescription>Each Seed, and the Ghosts that offer it</CardDescription>
        </CardHeader>
        <CardContent>
          {!services.hasData ? (
            <Unread isLoading={services.isLoading} isError={services.isError} what="services" />
          ) : services.services.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No Ghost offers a Seed.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Seed</TableHead>
                  <TableHead>Ghosts</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {services.services.map((service) => (
                  <TableRow key={service.seed_id}>
                    <TableCell className="font-mono text-xs font-medium">{service.seed_id}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-x-3 gap-y-1">
                        {service.ghost_ids.length === 0
                          ? "—"
                          : service.ghost_ids.map((id) => <GhostLink key={id} id={id} />)}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
