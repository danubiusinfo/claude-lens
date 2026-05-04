use crate::models::ModelPricing;

/// Look up the rate from DB pricing, falling back to hardcoded defaults.
/// token_type: "input", "output", "cache_read", "cache_write"
fn rate_from_pricing(model: &str, token_type: &str, pricing: &[ModelPricing]) -> f64 {
    let model_lower = model.to_lowercase();

    // Try to find a match in the DB pricing
    for p in pricing {
        if model_lower.contains(&p.model_key) {
            return match token_type {
                "cache_read" | "input_cache_read" => p.cache_read_per_million,
                "cache_write" => p.cache_write_per_million,
                "output" => p.output_per_million,
                _ => p.input_per_million, // "input" and any unknown
            };
        }
    }

    // Fallback to hardcoded defaults
    cost_per_million_tokens_default(model, token_type)
}

/// Hardcoded fallback pricing (Opus 4.6/4.5, Sonnet 4.x, Haiku 4.5).
fn cost_per_million_tokens_default(model: &str, token_type: &str) -> f64 {
    let model_lower = model.to_lowercase();

    if model_lower.contains("opus") {
        match token_type {
            "cache_read" | "input_cache_read" => 0.50,
            "cache_write" => 6.25,
            "output" => 25.0,
            _ => 5.0,
        }
    } else if model_lower.contains("sonnet") {
        match token_type {
            "cache_read" | "input_cache_read" => 0.30,
            "cache_write" => 3.75,
            "output" => 15.0,
            _ => 3.0,
        }
    } else if model_lower.contains("haiku") {
        match token_type {
            "cache_read" | "input_cache_read" => 0.10,
            "cache_write" => 1.25,
            "output" => 5.0,
            _ => 1.0,
        }
    } else {
        // Default to sonnet-like pricing
        match token_type {
            "cache_read" | "input_cache_read" => 0.30,
            "cache_write" => 3.75,
            "output" => 15.0,
            _ => 3.0,
        }
    }
}

pub fn estimate_cost(
    model: Option<&str>,
    token_type: &str,
    token_count: f64,
    pricing: &[ModelPricing],
) -> f64 {
    let m = model.unwrap_or("unknown");
    let rate = rate_from_pricing(m, token_type, pricing);
    (token_count / 1_000_000.0) * rate
}
