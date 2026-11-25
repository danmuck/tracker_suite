import { Badge } from "@/components/ui/badge";
import { stateTone, type Tone } from "@/lib/edgectl/format";
import { cn } from "@/lib/utils";

const toneClass: Record<Tone, string> = {
  good: "border-emerald-600/40 text-emerald-700 dark:text-emerald-400",
  bad: "border-destructive/50 text-destructive",
  busy: "border-amber-600/40 text-amber-700 dark:text-amber-400",
  idle: "text-muted-foreground",
};

/** A Mirage state word (completion_state, outcome, command state, phase) as it is, colored by meaning */
export function StateBadge({ state, empty = "not started" }: { state: string; empty?: string }) {
  return (
    <Badge variant="outline" className={cn("font-mono font-normal", toneClass[stateTone(state)])}>
      {state || empty}
    </Badge>
  );
}

export function ConnectedBadge({ connected }: { connected: boolean }) {
  return (
    <Badge variant="outline" className={cn("font-normal", toneClass[connected ? "good" : "bad"])}>
      {connected ? "connected" : "not connected"}
    </Badge>
  );
}
