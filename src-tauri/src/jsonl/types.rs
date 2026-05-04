use serde::{Deserialize, Serialize};

/// A single line from ~/.claude/history.jsonl
#[derive(Debug, Clone, Deserialize)]
pub struct RawHistoryEntry {
    #[serde(rename = "sessionId")]
    pub session_id: String,
    pub timestamp: u64, // milliseconds since epoch
    pub project: Option<String>,
    pub display: Option<String>,
    #[serde(rename = "pastedContents")]
    pub pasted_contents: Option<serde_json::Value>,
}

/// Parsed and cleaned history entry
#[derive(Debug, Clone)]
pub struct ParsedHistoryEntry {
    pub session_id: String,
    pub timestamp_ms: u64,
    pub timestamp_rfc3339: String,
    pub project_path: Option<String>,
    pub display_text: Option<String>,
}

/// A session assembled from grouped history entries
#[derive(Debug, Clone, Serialize)]
pub struct NormalizedSession {
    pub session_id: String,
    pub first_seen_at: String,
    pub last_seen_at: String,
    pub project_path: Option<String>,
    pub display_text: Option<String>,
    pub event_count: i64,
}

/// Result of a single import run
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportResult {
    pub files_scanned: i64,
    pub records_parsed: i64,
    pub records_imported: i64,
    pub records_skipped: i64,
    pub sessions_created: i64,
    pub sessions_updated: i64,
    pub duration_ms: u64,
    pub error: Option<String>,
}

/// A discovered JSONL file with metadata
#[derive(Debug, Clone)]
pub struct DiscoveredFile {
    pub path: String,
    pub file_type: String, // "history" or "project"
    pub size: u64,
    pub modified_at: Option<String>,
}

// ── Per-session JSONL types ──────────────────────────────────────────

/// A single line from a per-session JSONL file (~/.claude/projects/<project>/<sessionId>.jsonl).
/// Dispatched by the "type" field.
#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "type")]
pub enum RawSessionEntry {
    #[serde(rename = "assistant")]
    Assistant(RawAssistantEntry),
    #[serde(rename = "user")]
    User(RawUserEntry),
    #[serde(rename = "progress")]
    Progress(serde_json::Value),
    #[serde(rename = "file-history-snapshot")]
    FileHistorySnapshot(serde_json::Value),
    #[serde(other)]
    Unknown,
}

#[derive(Debug, Clone, Deserialize)]
pub struct RawAssistantEntry {
    #[serde(rename = "sessionId")]
    pub session_id: Option<String>,
    pub timestamp: Option<String>,
    #[serde(rename = "requestId")]
    pub request_id: Option<String>,
    pub uuid: Option<String>,
    pub message: Option<AssistantMessage>,
    pub cwd: Option<String>,
    #[serde(rename = "gitBranch")]
    pub git_branch: Option<String>,
    pub version: Option<String>,
    #[serde(rename = "isSidechain")]
    pub is_sidechain: Option<bool>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AssistantMessage {
    pub model: Option<String>,
    pub id: Option<String>,
    pub role: Option<String>,
    pub content: Option<serde_json::Value>,
    pub stop_reason: Option<serde_json::Value>,
    pub usage: Option<TokenUsage>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct TokenUsage {
    pub input_tokens: Option<i64>,
    pub output_tokens: Option<i64>,
    pub cache_creation_input_tokens: Option<i64>,
    pub cache_read_input_tokens: Option<i64>,
    pub service_tier: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct RawUserEntry {
    #[serde(rename = "sessionId")]
    pub session_id: Option<String>,
    pub timestamp: Option<String>,
    pub uuid: Option<String>,
    pub message: Option<UserMessage>,
    pub cwd: Option<String>,
    #[serde(rename = "gitBranch")]
    pub git_branch: Option<String>,
    pub version: Option<String>,
    #[serde(rename = "userType")]
    pub user_type: Option<String>,
    #[serde(rename = "isMeta")]
    pub is_meta: Option<bool>,
    #[serde(rename = "isSidechain")]
    pub is_sidechain: Option<bool>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UserMessage {
    pub role: Option<String>,
    pub content: Option<serde_json::Value>,
}

/// A single content block from an assistant message.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "block_type")]
pub enum ContentBlock {
    #[serde(rename = "thinking")]
    Thinking { thinking: String },
    #[serde(rename = "text")]
    Text { text: String },
    #[serde(rename = "tool_use")]
    ToolUse {
        tool_id: String,
        tool_name: String,
        input: serde_json::Value,
    },
}

/// Per-message metadata extracted from the top-level JSONL entry.
#[derive(Debug, Clone, Serialize)]
pub struct MessageMetadata {
    pub cwd: Option<String>,
    pub git_branch: Option<String>,
    pub version: Option<String>,
    pub is_sidechain: bool,
}

/// A single message extracted from a per-session JSONL file, with per-message cost.
#[derive(Debug, Clone, Serialize)]
pub struct SessionMessage {
    pub role: String,
    pub timestamp: Option<String>,
    pub end_timestamp: Option<String>,
    pub content_text: Option<String>,
    pub content_blocks: Vec<ContentBlock>,
    pub metadata: Option<MessageMetadata>,
    pub model: Option<String>,
    pub input_tokens: i64,
    pub output_tokens: i64,
    pub cache_creation_tokens: i64,
    pub cache_read_tokens: i64,
    pub cost_usd: f64,
    pub tool_use_count: i64,
    pub is_meta: bool,
}

/// A session assembled from per-session JSONL with full token/cost data
#[derive(Debug, Clone, Serialize)]
pub struct EnrichedSession {
    pub session_id: String,
    pub first_seen_at: String,
    pub last_seen_at: String,
    pub project_path: Option<String>,
    pub display_text: Option<String>,
    pub event_count: i64,
    pub tool_event_count: i64,
    pub model_summary: Option<String>,
    pub total_input_tokens: i64,
    pub total_output_tokens: i64,
    pub total_cached_input_tokens: i64,
    pub total_reasoning_tokens: i64,
    pub total_tokens: i64,
    pub total_cost_usd: f64,
}

// ── Worklog types ────────────────────────────────────────────────────

/// One worklog row per (session, day).
#[derive(Debug, Clone, Serialize)]
pub struct WorklogRow {
    pub session_id: String,
    pub project_path: Option<String>,
    pub day: String,                    // YYYY-MM-DD (UTC)
    pub claude_work_seconds: i64,
    pub turn_count: i64,
}

/// Per-turn breakdown for a session (used in detail panel).
#[derive(Debug, Clone, Serialize)]
pub struct TurnWorklog {
    pub index: i64,                     // 1-based
    pub user_message_at: String,        // RFC3339 — the real user message timestamp
    pub last_assistant_at: String,      // RFC3339 — the turn's last assistant end_timestamp
    pub claude_seconds: i64,
}
