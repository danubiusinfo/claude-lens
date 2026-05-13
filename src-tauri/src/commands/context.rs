use std::collections::BTreeMap;
use tauri::State;

use crate::commands::dashboard::TimeRange;
use crate::error::AppError;
use crate::jsonl::normalize::extract_session_messages;
use crate::jsonl::parser::parse_session_line;
use crate::models::context::{
    DailyContextPoint, DashboardContextSummary, FillBucket, SessionContextStats, TurnContextPoint,
};
use crate::pricing::estimate_cost;
use crate::state::AppState;

#[tauri::command]
pub async fn get_session_context_stats(
    state: State<'_, AppState>,
    source_session_id: String,
) -> Result<SessionContextStats, AppError> {
    // Resolve the override directory if set
    let override_dir = state
        .database()
        .get_app_setting("jsonl_directory_override")
        .ok()
        .flatten();

    let claude_dir = if let Some(dir) = override_dir {
        std::path::PathBuf::from(dir)
    } else {
        dirs::home_dir()
            .ok_or_else(|| AppError::Internal("Cannot determine home directory".to_string()))?
            .join(".claude")
    };

    let projects_dir = claude_dir.join("projects");
    if !projects_dir.exists() {
        return Ok(empty_stats());
    }

    // Search for <source_session_id>.jsonl in all project subdirectories
    let target_filename = format!("{}.jsonl", source_session_id);
    let mut jsonl_path: Option<std::path::PathBuf> = None;

    if let Ok(entries) = std::fs::read_dir(&projects_dir) {
        for entry in entries.flatten() {
            let candidate = entry.path().join(&target_filename);
            if candidate.exists() {
                jsonl_path = Some(candidate);
                break;
            }
        }
    }

    let path = match jsonl_path {
        Some(p) => p,
        None => return Ok(empty_stats()),
    };

    // Read and parse the file
    let content = std::fs::read_to_string(&path)
        .map_err(|e| AppError::Internal(format!("Cannot read session file: {}", e)))?;

    let raw_entries: Vec<_> = content
        .lines()
        .filter_map(|line| parse_session_line(line))
        .collect();

    let pricing = state.database().get_model_pricing().unwrap_or_default();
    let messages = extract_session_messages(&raw_entries, &pricing);

    // Filter to assistant messages with input_tokens > 0
    let assistant_turns: Vec<_> = messages
        .iter()
        .filter(|m| m.role == "assistant" && m.input_tokens > 0)
        .collect();

    if assistant_turns.is_empty() {
        return Ok(empty_stats());
    }

    // Determine context limit from model pricing table (substring match on model name)
    let first_model = assistant_turns
        .iter()
        .find_map(|m| m.model.as_deref())
        .unwrap_or("unknown");

    let context_limit: Option<i64> = {
        let model_lower = first_model.to_lowercase();
        pricing
            .iter()
            .find(|p| model_lower.contains(&p.model_key))
            .map(|p| p.context_limit)
            .filter(|&l| l > 0)
    };

    // Build per-turn TurnContextPoint data
    let mut turns: Vec<TurnContextPoint> = Vec::new();
    let mut peak_input: i64 = 0;
    let mut total_input: i64 = 0;
    let mut total_cache_read: i64 = 0;
    let mut compaction_count: i64 = 0;
    let mut cache_savings: f64 = 0.0;
    let mut fill_pct_sum: f64 = 0.0;
    let mut fill_pct_count: u64 = 0;

    for (idx, msg) in assistant_turns.iter().enumerate() {
        let input = msg.input_tokens;
        let output = msg.output_tokens;
        let cache_read = msg.cache_read_tokens;
        let cache_creation = msg.cache_creation_tokens;

        // Detect compaction: input dropped by more than 20% relative to previous turn
        let is_compaction = if idx > 0 {
            let prev_input = assistant_turns[idx - 1].input_tokens;
            prev_input > 0 && (input as f64) < (prev_input as f64) * 0.8
        } else {
            false
        };

        if is_compaction {
            compaction_count += 1;
        }

        if input > peak_input {
            peak_input = input;
        }
        total_input += input;
        total_cache_read += cache_read;

        // Fill percentage for this turn
        let fill_pct = context_limit.map(|limit| {
            if limit > 0 {
                (input as f64 / limit as f64) * 100.0
            } else {
                0.0
            }
        });

        if let Some(fp) = fill_pct {
            fill_pct_sum += fp;
            fill_pct_count += 1;
        }

        // Cache savings: cost of treating cache_read as input vs cache_read rate
        let model_ref = msg.model.as_deref();
        let savings = estimate_cost(model_ref, "input", cache_read as f64, &pricing)
            - estimate_cost(model_ref, "cache_read", cache_read as f64, &pricing);
        cache_savings += savings;

        turns.push(TurnContextPoint {
            turn: (idx + 1) as i64,
            input_tokens: input,
            output_tokens: output,
            cache_read_tokens: cache_read,
            cache_creation_tokens: cache_creation,
            is_compaction,
        });
    }

    let peak_fill_pct = context_limit.and_then(|limit| {
        if limit > 0 {
            Some((peak_input as f64 / limit as f64) * 100.0)
        } else {
            None
        }
    });

    let avg_fill_pct = if fill_pct_count > 0 {
        Some(fill_pct_sum / fill_pct_count as f64)
    } else {
        None
    };

    let cache_hit_rate = if total_input > 0 {
        total_cache_read as f64 / total_input as f64
    } else {
        0.0
    };

    Ok(SessionContextStats {
        context_limit,
        peak_input_tokens: peak_input,
        peak_fill_pct,
        avg_fill_pct,
        cache_hit_rate,
        cache_savings_usd: cache_savings,
        compaction_count,
        turns,
    })
}

fn empty_stats() -> SessionContextStats {
    SessionContextStats {
        context_limit: None,
        peak_input_tokens: 0,
        peak_fill_pct: None,
        avg_fill_pct: None,
        cache_hit_rate: 0.0,
        cache_savings_usd: 0.0,
        compaction_count: 0,
        turns: Vec::new(),
    }
}

#[tauri::command]
pub async fn get_dashboard_context_summary(
    state: State<'_, AppState>,
    range: TimeRange,
) -> Result<DashboardContextSummary, AppError> {
    let (from, to) = range.to_date_range();
    let pricing = state.database().get_model_pricing().unwrap_or_default();
    let rows = state.database().get_context_aggregation(&from, &to)?;

    if rows.is_empty() {
        return Ok(empty_context_summary());
    }

    // Use first matching pricing entry for rate estimates (take first with context_limit > 0)
    // We'll use it for generic cache savings across sessions where we don't have per-session model
    let default_pricing_entry = pricing.first();

    // Fill distribution buckets: 0-25, 25-50, 50-75, 75-90, 90+
    let bucket_defs: [(f64, f64, &str); 5] = [
        (0.0, 25.0, "0-25%"),
        (25.0, 50.0, "25-50%"),
        (50.0, 75.0, "50-75%"),
        (75.0, 90.0, "75-90%"),
        (90.0, 100.0, "90%+"),
    ];
    let mut bucket_counts: [i64; 5] = [0; 5];

    // Daily aggregation: BTreeMap<day, (fill_sum, fill_count, cache_rate_sum, cache_rate_count)>
    let mut daily: BTreeMap<String, (f64, u64, f64, u64)> = BTreeMap::new();

    let mut total_peak_fill_sum: f64 = 0.0;
    let mut total_peak_fill_count: u64 = 0;
    let mut total_cache_rate_sum: f64 = 0.0;
    let mut session_count: u64 = 0;
    let mut total_cache_savings: f64 = 0.0;
    let mut total_input_cost: f64 = 0.0;

    for (source_session_id, total_input, total_cached, peak_input, _total_output, _total_cost, day) in
        &rows
    {
        let _ = source_session_id; // used as grouping key from DB

        // Determine fill_pct from peak_input and context_limit
        // Try to derive context limit; use first pricing entry's limit as fallback
        let context_limit = default_pricing_entry
            .map(|p| p.context_limit)
            .unwrap_or(200_000);

        let fill_pct = if context_limit > 0 && *peak_input > 0 {
            (*peak_input as f64 / context_limit as f64) * 100.0
        } else {
            0.0
        };

        // Cache rate
        let cache_rate = if *total_input > 0 {
            *total_cached as f64 / *total_input as f64
        } else {
            0.0
        };

        // Cache savings estimate
        let savings = if *total_cached > 0 {
            estimate_cost(
                default_pricing_entry.map(|p| p.model_key.as_str()),
                "input",
                *total_cached as f64,
                &pricing,
            ) - estimate_cost(
                default_pricing_entry.map(|p| p.model_key.as_str()),
                "cache_read",
                *total_cached as f64,
                &pricing,
            )
        } else {
            0.0
        };

        // Estimated input cost (without cache savings)
        let input_cost = estimate_cost(
            default_pricing_entry.map(|p| p.model_key.as_str()),
            "input",
            *total_input as f64,
            &pricing,
        );

        total_cache_savings += savings;
        total_input_cost += input_cost;

        // Fill bucket
        for (bucket_idx, (min_pct, max_pct, _label)) in bucket_defs.iter().enumerate() {
            if fill_pct >= *min_pct && (fill_pct < *max_pct || bucket_idx == 4) {
                bucket_counts[bucket_idx] += 1;
                break;
            }
        }

        // Daily accumulation
        let entry = daily.entry(day.clone()).or_insert((0.0, 0, 0.0, 0));
        if fill_pct > 0.0 {
            entry.0 += fill_pct;
            entry.1 += 1;
        }
        entry.2 += cache_rate;
        entry.3 += 1;

        if fill_pct > 0.0 {
            total_peak_fill_sum += fill_pct;
            total_peak_fill_count += 1;
        }
        total_cache_rate_sum += cache_rate;
        session_count += 1;
    }

    // Build fill distribution
    let fill_distribution: Vec<FillBucket> = bucket_defs
        .iter()
        .enumerate()
        .map(|(idx, (min, max, label))| FillBucket {
            label: label.to_string(),
            min_pct: *min,
            max_pct: *max,
            session_count: bucket_counts[idx],
        })
        .collect();

    // Build daily averages
    let daily_avg_fill: Vec<DailyContextPoint> = daily
        .iter()
        .map(|(day, (fill_sum, fill_count, _cache_sum, _cache_count))| DailyContextPoint {
            day: day.clone(),
            value: if *fill_count > 0 {
                fill_sum / *fill_count as f64
            } else {
                0.0
            },
        })
        .collect();

    let daily_avg_cache_rate: Vec<DailyContextPoint> = daily
        .iter()
        .map(|(day, (_fill_sum, _fill_count, cache_sum, cache_count))| DailyContextPoint {
            day: day.clone(),
            value: if *cache_count > 0 {
                cache_sum / *cache_count as f64
            } else {
                0.0
            },
        })
        .collect();

    let avg_peak_fill_pct = if total_peak_fill_count > 0 {
        Some(total_peak_fill_sum / total_peak_fill_count as f64)
    } else {
        None
    };

    let avg_cache_hit_rate = if session_count > 0 {
        total_cache_rate_sum / session_count as f64
    } else {
        0.0
    };

    let cache_savings_pct = if total_input_cost > 0.0 {
        (total_cache_savings / total_input_cost) * 100.0
    } else {
        0.0
    };

    Ok(DashboardContextSummary {
        avg_peak_fill_pct,
        avg_cache_hit_rate,
        total_cache_savings_usd: total_cache_savings,
        cache_savings_pct,
        fill_distribution,
        daily_avg_fill,
        daily_avg_cache_rate,
    })
}

fn empty_context_summary() -> DashboardContextSummary {
    let bucket_defs: [(f64, f64, &str); 5] = [
        (0.0, 25.0, "0-25%"),
        (25.0, 50.0, "25-50%"),
        (50.0, 75.0, "50-75%"),
        (75.0, 90.0, "75-90%"),
        (90.0, 100.0, "90%+"),
    ];
    DashboardContextSummary {
        avg_peak_fill_pct: None,
        avg_cache_hit_rate: 0.0,
        total_cache_savings_usd: 0.0,
        cache_savings_pct: 0.0,
        fill_distribution: bucket_defs
            .iter()
            .map(|(min, max, label)| FillBucket {
                label: label.to_string(),
                min_pct: *min,
                max_pct: *max,
                session_count: 0,
            })
            .collect(),
        daily_avg_fill: Vec::new(),
        daily_avg_cache_rate: Vec::new(),
    }
}
