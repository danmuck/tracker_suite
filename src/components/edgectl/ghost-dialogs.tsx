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
import { attachGhost, spawnLocalGhost } from "@/hooks/edgectl/use-ghosts";
import { isEdgectlKey } from "@/hooks/edgectl/use-mirage";

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const messageOf = (error: unknown, fallback: string) => (error instanceof Error && error.message ? error.message : fallback);

/** Mirage's refusal, word for word */
function MirageRefusal({ message }: { message: string }) {
  return (
    <div role="alert" className="rounded-md border border-destructive/50 bg-destructive/5 p-3 text-sm">
      <p className="font-medium text-destructive">Mirage refused</p>
      <p className="mt-1 font-mono text-xs break-words">{message}</p>
    </div>
  );
}

function AddGhostForm({ onDone }: { onDone: () => void }) {
  const { mutate } = useSWRConfig();
  const [name, setName] = useState("");
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
        <Input id="ghost-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="ghost.two" required />
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
      <p className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
        A certificate for the new Ghost must already exist. Only edgectl operator tooling issues certificates (the lab
        menu&apos;s &quot;Add a Ghost&quot; does both steps), so without one Mirage refuses and its message is shown
        here.
      </p>
      {refusal && <MirageRefusal message={refusal} />}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy || !name.trim() || !addr.trim()}>
          {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Add Ghost
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Asks Mirage to start a new Ghost on its own machine (spawn-local) */
export function AddGhostDialog({ open, onOpenChange }: DialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a Ghost</DialogTitle>
          <DialogDescription>Mirage starts a new Ghost on its own machine and registers it.</DialogDescription>
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
