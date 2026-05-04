use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DailyUsageRecord {
    pub day: String,
    pub total_input_tokens: i64,
    pub total_output_tokens: i64,
    pub total_cached_input_tokens: i64,
    pub total_reasoning_tokens: i64,
    pub total_tokens: i64,
    pub total_cost_usd: f64,
    pub session_count: i64,
    pub event_count: i64,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelsDailyRecord {
    pub day: String,
    pub model: String,
    pub total_tokens: i64,
    pub total_cost_usd: f64,
    pub event_count: i64,
}
