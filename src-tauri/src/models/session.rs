use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionRecord {
    pub id: String,
    pub source_session_id: Option<String>,
    pub first_seen_at: String,
    pub last_seen_at: String,
    pub model_summary: Option<String>,
    pub total_input_tokens: i64,
    pub total_output_tokens: i64,
    pub total_cached_input_tokens: i64,
    pub total_reasoning_tokens: i64,
    pub total_tokens: i64,
    pub total_cost_usd: f64,
    pub event_count: i64,
    pub tool_event_count: i64,
    pub raw_metadata_json: Option<String>,
    pub primary_source_kind: String,
    pub source_confidence: String,
    pub import_first_seen_at: Option<String>,
    pub live_last_seen_at: Option<String>,
    pub project_path: Option<String>,
    pub display_text: Option<String>,
    pub bookmarked: bool,
    pub custom_name: Option<String>,
    #[serde(skip_serializing)]
    pub search_content: Option<String>,
}