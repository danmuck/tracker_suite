"use client";

import { useState } from "react";
import { useSWRConfig } from "swr";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MirageRefusal, NotConfigured, messageOf } from "@/components/edgectl/refusal";
import { useCapabilities } from "@/hooks/edgectl/use-capabilities";
import { attachGhost, spawnLocalGhost } from "@/hooks/edgectl/use-ghosts";
import { targetName } from "@/lib/edgectl/validators";
import { isEdgectlKey } from "@/hooks/edgectl/use-mirage";

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function AddGhostForm({ onDone }: { onDone: () => void }) {
  const { mutate } = useSWRConfig();
  const [name, setName] = useState("");
  const [addr, setAddr] = useState("");
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState("");
  const { capabilities } = useCapabilities();
  const issue = capabilities?.issue;
  const nameProblem = name.trim() === "" ? "" : (targetName.safeParse(name.trim()).error?.issues[0]?.message ?? "");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || nameProblem) return;
    setBusy(true);
    setRefusal("");
    try {
      // Not idempotent in Mirage: one call per click, no retry.
      const result = await spawnLocalGhost({ target_name: name.trim(), admin_addr: addr.trim() });
      toast.success(`Ghost ${result.ghost_id || name.trim()} added`);
      mutate(isEdgectlKey);
      onDone();
    } catch (error) {
      setRefusal(messageOf(error, "Could not add the Ghost"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="ghost-name">Name</Label>
        <Input
          id="ghost-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="web1"
          aria-invalid={!!nameProblem}
          required
        />
        {nameProblem ? (
          <p className="text-xs text-destructive">{nameProblem}</p>
        ) : (
          <p className="text-xs text-muted-foreground">
            The Ghost&apos;s id is Mirage&apos;s local Ghost id, a dot, then this name (for example{" "}
            <span className="font-mono">ghost.local.{name.trim() || "web1"}</span>).
          </p>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="ghost-admin-addr">Admin address</Label>
        <Input
          id="ghost-admin-addr"
          value={addr}
          onChange={(e) => setAddr(e.target.value)}
          placeholder="127.0.0.1:7031"
          required
        />
      </div>
      {issue && !issue.enabled ? (
        <NotConfigured message={issue.message} />
      ) : (
        <p className="text-xs text-muted-foreground">
          This app&apos;s server issues the new Ghost&apos;s certificate with edgecert, then Mirage starts the Ghost on
          its own machine.
        </p>
      )}
      {refusal && <MirageRefusal message={refusal} />}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy || !name.trim() || !addr.trim() || !!nameProblem || issue?.enabled === false}>
          {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Add Ghost
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Issues a certificate for a new Ghost, then asks Mirage to start it on its own machine (spawn-local) */
export function AddGhostDialog({ open, onOpenChange }: DialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a Ghost</DialogTitle>
          <DialogDescription>A new Ghost on Mirage&apos;s own machine, under its local Ghost.</DialogDescription>
        </DialogHeader>
        <AddGhostForm onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function AttachGhostForm({ onDone }: { onDone: () => void }) {
  const { mutate } = useSWRConfig();
  const [addr, setAddr] = useState("");
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setRefusal("");
    try {
      // Not idempotent in Mirage: one call per click, no retry.
      const result = await attachGhost({ ghost_admin_addr: addr.trim() });
      toast.success(`Ghost ${result.ghost_id || addr.trim()} attached`);
      mutate(isEdgectlKey);
      onDone();
    } catch (error) {
      setRefusal(messageOf(error, "Could not attach the Ghost"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="attach-admin-addr">Ghost admin address</Label>
        <Input
          id="attach-admin-addr"
          value={addr}
          onChange={(e) => setAddr(e.target.value)}
          placeholder="127.0.0.1:7031"
          required
        />
      </div>
      {refusal && <MirageRefusal message={refusal} />}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy || !addr.trim()}>
          {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Attach
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Registers a Ghost that is already running, by its admin address */
export function AttachGhostDialog({ open, onOpenChange }: DialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Attach a Ghost</DialogTitle>
          <DialogDescription>Mirage connects to a Ghost that is already running and registers it.</DialogDescription>
        </DialogHeader>
        <AttachGhostForm onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
