"use client";

import { useState } from "react";
import { useSWRConfig } from "swr";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { MirageRefusal, messageOf } from "@/components/edgectl/refusal";
import { deployGhost, useDeployTargets } from "@/hooks/edgectl/use-deploy";
import { isEdgectlKey } from "@/hooks/edgectl/use-mirage";

function DeployForm({ onDone }: { onDone: () => void }) {
  const { mutate } = useSWRConfig();
  const { targets, hasData, isLoading, isError } = useDeployTargets(true);
  const [chosen, setChosen] = useState("");
  const [force, setForce] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState("");

  async function handleDeploy() {
    if (busy || !chosen) return;
    setBusy(true);
    setRefusal("");
    try {
      // Not idempotent in Mirage: one call per click, no retry.
      const result = await deployGhost({ ghost_id: chosen, force_redeploy: force });
      toast.success(`${result.ghost_id || chosen}: ${result.status || "deployed"}${result.message ? ` (${result.message})` : ""}`);
      mutate(isEdgectlKey);
      onDone();
    } catch (error) {
      setRefusal(messageOf(error, "Could not deploy the Ghost"));
    } finally {
      setBusy(false);
    }
  }

  if (!hasData) {
    return (
      <p className="py-4 text-sm text-muted-foreground">
        {isLoading ? "Reading deploy targets…" : isError ? "Could not read deploy targets from Mirage." : ""}
      </p>
    );
  }
  if (targets.length === 0) {
    return (
      <div className="space-y-4">
        <div className="rounded-md border bg-muted/40 p-3 text-sm">
          <p className="font-medium">No deploy targets</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Targets come from the <span className="font-mono">ghost_manifests</span> entries in Mirage&apos;s own
            configuration. This Mirage has none, which is normal for a lab. Add a manifest to Mirage&apos;s config and
            restart it to deploy a remote Ghost from here.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onDone}>
            Close
          </Button>
        </DialogFooter>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <div role="radiogroup" aria-label="Deploy target" className="space-y-2">
        {targets.map((target) => (
          <label
            key={target.ghost_id}
            className="flex cursor-pointer items-center gap-3 rounded-md border p-3 text-sm has-[:checked]:border-primary"
          >
            <input
              type="radio"
              name="deploy-target"
              value={target.ghost_id}
              checked={chosen === target.ghost_id}
              onChange={() => setChosen(target.ghost_id)}
            />
            <span className="font-mono font-medium">{target.ghost_id}</span>
            <span className="font-mono text-xs text-muted-foreground">
              {target.host} · admin {target.admin_addr || "—"}
            </span>
          </label>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <Checkbox id="force-redeploy" checked={force} onCheckedChange={(value) => setForce(value === true)} />
        <Label htmlFor="force-redeploy" className="font-normal">
          Redeploy even if this Ghost is already running
        </Label>
      </div>
      <p className="text-xs text-muted-foreground">
        Mirage copies the Ghost to the host over SSH and starts it. This can take a few minutes.
      </p>
      {refusal && <MirageRefusal message={refusal} title="Deploy failed" />}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone} disabled={busy}>
          Cancel
        </Button>
        <Button onClick={handleDeploy} disabled={busy || !chosen}>
          {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Deploy
        </Button>
      </DialogFooter>
    </div>
  );
}

/** Asks Mirage to deploy one of its configured remote Ghosts */
export function DeployGhostDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Deploy a remote Ghost</DialogTitle>
          <DialogDescription>Mirage deploys a Ghost it is configured for to that Ghost&apos;s host.</DialogDescription>
        </DialogHeader>
        {open && <DeployForm onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}
