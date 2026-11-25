"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { StateBadge } from "@/components/edgectl/state-badge";
import { useExecution } from "@/hooks/edgectl/use-execution";
import { RequestError } from "@/lib/data/request-error";
import { formatTime } from "@/lib/edgectl/format";
import { formatBytes, outputView } from "@/lib/edgectl/output";
import type { Execution } from "@/types/edgectl/api";

function Stream({ label, text }: { label: string; text: string }) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <pre className="max-h-80 overflow-auto rounded-md border bg-muted/40 p-3 font-mono text-xs break-words whitespace-pre-wrap">
        {text}
      </pre>
    </div>
  );
}

function Binary({ label, base64, bytes }: { label: string; base64: string; bytes: number }) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">
        {label}: binary, {formatBytes(bytes)}. Not shown as text.
      </p>
      {bytes > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground">Show base64</summary>
          <pre className="mt-1 max-h-40 overflow-auto rounded-md border bg-muted/40 p-3 font-mono break-all whitespace-pre-wrap">
            {base64}
          </pre>
        </details>
      )}
    </div>
  );
}

/** The seed_result of one execution: status line, then stdout and stderr */
export function ExecutionOutput({ execution }: { execution: Execution }) {
  const result = execution.seed_result;
  const view = outputView(result);
  return (
    <div className="space-y-3" data-testid="execution-output">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <StateBadge state={result.status || execution.outcome} empty="no status" />
        <span>exit code {result.exit_code}</span>
        {execution.phase && <span>phase {execution.phase}</span>}
        {execution.completed_at_ms > 0 && <span>completed {formatTime(execution.completed_at_ms)}</span>}
      </div>
      {view.kind === "text" ? (
        <>
          {view.stdout === "" && view.stderr === "" && <p className="text-sm text-muted-foreground">No output.</p>}
          {view.stdout !== "" && <Stream label="stdout" text={view.stdout} />}
          {view.stderr !== "" && <Stream label="stderr" text={view.stderr} />}
        </>
      ) : (
        <>
          <Binary label="stdout" base64={view.stdout} bytes={view.stdoutBytes} />
          <Binary label="stderr" base64={view.stderr} bytes={view.stderrBytes} />
        </>
      )}
    </div>
  );
}

/** Output of a command, read through Mirage. Pass "" for a command that has not run. */
export function CommandOutput({ commandId }: { commandId: string }) {
  const { execution, isLoading, error } = useExecution(commandId);
  if (!commandId) return <p className="text-sm text-muted-foreground">Not run yet.</p>;
  if (isLoading) return <Skeleton className="h-20 w-full" />;
  if (!execution) {
    const missing = error instanceof RequestError && error.status === 404;
    return (
      <p className="text-sm text-muted-foreground">
        {missing ? "The Ghost holds no execution record for this command." : "Could not read this command's output."}
      </p>
    );
  }
  return <ExecutionOutput execution={execution} />;
}
