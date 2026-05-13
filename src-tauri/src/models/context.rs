use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct TurnContextPoint {
    pub turn: i64,
    pub input_tokens: i64,
    pub output_tokens: i64,
    pub cache_read_tokens: i64,
    pub cache_creation_tokens: i64,
    pub is_compaction: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct SessionContextStats {
    pub context_limit: Option<i64>,
    pub peak_input_tokens: i64,
    pub peak_fill_pct: Option<f64>,
    pub avg_fill_pct: Option<f64>,
    pub cache_hit_rate: f64,
    pub cache_savings_usd: f64,
    pub compaction_count: i64,
    pub turns: Vec<TurnContextPoint>,
}

#[derive(Debug, Clone, Serialize)]
pub struct FillBucket {
    pub label: String,
    pub min_pct: f64,
    pub max_pct: f64,
    pub session_count: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct DailyContextPoint {
    pub day: String,
    pub value: f64,
}

#[derive(Debug, Clone, Serialize)]
pub struct DashboardContextSummary {
    pub avg_peak_fill_pct: Option<f64>,
    pub avg_cache_hit_rate: f64,
    pub total_cache_savings_usd: f64,
    pub cache_savings_pct: f64,
    pub fill_distribution: Vec<FillBucket>,
    pub daily_avg_fill: Vec<DailyContextPoint>,
    pub daily_avg_cache_rate: Vec<DailyContextPoint>,
}
