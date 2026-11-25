// Zod schemas for Mirage's api/v1 shapes (src/types/edgectl/api.ts) and for the request bodies
// the GUI sends. Pure: importable from the browser and from the server.

import { z } from "zod";
import type {
  AttachRequest,
  Execution,
  Ghost,
  GhostRouteRef,
  GhostSeedCatalog,
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
