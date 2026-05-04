use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelPricing {
    pub model_key: String,
    pub display_name: String,
    pub input_per_million: f64,
    pub output_per_million: f64,
    pub cache_read_per_million: f64,
    pub cache_write_per_million: f64,
}

/// Default pricing data seeded into the database on first run.
/// Prices reflect Opus 4.6/4.5, Sonnet 4.x, Haiku 4.5 rates.
/// Cache write = 5-minute cache (1.25x input).
pub fn default_pricing() -> Vec<ModelPricing> {
    vec![
        ModelPricing {
            model_key: "opus".to_string(),
            display_name: "Claude Opus".to_string(),
            input_per_million: 5.0,
            output_per_million: 25.0,
            cache_read_per_million: 0.50,
            cache_write_per_million: 6.25,
        },
        ModelPricing {
            model_key: "sonnet".to_string(),
            display_name: "Claude Sonnet".to_string(),
            input_per_million: 3.0,
            output_per_million: 15.0,
            cache_read_per_million: 0.30,
            cache_write_per_million: 3.75,
        },
        ModelPricing {
            model_key: "haiku".to_string(),
            display_name: "Claude Haiku".to_string(),
            input_per_million: 1.0,
            output_per_million: 5.0,
            cache_read_per_million: 0.10,
            cache_write_per_million: 1.25,
        },
    ]
}
