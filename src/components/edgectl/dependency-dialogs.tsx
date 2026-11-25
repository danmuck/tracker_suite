"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MirageRefusal, NotConfigured, messageOf } from "@/components/edgectl/refusal";
import { StepsTable } from "@/components/edgectl/steps-table";
import { useCapabilities } from "@/hooks/edgectl/use-capabilities";
import { useGhosts } from "@/hooks/edgectl/use-ghosts";
import { isEdgectlKey } from "@/hooks/edgectl/use-mirage";
import {
  approveProposal,
  executeProposal,
  prepareApproval,
  previewIntent,
  proposeDependencies,
} from "@/hooks/edgectl/use-proposals";
import { formatTime } from "@/lib/edgectl/format";
import { proposalHref } from "@/lib/edgectl/paths";
import type { DependencyProposal, IntentPreview, PreparedApproval } from "@/types/edgectl/api";

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** "seed.docker, seed.mongod" -> ["seed.docker", "seed.mongod"] */
const splitSeeds = (value: string) => [...new Set(value.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean))];

function ProposeForm({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  const { mutate } = useSWRConfig();
  const { ghosts } = useGhosts();
  const { capabilities } = useCapabilities();
  const [ghostId, setGhostId] = useState("");
  const [seeds, setSeeds] = useState("");
  const [preview, setPreview] = useState<IntentPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState("");

  const chosenGhost = ghostId || ghosts[0]?.ghost_id || "";
  const seedIds = splitSeeds(seeds);
  const propose = capabilities?.propose;

  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setRefusal("");
    try {
      await action();
    } catch (error) {
      setRefusal(messageOf(error, "Request failed"));
    } finally {
      setBusy(false);
    }
  }

  const handleReview = (e: React.FormEvent) => {
    e.preventDefault();
    return run(async () => setPreview(await previewIntent({ ghost_id: chosenGhost, seed_ids: seedIds })));
  };

  const handlePropose = () =>
    run(async () => {
      if (!preview) return;
      const proposal = await proposeDependencies({ ghost_id: preview.ghost_id, seed_ids: preview.seed_ids });
      toast.success(`Proposal ${proposal.id} is pending approval`);
      mutate(isEdgectlKey);
      onDone();
      router.push(proposalHref(proposal.id));
    });

  if (propose && !propose.enabled) {
    return (
      <div className="space-y-4">
        <NotConfigured message={propose.message} />
        <DialogFooter>
          <Button variant="outline" onClick={onDone}>
            Close
          </Button>
        </DialogFooter>
      </div>
    );
  }

  if (preview) {
    return (
      <div className="space-y-4">
        <p className="text-sm">
          On <span className="font-mono font-medium">{preview.ghost_id}</span>, for{" "}
          <span className="font-mono">{preview.seed_ids.join(", ")}</span>:
        </p>
        <StepsTable steps={preview.steps} />
        {preview.steps.length === 0 && (
          <p className="text-xs text-muted-foreground">
            Mirage&apos;s dependency catalog has no install source for these Seeds, so Mirage will refuse this proposal.
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Proposing signs this request as the operator and records it in Mirage as pending. Nothing is installed until
          a second operator approves it and it is executed.
        </p>
        {refusal && <MirageRefusal message={refusal} />}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setPreview(null)} disabled={busy}>
            Back
          </Button>
          <Button onClick={handlePropose} disabled={busy}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Sign and propose
          </Button>
        </DialogFooter>
      </div>
    );
  }

  return (
    <form onSubmit={handleReview} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="proposal-ghost">Ghost</Label>
        <select
          id="proposal-ghost"
          value={chosenGhost}
          onChange={(e) => setGhostId(e.target.value)}
          className="h-9 w-full rounded-md border bg-transparent px-3 font-mono text-sm"
          required
        >
          {ghosts.length === 0 && <option value="">No Ghosts</option>}
          {ghosts.map((ghost) => (
            <option key={ghost.ghost_id} value={ghost.ghost_id}>
              {ghost.ghost_id}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="proposal-seeds">Seeds</Label>
        <Input
          id="proposal-seeds"
          value={seeds}
          onChange={(e) => setSeeds(e.target.value)}
          placeholder="seed.docker, seed.mongod"
          className="font-mono"
          required
        />
        <p className="text-xs text-muted-foreground">
          Seed ids, separated by commas. Mirage installs what its dependency catalog lists for them.
        </p>
      </div>
      {refusal && <MirageRefusal message={refusal} />}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy || !chosenGhost || seedIds.length === 0}>
          {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Review steps
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Proposes installing the dependencies of some Seeds on a Ghost: review the steps, then sign as the operator */
export function ProposeDialog({ open, onOpenChange }: DialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Propose dependencies</DialogTitle>
          <DialogDescription>Ask for a Seed&apos;s dependencies to be installed on a Ghost&apos;s host.</DialogDescription>
        </DialogHeader>
        {open && <ProposeForm onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function ApproveBody({ proposalId, onDone }: { proposalId: string; onDone: () => void }) {
  const { mutate } = useSWRConfig();
  const { capabilities } = useCapabilities();
  const [prepared, setPrepared] = useState<PreparedApproval | null>(null);
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState("");
  const approve = capabilities?.approve;

  async function handlePrepare() {
    if (busy) return;
    setBusy(true);
    setRefusal("");
    try {
      setPrepared(await prepareApproval(proposalId));
      setChecked(false);
    } catch (error) {
      setRefusal(messageOf(error, "Could not prepare the approval"));
    } finally {
      setBusy(false);
    }
  }

  async function handleApprove() {
    if (busy || !prepared || !checked) return;
    setBusy(true);
    setRefusal("");
    try {
      // One call per confirmation; the server hands the prepared payload out once.
      await approveProposal(proposalId, prepared.digest);
      toast.success(`Proposal ${proposalId} approved`);
      mutate(isEdgectlKey);
      onDone();
    } catch (error) {
      setRefusal(messageOf(error, "Could not approve the proposal"));
      setPrepared(null);
    } finally {
      setBusy(false);
    }
  }

  if (approve && !approve.enabled) {
    return (
      <div className="space-y-4">
        <NotConfigured message={approve.message} />
        <DialogFooter>
          <Button variant="outline" onClick={onDone}>
            Close
          </Button>
        </DialogFooter>
      </div>
    );
  }

  if (!prepared) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Approving is done as the second operator. First the proposal is checked and the approval is built; you then
          see exactly what would be signed, and its digest, before anything is signed.
        </p>
        {refusal && <MirageRefusal message={refusal} />}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onDone} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={handlePrepare} disabled={busy}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Review approval
          </Button>
        </DialogFooter>
      </div>
    );
  }

  const { proposal } = prepared;
  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted-foreground">Proposal</dt>
        <dd className="font-mono">{proposal.id}</dd>
        <dt className="text-muted-foreground">Ghost</dt>
        <dd className="font-mono">{proposal.ghost_id}</dd>
        <dt className="text-muted-foreground">Seeds</dt>
        <dd className="font-mono">{proposal.seed_ids.join(", ")}</dd>
        <dt className="text-muted-foreground">Proposed by</dt>
        <dd className="font-mono break-all">{prepared.proposer}</dd>
        <dt className="text-muted-foreground">Approving as</dt>
        <dd className="font-mono break-all">{prepared.approver}</dd>
        <dt className="text-muted-foreground">Valid until</dt>
        <dd className="tabular-nums">{formatTime(prepared.expires_at_ms)}</dd>
      </dl>
      <StepsTable steps={proposal.steps} />
      <div className="rounded-md border p-3">
        <p className="text-xs text-muted-foreground">Payload digest (sha256)</p>
        <p className="mt-1 font-mono text-sm break-all" data-testid="approval-digest">
          {prepared.digest}
        </p>
      </div>
      <div className="flex items-start gap-2">
        <Checkbox id="approve-confirm" checked={checked} onCheckedChange={(value) => setChecked(value === true)} />
        <Label htmlFor="approve-confirm" className="leading-snug font-normal">
          <span>
            I have checked these steps and this digest, and I approve installing them on{" "}
            <span className="font-mono">{proposal.ghost_id}</span>.
          </span>
        </Label>
      </div>
      {refusal && <MirageRefusal message={refusal} />}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone} disabled={busy}>
          Cancel
        </Button>
        <Button onClick={handleApprove} disabled={busy || !checked}>
          {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Sign and approve
        </Button>
      </DialogFooter>
    </div>
  );
}

/** Approves a pending proposal as the second operator, after showing its content and payload digest */
export function ApproveDialog({ proposalId, open, onOpenChange }: DialogProps & { proposalId: string }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Approve proposal</DialogTitle>
          <DialogDescription>Signed by the second operator. Approving installs nothing yet.</DialogDescription>
        </DialogHeader>
        {open && <ApproveBody proposalId={proposalId} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function ExecuteBody({ proposal, onDone }: { proposal: DependencyProposal; onDone: () => void }) {
  const { mutate } = useSWRConfig();
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState("");

  async function handleExecute() {
    if (busy || !checked) return;
    setBusy(true);
    setRefusal("");
    try {
      // Installs software: one call per confirmation, never retried.
      const result = await executeProposal(proposal.id);
      if (result.state === "succeeded") toast.success(`Proposal ${proposal.id}: installed`);
      else toast.error(`Proposal ${proposal.id}: ${result.state}`);
      mutate(isEdgectlKey);
      onDone();
    } catch (error) {
      setRefusal(messageOf(error, "Could not execute the proposal"));
      mutate(isEdgectlKey);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div role="alert" className="rounded-md border border-amber-600/50 bg-amber-500/5 p-3 text-sm">
        <p className="font-medium">This installs software on the machine that runs {proposal.ghost_id}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          The Ghost runs the steps below on its host (for example a Homebrew install). It can take several minutes and
          is not undone by closing this window. Steps installed under the Ghost&apos;s own folders are rolled back if a
          later step fails; a Homebrew install is not.
        </p>
      </div>
      <StepsTable steps={proposal.steps} />
      <div className="flex items-start gap-2">
        <Checkbox id="execute-confirm" checked={checked} onCheckedChange={(value) => setChecked(value === true)} />
        <Label htmlFor="execute-confirm" className="leading-snug font-normal">
          <span>
            Install these now on <span className="font-mono">{proposal.ghost_id}</span>.
          </span>
        </Label>
      </div>
      {refusal && <MirageRefusal message={refusal} title="Execute failed" />}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone} disabled={busy}>
          Cancel
        </Button>
        <Button variant="destructive" onClick={handleExecute} disabled={busy || !checked}>
          {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {busy ? "Installing…" : "Install"}
        </Button>
      </DialogFooter>
    </div>
  );
}

/** Executes an approved proposal, behind its own confirmation */
export function ExecuteDialog({ proposal, open, onOpenChange }: DialogProps & { proposal: DependencyProposal }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Execute proposal {proposal.id}</DialogTitle>
          <DialogDescription>Mirage sends the approved plan to the Ghost, which installs it.</DialogDescription>
        </DialogHeader>
        {open && <ExecuteBody proposal={proposal} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}
