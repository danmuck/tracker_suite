// Shapes of Mirage's api/v1, as fixed by docs/architecture/definitions/api_v1.toml in the edgectl
// repo. Field names are snake_case on the wire and kept as they are. Times are Unix milliseconds;
// zero means not set.

export type Args = Record<string, string>;

export interface IssueCommand {
  ghost_id: string;
  seed_selector: string;
  operation: string;
  args: Args;
  blocking: boolean;
}

export interface IssueStage {
  id: string;
  barrier: boolean;
  commands: IssueCommand[];
}

export interface Issue {
  intent_id: string;
  actor?: string;
  target_scope: string;
  objective: string;
  seed_dependencies?: string[];
  stages: IssueStage[];
}

export interface Report {
  intent_id: string;
  phase: string;
  summary: string;
  completion_state: string;
  command_id?: string;
  execution_id?: string;
  event_id?: string;
  outcome?: string;
  timestamp_ms: number;
}

export interface MirageStatus {
  mirage_id: string;
  phase: string;
  registered_ghosts: number;
  active_intents: number;
  report_count: number;
}

export interface IntentRef {
  intent_id: string;
}

export interface IntentCommand extends IssueCommand {
  command_id: string;
  state: string;
  attempts: number;
  last_error: string;
  updated_at_ms: number;
}

export interface IntentSnapshot {
  intent_id: string;
  issue: Issue;
  received_at_ms: number;
  commands: IntentCommand[];
  reports: Report[];
  has_observed: boolean;
  pending_count: number;
}

export interface SeedMetadata {
  id: string;
  name: string;
  description: string;
}

export interface Ghost {
  ghost_id: string;
  remote_addr: string;
  seed_list: SeedMetadata[];
  registered_at_ms: number;
  last_event_at_ms: number;
  event_count: number;
  connected: boolean;
}

export interface SeedOperation {
  name: string;
  description: string;
  idempotent: boolean;
}

export interface CommandArg {
  key: string;
  prompt: string;
  required: boolean;
  default_value: string;
  multiline: boolean;
  terminator: string;
}

export interface CommandTemplate {
  id: string;
  label: string;
  description: string;
  seed_selector: string;
  operation: string;
  default_blocking: boolean;
  args: CommandArg[];
}

export interface SeedCapability {
  metadata: SeedMetadata;
  operations: SeedOperation[];
  command_catalog: CommandTemplate[];
}

export interface GhostSeedCatalog {
  ghost_id: string;
  admin_addr: string;
  connected: boolean;
  /** Set when this Ghost's catalog could not be read */
  error: string;
  seed_catalog: SeedCapability[];
}

export interface AttachRequest {
  ghost_admin_addr: string;
}

export interface GhostRouteRef {
  ghost_id: string;
  admin_addr: string;
}

export interface SpawnRequest {
  target_name: string;
  admin_addr: string;
}

export interface SpawnResult {
  target_name: string;
  ghost_id: string;
  admin_addr: string;
}

export interface SeedResult {
  seed_id: string;
  status: string;
  exit_code: number;
  stdout: string;
  stderr: string;
  /** "utf8", or "base64" for both stdout and stderr */
  output_encoding: string;
}

export interface Execution {
  command_id: string;
  execution_id: string;
  intent_id: string;
  ghost_id: string;
  seed_selector: string;
  operation: string;
  args: Args;
  phase: string;
  outcome: string;
  completed_at_ms: number;
  seed_result: SeedResult;
}

// Shapes of Tracker Suite's own /api/edgectl routes, on top of the contract's.

/** GET /api/edgectl/status: whether this server can reach Mirage, as data */
export type ConnectionState =
  | { state: "ok"; status: MirageStatus }
  | { state: "not_configured"; message: string }
  | { state: "unreachable"; message: string }
  | { state: "error"; message: string };

/** One row of GET /api/edgectl/intents, built from the intent's snapshot */
export interface IntentSummary {
  intent_id: string;
  objective: string;
  target_scope: string;
  received_at_ms: number;
  command_count: number;
  pending_count: number;
  /** completion_state of the latest report; "" before the first report */
  completion_state: string;
}

// Shapes added by the 2026-11-25 operator parity amendment of api_v1.toml.

export interface Route {
  ghost_id: string;
  admin_addr: string;
  connected: boolean;
}

export interface Service {
  seed_id: string;
  ghost_ids: string[];
}

export interface DeployTarget {
  ghost_id: string;
  host: string;
  admin_addr: string;
}

export interface DeployRequest {
  ghost_id: string;
  force_redeploy?: boolean;
}

export interface DeployResult {
  ghost_id: string;
  host: string;
  admin_addr: string;
  status: string;
  message: string;
}

/** One install step, as Mirage derives it from its dependency catalog */
export interface InstallStep {
  seed_id: string;
  method: string;
  repo_url: string;
  ref: string;
  url: string;
  version: string;
  sha256: string;
  destination: string;
  package: string;
  tap: string;
  binary: string;
}

export interface ProposalAudit {
  kind: string;
  actor: string;
  state: string;
  detail: string;
  at_ms: number;
}

export interface ProposalExecution {
  succeeded: boolean;
  steps: { seed_id: string; method: string; status: string; error: string }[];
  rollback: { seed_id: string; method: string; rolled_back: boolean; error: string }[];
  error: string;
}

/**
 * A dependency proposal, for display. The signed intent and approval inside it are left out here:
 * the server hands Mirage's own copy to the signing tool and the browser never needs them.
 */
export interface DependencyProposal {
  id: string;
  ghost_id: string;
  seed_ids: string[];
  steps: InstallStep[];
  unresolved: string[];
  /** pending | approved | executing | succeeded | failed */
  state: string;
  proposed_by: string;
  proposed_at_ms: number;
  approved_by: string;
  executed_by: string;
  execution: ProposalExecution | null;
  audit: ProposalAudit[];
}

export interface GhostStatus {
  ghost_id: string;
  phase: string;
  seed_count: number;
}

export interface GhostEvent {
  event_id: string;
  command_id: string;
  intent_id: string;
  ghost_id: string;
  seed_id: string;
  outcome: string;
  timestamp_ms: number;
}

export interface VerificationRecord {
  request_id: string;
  trace_id: string;
  command_message_id: number;
  /** Protocol message type numbers of the command and of the event that answered it */
  command_message_type: number;
  event_message_type: number;
  command_id: string;
  execution_id: string;
  event_id: string;
  ghost_id: string;
  seed_id: string;
  operation: string;
  outcome: string;
  seed_status: string;
  exit_code: number;
  timestamp_ms: number;
  status: string;
}

export type ActivityKind = "audit" | "custody";

export interface ActivityRecord {
  kind: string;
  timestamp_ms: number;
  fields: Record<string, string>;
}

// This app's own additions for the parity routes.

/** One feature that needs server configuration: usable, or why not */
export interface Capability {
  enabled: boolean;
  /** Why it is off; "" when enabled */
  message: string;
}

/** GET /api/edgectl/capabilities */
export interface Capabilities {
  /** Issue a Ghost certificate (Add a Ghost) */
  issue: Capability;
  /** Sign a dependency proposal as the operator */
  propose: Capability;
  /** Sign and send an approval as the second operator */
  approve: Capability;
}

/** POST /api/edgectl/dependencies/intent: what a proposal would install, before anything is signed */
export interface IntentPreview {
  ghost_id: string;
  seed_ids: string[];
  steps: InstallStep[];
}

/** POST .../proposals/{id}/approval: what the operator must confirm before the approval is signed */
export interface PreparedApproval {
  proposal: DependencyProposal;
  /** sha256 of the approval payload, hex; computed by edgecert */
  digest: string;
  approver: string;
  proposer: string;
  expires_at_ms: number;
}
