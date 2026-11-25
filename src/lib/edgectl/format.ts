import { format } from "date-fns";

/** A Mirage timestamp (Unix milliseconds) in local time; zero means not set */
export function formatTime(ms: number): string {
  if (!ms) return "—";
  return format(new Date(ms), "MMM d, HH:mm:ss");
}

/** "ghost:ghost.local" -> "ghost.local" */
export function targetLabel(targetScope: string): string {
  return targetScope.startsWith("ghost:") ? targetScope.slice("ghost:".length) : targetScope;
}

export type Tone = "good" | "bad" | "busy" | "idle";

/** Tone for a report completion_state, outcome, command state or execution phase */
export function stateTone(state: string): Tone {
  switch (state) {
    case "satisfied":
    case "success":
    case "complete":
    case "ok":
    case "succeeded":
    case "installed":
    case "allow":
    case "ready":
    case "seeded":
      return "good";
    case "failed":
    case "error":
    case "deny":
    case "rejected":
      return "bad";
    case "":
      return "idle";
    default:
      return "busy";
  }
}
