"use client";

import { Sprout } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";
import { LoadingState } from "@/components/loading-state";
import { PageHeader } from "@/components/page-header";
import { RunCommandButton } from "@/components/edgectl/run-command-dialog";
import { ConnectedBadge } from "@/components/edgectl/state-badge";
import { useSeeds } from "@/hooks/edgectl/use-seeds";
import type { GhostSeedCatalog, SeedCapability } from "@/types/edgectl/api";

function SeedCard({ seed }: { seed: SeedCapability }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-baseline gap-2 text-base">
          {seed.metadata.name || seed.metadata.id}
          <span className="font-mono text-xs font-normal text-muted-foreground">{seed.metadata.id}</span>
        </CardTitle>
        {seed.metadata.description && <CardDescription>{seed.metadata.description}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="mb-1 text-xs text-muted-foreground">Operations</p>
          {seed.operations.length === 0 ? (
            <p className="text-sm text-muted-foreground">None published.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Operation</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Idempotent</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {seed.operations.map((op) => (
                  <TableRow key={op.name}>
                    <TableCell className="font-mono text-xs">{op.name}</TableCell>
                    <TableCell className="whitespace-normal">{op.description}</TableCell>
                    <TableCell>{op.idempotent ? "yes" : "no"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
        <div>
          <p className="mb-1 text-xs text-muted-foreground">Command templates</p>
          {seed.command_catalog.length === 0 ? (
            <p className="text-sm text-muted-foreground">None published.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Template</TableHead>
                  <TableHead>Operation</TableHead>
                  <TableHead>Arguments</TableHead>
                  <TableHead>Description</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {seed.command_catalog.map((tpl) => (
                  <TableRow key={tpl.id || tpl.operation}>
                    <TableCell>
                      {tpl.label}
                      <span className="block font-mono text-xs text-muted-foreground">{tpl.id}</span>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{tpl.operation}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {tpl.args.length === 0
                          ? "none"
                          : tpl.args.map((arg) => (
                              <Badge
                                key={arg.key}
                                variant={arg.required ? "secondary" : "outline"}
                                className="font-mono font-normal"
                                title={`${arg.prompt}${arg.required ? " (required)" : " (optional)"}`}
                              >
                                {arg.key}
                                {!arg.required && "?"}
                              </Badge>
                            ))}
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-normal">{tpl.description}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function GhostCatalog({ catalog }: { catalog: GhostSeedCatalog }) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-mono text-lg font-semibold">{catalog.ghost_id}</h2>
          <ConnectedBadge connected={catalog.connected} />
          <span className="font-mono text-xs text-muted-foreground">{catalog.admin_addr}</span>
        </div>
        {catalog.connected && !catalog.error && <RunCommandButton ghostId={catalog.ghost_id} variant="outline" />}
      </div>
      {catalog.error ? (
        <div role="alert" className="rounded-md border border-destructive/50 bg-destructive/5 p-3 text-sm">
          <p className="font-medium text-destructive">Mirage could not read this Ghost&apos;s Seed catalog</p>
          <p className="mt-1 font-mono text-xs break-words">{catalog.error}</p>
        </div>
      ) : catalog.seed_catalog.length === 0 ? (
        <p className="text-sm text-muted-foreground">This Ghost publishes no Seeds.</p>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {catalog.seed_catalog.map((seed) => (
            <SeedCard key={seed.metadata.id} seed={seed} />
          ))}
        </div>
      )}
    </section>
  );
}

export default function EdgectlSeedsPage() {
  const { catalogs, hasData, isLoading, isError } = useSeeds();

  return (
    <div className="space-y-6">
      <PageHeader title="Seeds" description="What each Ghost can do: its Seeds, their operations and command templates" />
      {!hasData ? (
        isLoading ? (
          <LoadingState />
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {isError ? "Could not read the Seed catalog from Mirage." : "No Seeds."}
          </p>
        )
      ) : catalogs.length === 0 ? (
        <EmptyState icon={Sprout} title="No Seeds" description="Seeds appear here once a Ghost is registered with Mirage." />
      ) : (
        catalogs.map((catalog) => <GhostCatalog key={catalog.ghost_id} catalog={catalog} />)
      )}
    </div>
  );
}
