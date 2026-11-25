// Builds an `issue` from a Ghost's Seed catalog and follows it to its final `report`. No I/O of its own.

import type { CommandArg, GhostSeedCatalog, Issue, Report } from "@/types/edgectl/api";

/** A command template with the Seed it belongs to resolved */
export interface RunnableCommand {
  id: string;
  label: string;
  description: string;
  seedId: string;
  seedName: string;
  seedSelector: string;
  operation: string;
  args: CommandArg[];
}

/** Every command a Ghost publishes, in catalog order. A template with no seed_selector uses its Seed's id. */
export function runnableCommands(catalog: GhostSeedCatalog): RunnableCommand[] {
  return catalog.seed_catalog.flatMap((seed) =>
    seed.command_catalog.map((tpl) => ({
      id: tpl.id || `${seed.metadata.id}.${tpl.operation}`,
      label: tpl.label || tpl.operation,
      description: tpl.description,
      seedId: seed.metadata.id,
      seedName: seed.metadata.name || seed.metadata.id,
      seedSelector: tpl.seed_selector || seed.metadata.id,
      operation: tpl.operation,
      args: tpl.args,
    })),
  );
}

export type BuildIssueResult = { ok: true; issue: Issue } | { ok: false; errors: Record<string, string> };

/**
 * One stage, one blocking command, as the edgectl lab menu submits it. `actor` is left out:
 * Mirage binds it to the caller's certificate. A required argument must have a value (typed or
 * default); an optional argument left empty is not sent.
 */
export function buildIssue(input: {
  ghostId: string;
  command: RunnableCommand;
  values: Record<string, string>;
  /** Time for the intent id; the current time when left out */
  now?: number;
  /** Makes the intent id unique within one millisecond; random when left out */
  suffix?: string;
}): BuildIssueResult {
  const { ghostId, command, values } = input;
  const now = input.now ?? Date.now();
  const suffix = input.suffix ?? Math.floor(Math.random() * 0x10000).toString(16).padStart(4, "0");
  const errors: Record<string, string> = {};
  const args: Record<string, string> = {};
  for (const arg of command.args) {
    const typed = values[arg.key] ?? "";
    const value = typed !== "" ? typed : arg.default_value;
    if (value === "") {
      if (arg.required) errors[arg.key] = `${arg.prompt || arg.key} is required`;
      continue;
    }
    args[arg.key] = value;
  }
  if (!ghostId) errors._ghost = "Choose a Ghost";
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    issue: {
      intent_id: `intent.gui.${now}.${suffix}`,
      target_scope: `ghost:${ghostId}`,
      objective: `${command.seedSelector} ${command.operation}`,
      stages: [
        {
          id: "stage.1",
          barrier: false,
          commands: [
            {
              ghost_id: ghostId,
              seed_selector: command.seedSelector,
              operation: command.operation,
              args,
              blocking: true,
            },
          ],
        },
      ],
    },
  };
}

export const IN_PROGRESS = "in_progress";

export const isSettled = (report: Report) => report.completion_state !== IN_PROGRESS;

export interface SettleResult {
  report: Report;
  /** Reconcile calls made */
  calls: number;
  /** False when the limit was reached with the intent still in progress */
  settled: boolean;
}

/**
 * Calls `reconcile` until the report's completion_state is no longer in_progress, at most `max`
 * times. Each reconcile call makes Mirage run one pending command. An error from `reconcile`
 * is thrown as it is: nothing is retried.
 */
export async function reconcileUntilSettled(
  reconcile: () => Promise<Report>,
  options: { max?: number; wait?: () => Promise<void> } = {},
): Promise<SettleResult> {
  const max = Math.max(1, options.max ?? 10);
  let report = await reconcile();
  let calls = 1;
  while (!isSettled(report) && calls < max) {
    await options.wait?.();
    report = await reconcile();
    calls++;
  }
  return { report, calls, settled: isSettled(report) };
}
