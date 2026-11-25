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
