"use client";

import { useState } from "react";
import Link from "next/link";
import { useSWRConfig } from "swr";
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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { CommandOutput } from "@/components/edgectl/command-output";
import { StateBadge } from "@/components/edgectl/state-badge";
import { reconcileIntent, submitIssue } from "@/hooks/edgectl/use-intents";
import { isEdgectlKey } from "@/hooks/edgectl/use-mirage";
import { useSeeds } from "@/hooks/edgectl/use-seeds";
import { buildIssue, reconcileUntilSettled, runnableCommands, type SettleResult } from "@/lib/edgectl/issue";
import { intentHref } from "@/lib/edgectl/paths";

const MAX_RECONCILE_CALLS = 10;
const RECONCILE_WAIT_MS = 500;

const messageOf = (error: unknown, fallback: string) => (error instanceof Error && error.message ? error.message : fallback);

interface Outcome {
  intentId: string;
  ghostId: string;
  title: string;
  /** Set when the issue was submitted but following it failed */
  error?: string;
  result?: SettleResult;
}

function Result({ outcome, onAgain, onClose }: { outcome: Outcome; onAgain: () => void; onClose: () => void }) {
  const report = outcome.result?.report;
  return (
    <div className="space-y-4">
      <div className="space-y-1 text-sm">
        <p>
          <span className="font-mono">{outcome.title}</span> on <span className="font-mono">{outcome.ghostId}</span>
        </p>
        {report && (
          <div className="flex flex-wrap items-center gap-2">
            <StateBadge state={report.completion_state} />
            {report.outcome && <StateBadge state={report.outcome} />}
            <span className="text-muted-foreground">{report.summary}</span>
          </div>
        )}
      </div>

      {outcome.error && (
        <div role="alert" className="rounded-md border border-destructive/50 bg-destructive/5 p-3 text-sm">
          <p className="font-medium text-destructive">The issue was submitted, but reconcile failed</p>
          <p className="mt-1 font-mono text-xs break-words">{outcome.error}</p>
        </div>
      )}
      {outcome.result && !outcome.result.settled && (
        <p className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
          Still in progress after {outcome.result.calls} reconcile calls. Open the intent to follow it.
        </p>
      )}
      {report?.command_id && outcome.result?.settled && <CommandOutput commandId={report.command_id} />}

      <DialogFooter className="items-center sm:justify-between">
        <Link href={intentHref(outcome.intentId)} onClick={onClose} className="font-mono text-xs hover:underline">
          {outcome.intentId}
        </Link>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={onAgain}>
            Run another
          </Button>
          <Button type="button" onClick={onClose}>
            Done
          </Button>
        </div>
      </DialogFooter>
    </div>
  );
}

function RunCommandForm({ defaultGhostId, onClose }: { defaultGhostId?: string; onClose: () => void }) {
  const { mutate } = useSWRConfig();
  const { catalogs, hasData, isLoading } = useSeeds();
  const [chosenGhost, setChosenGhost] = useState(defaultGhostId ?? "");
  const [commandId, setCommandId] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  const [failure, setFailure] = useState("");
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const usable = catalogs.filter((c) => c.connected && !c.error);
  const catalog = usable.find((c) => c.ghost_id === chosenGhost) ?? usable[0];
  const ghostId = catalog?.ghost_id ?? "";
  const commands = catalog ? runnableCommands(catalog) : [];
  const command = commands.find((c) => c.id === commandId);
  const seedIds = [...new Set(commands.map((c) => c.seedId))];

  function reset() {
    setOutcome(null);
    setFailure("");
    setErrors({});
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !command) return;
    const built = buildIssue({ ghostId, command, values });
    if (!built.ok) {
      setErrors(built.errors);
      return;
    }
    setErrors({});
    setFailure("");
    const { issue } = built;
    const title = `${command.seedSelector} ${command.operation}`;

    setBusy("Submitting the issue");
    try {
      await submitIssue(issue);
    } catch (error) {
      setFailure(messageOf(error, "Mirage did not accept the issue"));
      setBusy("");
      return;
    }

    setBusy("Reconciling");
    try {
      const result = await reconcileUntilSettled(() => reconcileIntent(issue.intent_id), {
        max: MAX_RECONCILE_CALLS,
        wait: () => new Promise((resolve) => setTimeout(resolve, RECONCILE_WAIT_MS)),
      });
      setOutcome({ intentId: issue.intent_id, ghostId, title, result });
    } catch (error) {
      setOutcome({ intentId: issue.intent_id, ghostId, title, error: messageOf(error, "Reconcile failed") });
    } finally {
      setBusy("");
      mutate(isEdgectlKey);
    }
  }

  if (outcome) return <Result outcome={outcome} onAgain={reset} onClose={onClose} />;

  if (!hasData) {
    return isLoading ? (
      <Skeleton className="h-40 w-full" />
    ) : (
      <p className="text-sm text-muted-foreground">Could not read the Seed catalog from Mirage.</p>
    );
  }
  if (usable.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No connected Ghost publishes commands. Add or attach a Ghost first.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="run-ghost">Ghost</Label>
        <Select
          value={ghostId}
          onValueChange={(value) => {
            setChosenGhost(value);
            setCommandId("");
            setValues({});
            setErrors({});
          }}
        >
          <SelectTrigger id="run-ghost" className="w-full">
            <SelectValue placeholder="Choose a Ghost" />
          </SelectTrigger>
          <SelectContent>
            {usable.map((c) => (
              <SelectItem key={c.ghost_id} value={c.ghost_id}>
                {c.ghost_id}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="run-command">Command</Label>
        <Select
          value={commandId}
          onValueChange={(value) => {
            setCommandId(value);
            setValues({});
            setErrors({});
          }}
        >
          <SelectTrigger id="run-command" className="w-full">
            <SelectValue placeholder="Choose a command" />
          </SelectTrigger>
          <SelectContent>
            {seedIds.map((seedId) => (
              <SelectGroup key={seedId}>
                <SelectLabel>{seedId}</SelectLabel>
                {commands
                  .filter((c) => c.seedId === seedId)
                  .map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.label}
                    </SelectItem>
                  ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
        {command && (
          <p className="text-xs text-muted-foreground">
            <span className="font-mono">
              {command.seedSelector} {command.operation}
            </span>
            {command.description && ` · ${command.description}`}
          </p>
        )}
      </div>

      {command?.args.map((arg) => {
        const id = `run-arg-${arg.key}`;
        const shared = {
          id,
          value: values[arg.key] ?? "",
          placeholder: arg.default_value || undefined,
          "aria-invalid": !!errors[arg.key],
          onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
            setValues((v) => ({ ...v, [arg.key]: e.target.value })),
        };
        return (
          <div key={arg.key} className="space-y-2">
            <Label htmlFor={id}>
              <span className="font-mono">{arg.key}</span>
              {!arg.required && <span className="font-normal text-muted-foreground">optional</span>}
            </Label>
            {arg.multiline ? <Textarea rows={5} {...shared} /> : <Input {...shared} />}
            {errors[arg.key] ? (
              <p className="text-xs text-destructive">{errors[arg.key]}</p>
            ) : (
              arg.prompt && arg.prompt !== arg.key && <p className="text-xs text-muted-foreground">{arg.prompt}</p>
            )}
          </div>
        );
      })}

      {failure && (
        <div role="alert" className="rounded-md border border-destructive/50 bg-destructive/5 p-3 text-sm">
          <p className="font-medium text-destructive">Mirage refused the issue</p>
          <p className="mt-1 font-mono text-xs break-words">{failure}</p>
        </div>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={!!busy || !command}>
          {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {busy || "Run"}
        </Button>
      </DialogFooter>
    </form>
  );
}

/**
 * Builds an `issue` with one command from a Ghost's Seed catalog, submits it, reconciles until
 * its `report` is no longer in progress, and shows the command's output.
 */
export function RunCommandDialog({
  open,
  onOpenChange,
  defaultGhostId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultGhostId?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Run a command</DialogTitle>
          <DialogDescription>
            Submits an issue with one command to Mirage, which dispatches it to the Ghost.
          </DialogDescription>
        </DialogHeader>
        <RunCommandForm defaultGhostId={defaultGhostId} onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

/** A "Run a command" button with its dialog */
export function RunCommandButton({ ghostId, variant }: { ghostId?: string; variant?: "default" | "outline" | "ghost" }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} size={ghostId ? "sm" : "default"} onClick={() => setOpen(true)}>
        Run a command
      </Button>
      <RunCommandDialog open={open} onOpenChange={setOpen} defaultGhostId={ghostId} />
    </>
  );
}
