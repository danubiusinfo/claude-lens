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

/// Default pricing seeded into the database.
/// Source: https://platform.claude.com/docs/en/about-claude/pricing
/// Cache read = 0.1x input, cache write = 1.25x input (5-minute TTL).
pub fn default_pricing() -> Vec<ModelPricing> {
    vec![
        ModelPricing {
            model_key: "opus-4-7".to_string(),
            display_name: "Opus 4.7".to_string(),
            input_per_million: 5.0,
            output_per_million: 25.0,
            cache_read_per_million: 0.50,
            cache_write_per_million: 6.25,
        },
        ModelPricing {
            model_key: "opus-4-6".to_string(),
            display_name: "Opus 4.6".to_string(),
            input_per_million: 5.0,
            output_per_million: 25.0,
            cache_read_per_million: 0.50,
            cache_write_per_million: 6.25,
        },
        ModelPricing {
            model_key: "opus-4-5".to_string(),
            display_name: "Opus 4.5".to_string(),
            input_per_million: 5.0,
            output_per_million: 25.0,
            cache_read_per_million: 0.50,
            cache_write_per_million: 6.25,
        },
        ModelPricing {
            model_key: "sonnet-4-6".to_string(),
            display_name: "Sonnet 4.6".to_string(),
            input_per_million: 3.0,
            output_per_million: 15.0,
            cache_read_per_million: 0.30,
            cache_write_per_million: 3.75,
        },
        ModelPricing {
            model_key: "sonnet-4-5".to_string(),
            display_name: "Sonnet 4.5".to_string(),
            input_per_million: 3.0,
            output_per_million: 15.0,
            cache_read_per_million: 0.30,
            cache_write_per_million: 3.75,
        },
        ModelPricing {
            model_key: "haiku-4-5".to_string(),
            display_name: "Haiku 4.5".to_string(),
            input_per_million: 1.0,
            output_per_million: 5.0,
            cache_read_per_million: 0.10,
            cache_write_per_million: 1.25,
        },
    ]
}
