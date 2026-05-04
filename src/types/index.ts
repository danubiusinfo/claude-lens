export interface UserProfile {
  display_name: string | null;
  email: string | null;
}

export interface ModelPricing {
  model_key: string;
  display_name: string;
  input_per_million: number;
  output_per_million: number;
  cache_read_per_million: number;
  cache_write_per_million: number;
}

export interface AppStatusResponse {
  db_initialized: boolean;
  has_jsonl_data: boolean;
  jsonl_importing: boolean;
}

// ── Dashboard Types ──────────────────────────────────────────

export type TimeRange = 'Today' | 'WorkWeek' | 'Week' | 'Month' | 'All';

export interface DashboardSummary {
  total_tokens: number;
  total_cost_usd: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cached_input_tokens: number;
  total_reasoning_tokens: number;
  session_count: number;
  event_count: number;
  last_event_at: string | null;
}

export interface TimeseriesPoint {
  date: string;
  total: number;
  input: number;
  output: number;
  cached: number;
  reasoning: number;
  cost: number;
}

export interface ProjectStats {
  project_path: string;
  project_name: string;
  session_count: number;
  total_tokens: number;
  total_cost_usd: number;
  last_seen_at: string;
}

export interface SessionRecord {
  id: string;
  source_session_id: string | null;
  first_seen_at: string;
  last_seen_at: string;
  model_summary: string | null;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cached_input_tokens: number;
  total_reasoning_tokens: number;
  total_tokens: number;
  total_cost_usd: number;
  event_count: number;
  tool_event_count: number;
  raw_metadata_json: string | null;
  primary_source_kind: string;
  source_confidence: string;
  import_first_seen_at: string | null;
  live_last_seen_at: string | null;
  project_path: string | null;
  display_text: string | null;
  bookmarked: boolean;
  custom_name: string | null;
}

export type ContentBlock =
  | { block_type: 'thinking'; thinking: string }
  | { block_type: 'text'; text: string }
  | { block_type: 'tool_use'; tool_id: string; tool_name: string; input: unknown };

export interface MessageMetadata {
  cwd: string | null;
  git_branch: string | null;
  version: string | null;
  is_sidechain: boolean;
}

export interface SessionMessage {
  role: string;
  timestamp: string | null;
  content_text: string | null;
  content_blocks: ContentBlock[];
  metadata: MessageMetadata | null;
  model: string | null;
  input_tokens: number;
  output_tokens: number;
  cache_creation_tokens: number;
  cache_read_tokens: number;
  cost_usd: number;
  tool_use_count: number;
  is_meta: boolean;
}

export interface DailyUsageRecord {
  day: string;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cached_input_tokens: number;
  total_reasoning_tokens: number;
  total_tokens: number;
  total_cost_usd: number;
  session_count: number;
  event_count: number;
  updated_at: string;
}

// ── Plan Types ──────────────────────────────────────────────

export interface PlanEntry {
  filename: string;
  name: string;
  title: string;
  modified_at: string;
  size_bytes: number;
}

// ── JSONL / Source Types ────────────────────────────────────

export interface ImportResult {
  files_scanned: number;
  records_parsed: number;
  records_imported: number;
  records_skipped: number;
  sessions_created: number;
  sessions_updated: number;
  duration_ms: number;
  error: string | null;
}

export interface JsonlStatusInfo {
  is_importing: boolean;
  last_import_at: string | null;
  files_discovered: number;
  total_records: number;
  total_sessions: number;
  error: string | null;
}

export interface SourceStatusInfo {
  jsonl: JsonlStatusInfo;
  has_jsonl_data: boolean;
  source_file_count: number;
  total_jsonl_sessions: number;
}

// ── Worklog Types ────────────────────────────────────────────

export interface WorklogTimeseriesPoint {
  day: string;
  user_seconds: number;
  claude_seconds: number;
}

export interface WorklogSummary {
  total_user_seconds: number;
  total_claude_seconds: number;
  turn_count: number;
  session_count: number;
  timeseries: WorklogTimeseriesPoint[];
}

export interface TurnWorklog {
  index: number;
  user_message_at: string;
  last_assistant_at: string;
  user_seconds: number;
  claude_seconds: number;
  user_capped: boolean;
}

export interface DayWorklogProject {
  project_path: string | null;
  session_count: number;
  user_work_seconds: number;
  claude_work_seconds: number;
}
