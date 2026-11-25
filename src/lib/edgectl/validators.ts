// Zod schemas for Mirage's api/v1 shapes (src/types/edgectl/api.ts) and for the request bodies
// the GUI sends. Pure: importable from the browser and from the server.

import { z } from "zod";
import type {
  ActivityRecord,
  AttachRequest,
  DependencyProposal,
  DeployRequest,
  DeployResult,
  Execution,
  Ghost,
  GhostRouteRef,
  GhostSeedCatalog,
  InstallStep,
  IntentRef,
  IntentSnapshot,
  Issue,
  MirageStatus,
  Report,
  SpawnRequest,
  SpawnResult,
} from "@/types/edgectl/api";

// Go encodes a nil slice or map as null: read those as empty.
const list = <T extends z.ZodType>(item: T) =>
  z
    .array(item)
    .nullish()
    .transform((v) => v ?? []);
const args = z
  .record(z.string(), z.string())
  .nullish()
  .transform((v) => v ?? {});
const text = z.string().default("");
const int = z.number().int().default(0);
const flag = z.boolean().default(false);

/**
 * An id that is placed in a Mirage URL path. edgectl ids are dotted names such as
 * "intent.gui.1" or "cmd.intent.gui.1.1"; anything that could change the path is refused.
 */
export const pathId = z
  .string()
  .min(1)
  .max(256)
  .regex(/^[^\s/\\?#\u0000-\u001f\u007f]+$/, "Not a valid id")
  .refine((v) => v !== "." && v !== "..", "Not a valid id");

const name = (label: string) => z.string().trim().min(1, `${label} is required`).max(256);

const issueCommandSchema = z.object({
  ghost_id: name("Ghost"),
  seed_selector: name("Seed"),
  operation: name("Operation"),
  args,
  blocking: flag,
});

const issueStageSchema = z.object({
  id: text,
  barrier: flag,
  commands: list(issueCommandSchema),
});

/** An `issue`, as submitted to Mirage and as returned inside an intent snapshot */
export const issueSchema: z.ZodType<Issue> = z.object({
  intent_id: pathId,
  actor: z.string().optional(),
  target_scope: name("Target scope"),
  objective: name("Objective"),
  seed_dependencies: z.array(z.string()).nullish().transform((v) => v ?? undefined),
  stages: z.array(issueStageSchema).min(1, "An issue needs at least one stage"),
});

export const reportSchema: z.ZodType<Report> = z.object({
  intent_id: text,
  phase: text,
  summary: text,
  completion_state: text,
  command_id: z.string().optional(),
  execution_id: z.string().optional(),
  event_id: z.string().optional(),
  outcome: z.string().optional(),
  timestamp_ms: int,
});

export const reportsSchema = z.object({ reports: list(reportSchema) });

export const statusSchema: z.ZodType<MirageStatus> = z.object({
  mirage_id: text,
  phase: text,
  registered_ghosts: int,
  active_intents: int,
  report_count: int,
});

export const intentRefSchema: z.ZodType<IntentRef> = z.object({ intent_id: z.string() });

export const intentIdsSchema = z.object({ intent_ids: list(z.string()) });

const intentCommandSchema = issueCommandSchema.extend({
  ghost_id: text,
  seed_selector: text,
  operation: text,
  command_id: text,
  state: text,
  attempts: int,
  last_error: text,
  updated_at_ms: int,
});

export const intentSnapshotSchema: z.ZodType<IntentSnapshot> = z.object({
  intent_id: z.string(),
  // Read back leniently: Mirage already accepted this issue.
  issue: z.object({
    intent_id: text,
    actor: z.string().optional(),
    target_scope: text,
    objective: text,
    seed_dependencies: z.array(z.string()).nullish().transform((v) => v ?? undefined),
    stages: list(
      z.object({
        id: text,
        barrier: flag,
        commands: list(issueCommandSchema.extend({ ghost_id: text, seed_selector: text, operation: text })),
      }),
    ),
  }),
  received_at_ms: int,
  commands: list(intentCommandSchema),
  reports: list(reportSchema),
  has_observed: flag,
  pending_count: int,
});

const seedMetadataSchema = z.object({ id: text, name: text, description: text });

const ghostSchema: z.ZodType<Ghost> = z.object({
  ghost_id: z.string(),
  remote_addr: text,
  seed_list: list(seedMetadataSchema),
  registered_at_ms: int,
  last_event_at_ms: int,
  event_count: int,
  connected: flag,
});

export const ghostsSchema = z.object({ ghosts: list(ghostSchema) });

const commandTemplateSchema = z.object({
  id: text,
  label: text,
  description: text,
  seed_selector: text,
  operation: text,
  default_blocking: flag,
  args: list(
    z.object({
      key: z.string(),
      prompt: text,
      required: flag,
      default_value: text,
      multiline: flag,
      terminator: text,
    }),
  ),
});

const ghostSeedCatalogSchema: z.ZodType<GhostSeedCatalog> = z.object({
  ghost_id: z.string(),
  admin_addr: text,
  connected: flag,
  error: text,
  seed_catalog: list(
    z.object({
      metadata: seedMetadataSchema,
      operations: list(z.object({ name: text, description: text, idempotent: flag })),
      command_catalog: list(commandTemplateSchema),
    }),
  ),
});

export const ghostSeedCatalogsSchema = z.object({ ghosts: list(ghostSeedCatalogSchema) });

export const attachRequestSchema: z.ZodType<AttachRequest> = z.object({
  ghost_admin_addr: name("Ghost admin address"),
});

export const ghostRouteRefSchema: z.ZodType<GhostRouteRef> = z.object({ ghost_id: text, admin_addr: text });

export const spawnRequestSchema: z.ZodType<SpawnRequest> = z.object({
  target_name: name("Name"),
  admin_addr: name("Admin address"),
});

export const spawnResultSchema: z.ZodType<SpawnResult> = z.object({
  target_name: text,
  ghost_id: text,
  admin_addr: text,
});

export const executionSchema: z.ZodType<Execution> = z.object({
  command_id: text,
  execution_id: text,
  intent_id: text,
  ghost_id: text,
  seed_selector: text,
  operation: text,
  args,
  phase: text,
  outcome: text,
  completed_at_ms: int,
  seed_result: z
    .object({
      seed_id: text,
      status: text,
      exit_code: int,
      stdout: text,
      stderr: text,
      output_encoding: z.string().default("utf8"),
    })
    .nullish()
    .transform(
      (v) => v ?? { seed_id: "", status: "", exit_code: 0, stdout: "", stderr: "", output_encoding: "utf8" },
    ),
});

/** `limit` of GET /api/edgectl/reports: absent, or a positive integer */
export const reportLimitSchema = z.coerce.number().int().min(1).max(1000);

// Shapes added by the 2026-11-25 operator parity amendment.

export const routesSchema = z.object({
  routes: list(z.object({ ghost_id: text, admin_addr: text, connected: flag })),
});

export const servicesSchema = z.object({
  services: list(z.object({ seed_id: text, ghost_ids: list(z.string()) })),
});

export const deployTargetsSchema = z.object({
  targets: list(z.object({ ghost_id: text, host: text, admin_addr: text })),
});

export const deployRequestSchema: z.ZodType<DeployRequest> = z.strictObject({
  ghost_id: pathId,
  force_redeploy: z.boolean().optional(),
});

export const deployResultSchema: z.ZodType<DeployResult> = z.object({
  ghost_id: text,
  host: text,
  admin_addr: text,
  status: text,
  message: text,
});

export const installStepSchema: z.ZodType<InstallStep> = z.object({
  seed_id: text,
  method: text,
  repo_url: text,
  ref: text,
  url: text,
  version: text,
  sha256: text,
  destination: text,
  package: text,
  tap: text,
  binary: text,
});

/**
 * A proposal for display. The signed intent and approval are dropped (only proposed_at_ms is kept
 * from the intent); what goes to the signing tool is Mirage's own data, never this copy.
 */
export const dependencyProposalSchema: z.ZodType<DependencyProposal> = z
  .object({
    id: text,
    ghost_id: text,
    seed_ids: list(z.string()),
    steps: list(installStepSchema),
    unresolved: list(z.string()),
    state: text,
    proposed_by: text,
    intent: z
      .object({ intent: z.object({ proposed_at_ms: int }).nullish() })
      .nullish(),
    approved_by: text,
    executed_by: text,
    execution: z
      .object({
        succeeded: flag,
        steps: list(z.object({ seed_id: text, method: text, status: text, error: text })),
        rollback: list(z.object({ seed_id: text, method: text, rolled_back: flag, error: text })),
        error: text,
      })
      .nullish()
      .transform((v) => v ?? null),
    audit: list(z.object({ kind: text, actor: text, state: text, detail: text, at_ms: int })),
  })
  .transform(({ intent, ...rest }) => ({ ...rest, proposed_at_ms: intent?.intent?.proposed_at_ms ?? 0 }));

export const dependencyProposalsSchema = z.object({ proposals: list(dependencyProposalSchema) });

export const ghostStatusSchema = z.object({ ghost_id: text, phase: text, seed_count: int });

export const ghostEventsSchema = z.object({
  events: list(
    z.object({
      event_id: text,
      command_id: text,
      intent_id: text,
      ghost_id: text,
      seed_id: text,
      outcome: text,
      timestamp_ms: int,
    }),
  ),
});

export const ghostVerificationSchema = z.object({
  records: list(
    z.object({
      request_id: text,
      trace_id: text,
      command_message_id: int,
      command_message_type: int,
      event_message_type: int,
      command_id: text,
      execution_id: text,
      event_id: text,
      ghost_id: text,
      seed_id: text,
      operation: text,
      outcome: text,
      seed_status: text,
      exit_code: int,
      timestamp_ms: int,
      status: text,
    }),
  ),
});

const activityRecordSchema: z.ZodType<ActivityRecord> = z.object({
  kind: text,
  timestamp_ms: int,
  fields: args,
});

export const activitySchema = z.object({ records: list(activityRecordSchema) });

export const activityKindSchema = z.enum(["audit", "custody"]);

// Values that reach an `edgecert` command line. edgecert's own rule for a principal id is
// [a-z0-9][a-z0-9._-]{0,62}; these are checked here first so nothing else is ever passed on.

/** A principal id: a Ghost id, or the id a certificate is issued for */
export const principalId = z
  .string()
  .regex(/^[a-z0-9][a-z0-9._-]{0,62}$/, "Use lowercase letters, digits, dot, dash or underscore (at most 63 characters)");

/** The name of a Ghost to add: lowercase letters, digits, dot and dash */
export const targetName = z
  .string()
  .regex(/^[a-z0-9][a-z0-9.-]{0,39}$/, "Use lowercase letters, digits, dot or dash, starting with a letter or digit");

/** An admin address the new Ghost listens on: host:port, nothing else */
export const adminAddr = z
  .string()
  .trim()
  .max(255)
  .regex(/^(\[[0-9a-fA-F:]+\]|[A-Za-z0-9.-]+):\d{1,5}$/, "Use host:port, for example 127.0.0.1:7031");

/** Body of POST /api/edgectl/ghosts/spawn-local; unknown fields are refused, as Mirage refuses them */
export const addGhostSchema: z.ZodType<SpawnRequest> = z.strictObject({
  target_name: targetName,
  admin_addr: adminAddr,
});

const seedId = z.string().regex(/^[a-z0-9][a-z0-9._-]{0,62}$/, "Not a Seed id");

/** Body of the intent preview and of propose: which Seeds' dependencies to install on which Ghost */
export const proposeSchema = z.strictObject({
  ghost_id: principalId,
  seed_ids: z.array(seedId).min(1, "Choose at least one Seed").max(32),
});

/** sha256 in hex, as edgecert prints a digest */
export const digestSchema = z.string().regex(/^[0-9a-f]{64}$/, "Not a digest");

export const approveSchema = z.strictObject({ digest: digestSchema });

/** Execute must repeat the proposal id it is for */
export const executeSchema = z.strictObject({ confirm: pathId });
