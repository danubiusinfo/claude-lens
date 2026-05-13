# Context Monitor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add context window utilization and cache efficiency monitoring to the session detail panel (collapsible area chart + stats) and dashboard (aggregated Bento widget).

**Architecture:** Two new Tauri commands compute context stats on demand — one per-session (reads JSONL, returns per-turn data), one for the dashboard (aggregates from the sessions table). A new DB migration adds `context_limit` to model_pricing and `peak_input_tokens` to sessions. Four new frontend files: two React components and two hooks.

**Tech Stack:** Rust (Tauri commands, rusqlite), React 19, TypeScript, Recharts (AreaChart), Tailwind CSS, Framer Motion.

---

### Task 1: Database Migration V12

Add `context_limit` column to `model_pricing` and `peak_input_tokens` column to `sessions`.

**Files:**
- Modify: `src-tauri/src/db/migrations.rs`

- [ ] **Step 1: Add V12 migration SQL**

In `src-tauri/src/db/migrations.rs`, add the migration constant after `V11_UP` (after line 250):

```rust
const V12_UP: &str = r#"
ALTER TABLE model_pricing ADD COLUMN context_limit INTEGER NOT NULL DEFAULT 200000;
ALTER TABLE sessions ADD COLUMN peak_input_tokens INTEGER NOT NULL DEFAULT 0;
"#;
```

- [ ] **Step 2: Bump CURRENT_VERSION**

Change line 5 from:
```rust
const CURRENT_VERSION: i64 = 11;
```
to:
```rust
const CURRENT_VERSION: i64 = 12;
```

- [ ] **Step 3: Add migration execution block**

Inside `pub fn run()`, after the `if current < 11` block (after line 353), add:

```rust
    if current < 12 {
        conn.execute_batch(V12_UP)?;
        set_schema_version(conn, 12)?;
        tracing::info!("Applied migration V12 (schema version 12) — context_limit + peak_input_tokens");
    }
```

- [ ] **Step 4: Verify it compiles**

Run: `cd src-tauri && cargo check`
Expected: compiles without errors.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/db/migrations.rs
git commit -m "feat(db): add V12 migration — context_limit + peak_input_tokens"
```

---

### Task 2: Update Rust Model Types

Add `context_limit` to `ModelPricing` struct and create new context stats types.

**Files:**
- Modify: `src-tauri/src/models/pricing.rs`
- Create: `src-tauri/src/models/context.rs`
- Modify: `src-tauri/src/models/mod.rs`

- [ ] **Step 1: Add context_limit to ModelPricing**

In `src-tauri/src/models/pricing.rs`, add the field to the struct (after line 10):

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelPricing {
    pub model_key: String,
    pub display_name: String,
    pub input_per_million: f64,
    pub output_per_million: f64,
    pub cache_read_per_million: f64,
    pub cache_write_per_million: f64,
    pub context_limit: i64,
}
```

Update `default_pricing()` to include context_limit on each entry:

```rust
pub fn default_pricing() -> Vec<ModelPricing> {
    vec![
        ModelPricing {
            model_key: "opus".to_string(),
            display_name: "Claude Opus".to_string(),
            input_per_million: 5.0,
            output_per_million: 25.0,
            cache_read_per_million: 0.50,
            cache_write_per_million: 6.25,
            context_limit: 200_000,
        },
        ModelPricing {
            model_key: "sonnet".to_string(),
            display_name: "Claude Sonnet".to_string(),
            input_per_million: 3.0,
            output_per_million: 15.0,
            cache_read_per_million: 0.30,
            cache_write_per_million: 3.75,
            context_limit: 200_000,
        },
        ModelPricing {
            model_key: "haiku".to_string(),
            display_name: "Claude Haiku".to_string(),
            input_per_million: 1.0,
            output_per_million: 5.0,
            cache_read_per_million: 0.10,
            cache_write_per_million: 1.25,
            context_limit: 200_000,
        },
    ]
}
```

- [ ] **Step 2: Create context stats types**

Create `src-tauri/src/models/context.rs`:

```rust
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
```

- [ ] **Step 3: Register context module**

In `src-tauri/src/models/mod.rs`, add:

```rust
pub mod context;
```

- [ ] **Step 4: Verify it compiles**

Run: `cd src-tauri && cargo check`
Expected: compiles (may have warnings about unused types — that's fine, they'll be used in subsequent tasks).

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/models/pricing.rs src-tauri/src/models/context.rs src-tauri/src/models/mod.rs
git commit -m "feat(models): add context stats types and context_limit to ModelPricing"
```

---

### Task 3: Update DB Queries for ModelPricing

Update all DB methods that read/write `ModelPricing` to include the `context_limit` column.

**Files:**
- Modify: `src-tauri/src/db/mod.rs`

- [ ] **Step 1: Update get_model_pricing query**

In `src-tauri/src/db/mod.rs`, find the `get_model_pricing` method (around line 1025) and update the SQL and mapping to include `context_limit`:

```rust
    pub fn get_model_pricing(&self) -> Result<Vec<ModelPricing>, AppError> {
        let conn = self.conn.lock().map_err(|e| AppError::Database(e.to_string()))?;
        let mut stmt = conn.prepare(
            "SELECT model_key, display_name, input_per_million, output_per_million, cache_read_per_million, cache_write_per_million, context_limit
             FROM model_pricing ORDER BY model_key ASC",
        )?;
        let rows = stmt
            .query_map([], |row| {
                Ok(ModelPricing {
                    model_key: row.get(0)?,
                    display_name: row.get(1)?,
                    input_per_million: row.get(2)?,
                    output_per_million: row.get(3)?,
                    cache_read_per_million: row.get(4)?,
                    cache_write_per_million: row.get(5)?,
                    context_limit: row.get(6)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }
```

- [ ] **Step 2: Update update_model_pricing to include context_limit**

Find the `update_model_pricing` method (around line 1046) and add the `context_limit` parameter:

```rust
    pub fn update_model_pricing(
        &self,
        model_key: &str,
        input_per_million: f64,
        output_per_million: f64,
        cache_read_per_million: f64,
        cache_write_per_million: f64,
        context_limit: i64,
    ) -> Result<(), AppError> {
        let conn = self.conn.lock().map_err(|e| AppError::Database(e.to_string()))?;
        let now = chrono::Utc::now().to_rfc3339();
        conn.execute(
            "UPDATE model_pricing SET input_per_million = ?1, output_per_million = ?2,
                cache_read_per_million = ?3, cache_write_per_million = ?4, context_limit = ?5, updated_at = ?6 WHERE model_key = ?7",
            rusqlite::params![input_per_million, output_per_million, cache_read_per_million, cache_write_per_million, context_limit, now, model_key],
        )?;
        Ok(())
    }
```

- [ ] **Step 3: Update reset_model_pricing**

Find the `reset_model_pricing` method (around line 1064). The UPSERT SQL needs to include `context_limit`. Look for the INSERT/ON CONFLICT statement and add the column:

The method uses `default_pricing()` which now includes `context_limit`, so update the SQL to insert/update `context_limit` as well. Find the exact SQL and add `context_limit` to both the column list and the ON CONFLICT update.

- [ ] **Step 4: Verify it compiles**

Run: `cd src-tauri && cargo check`
Expected: compiles. Some warnings about unused `context` module are fine.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/db/mod.rs
git commit -m "feat(db): update model_pricing queries to include context_limit"
```

---

### Task 4: Update Settings Command for context_limit

**Files:**
- Modify: `src-tauri/src/commands/settings.rs`

- [ ] **Step 1: Update update_model_pricing command**

In `src-tauri/src/commands/settings.rs`, update the `update_model_pricing` command to accept and pass through `context_limit`:

```rust
#[tauri::command]
pub async fn update_model_pricing(
    state: State<'_, AppState>,
    model_key: String,
    input_per_million: f64,
    output_per_million: f64,
    cache_read_per_million: f64,
    cache_write_per_million: f64,
    context_limit: i64,
) -> Result<(), AppError> {
    state.database().update_model_pricing(
        &model_key,
        input_per_million,
        output_per_million,
        cache_read_per_million,
        cache_write_per_million,
        context_limit,
    )
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd src-tauri && cargo check`
Expected: compiles without errors.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/commands/settings.rs
git commit -m "feat(settings): pass context_limit through update_model_pricing command"
```

---

### Task 5: Implement get_session_context_stats Command

Compute per-turn context stats from session messages.

**Files:**
- Create: `src-tauri/src/commands/context.rs`
- Modify: `src-tauri/src/commands/mod.rs`

- [ ] **Step 1: Create the context commands module**

Create `src-tauri/src/commands/context.rs`:

```rust
use tauri::State;

use crate::error::AppError;
use crate::jsonl::normalize::extract_session_messages;
use crate::jsonl::parser::parse_session_line;
use crate::models::context::{SessionContextStats, TurnContextPoint};
use crate::pricing::estimate_cost;
use crate::state::AppState;

#[tauri::command]
pub async fn get_session_context_stats(
    state: State<'_, AppState>,
    source_session_id: String,
) -> Result<SessionContextStats, AppError> {
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

    let content = std::fs::read_to_string(&path)
        .map_err(|e| AppError::Internal(format!("Cannot read session file: {}", e)))?;

    let entries: Vec<_> = content
        .lines()
        .filter_map(|line| parse_session_line(line))
        .collect();

    let pricing = state.database().get_model_pricing().unwrap_or_default();
    let messages = extract_session_messages(&entries, &pricing);

    // Filter to assistant messages with input_tokens > 0
    let assistant_msgs: Vec<_> = messages
        .iter()
        .filter(|m| m.role == "assistant" && m.input_tokens > 0)
        .collect();

    if assistant_msgs.is_empty() {
        return Ok(empty_stats());
    }

    // Determine context limit from the model used in the session
    let context_limit = assistant_msgs
        .iter()
        .filter_map(|m| m.model.as_deref())
        .next()
        .and_then(|model_name| {
            let model_lower = model_name.to_lowercase();
            pricing.iter().find(|p| model_lower.contains(&p.model_key)).map(|p| p.context_limit)
        });

    // Build per-turn data
    let mut turns = Vec::with_capacity(assistant_msgs.len());
    let mut prev_input: Option<i64> = None;
    let mut compaction_count: i64 = 0;
    let mut total_input: i64 = 0;
    let mut total_cache_read: i64 = 0;
    let mut peak_input: i64 = 0;
    let mut fill_sum: f64 = 0.0;

    for (idx, msg) in assistant_msgs.iter().enumerate() {
        let is_compaction = prev_input
            .map(|prev| msg.input_tokens < (prev as f64 * 0.8) as i64)
            .unwrap_or(false);

        if is_compaction {
            compaction_count += 1;
        }

        if msg.input_tokens > peak_input {
            peak_input = msg.input_tokens;
        }

        total_input += msg.input_tokens;
        total_cache_read += msg.cache_read_tokens;

        if let Some(limit) = context_limit {
            fill_sum += msg.input_tokens as f64 / limit as f64;
        }

        turns.push(TurnContextPoint {
            turn: (idx + 1) as i64,
            input_tokens: msg.input_tokens,
            output_tokens: msg.output_tokens,
            cache_read_tokens: msg.cache_read_tokens,
            cache_creation_tokens: msg.cache_creation_tokens,
            is_compaction,
        });

        prev_input = Some(msg.input_tokens);
    }

    let turn_count = assistant_msgs.len() as f64;
    let cache_hit_rate = if total_input > 0 {
        total_cache_read as f64 / total_input as f64
    } else {
        0.0
    };

    // Cache savings = cache_read_tokens * (input_rate - cache_read_rate) / 1M
    let cache_savings_usd: f64 = assistant_msgs.iter().map(|msg| {
        let model_ref = msg.model.as_deref();
        let input_cost = estimate_cost(model_ref, "input", msg.cache_read_tokens as f64, &pricing);
        let cache_cost = estimate_cost(model_ref, "cache_read", msg.cache_read_tokens as f64, &pricing);
        input_cost - cache_cost
    }).sum();

    let peak_fill_pct = context_limit.map(|limit| peak_input as f64 / limit as f64 * 100.0);
    let avg_fill_pct = context_limit.map(|_| fill_sum / turn_count * 100.0);

    Ok(SessionContextStats {
        context_limit,
        peak_input_tokens: peak_input,
        peak_fill_pct,
        avg_fill_pct,
        cache_hit_rate,
        cache_savings_usd,
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
```

- [ ] **Step 2: Register module**

In `src-tauri/src/commands/mod.rs`, add:

```rust
pub mod context;
```

- [ ] **Step 3: Verify it compiles**

Run: `cd src-tauri && cargo check`
Expected: compiles without errors.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/commands/context.rs src-tauri/src/commands/mod.rs
git commit -m "feat(backend): implement get_session_context_stats command"
```

---

### Task 6: Implement get_dashboard_context_summary Command

Aggregate context stats across sessions for the dashboard widget.

**Files:**
- Modify: `src-tauri/src/commands/context.rs`
- Modify: `src-tauri/src/db/mod.rs`

- [ ] **Step 1: Add DB query for session context aggregation**

In `src-tauri/src/db/mod.rs`, add this method to the `impl Database` block (near the other dashboard queries):

```rust
    pub fn get_context_aggregation(
        &self,
        from_date: &str,
        to_date: &str,
    ) -> Result<Vec<(String, i64, i64, i64, i64, f64, String)>, AppError> {
        // Returns (source_session_id, total_input, total_cached, peak_input, total_output, total_cost, last_seen_day)
        let conn = self.conn.lock().map_err(|e| AppError::Database(e.to_string()))?;
        let mut stmt = conn.prepare(
            "SELECT source_session_id, total_input_tokens, total_cached_input_tokens,
                    peak_input_tokens, total_output_tokens, total_cost_usd,
                    SUBSTR(last_seen_at, 1, 10) as day
             FROM sessions
             WHERE last_seen_at >= ?1 AND first_seen_at <= ?2
               AND total_input_tokens > 0
               AND source_session_id IS NOT NULL
             ORDER BY last_seen_at ASC",
        )?;
        let rows = stmt
            .query_map(rusqlite::params![from_date, to_date], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, i64>(1)?,
                    row.get::<_, i64>(2)?,
                    row.get::<_, i64>(3)?,
                    row.get::<_, i64>(4)?,
                    row.get::<_, f64>(5)?,
                    row.get::<_, String>(6)?,
                ))
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }
```

- [ ] **Step 2: Add dashboard context command**

In `src-tauri/src/commands/context.rs`, add these imports at the top of the file (alongside the existing `use` statements from Task 5):

```rust
use crate::commands::dashboard::TimeRange;
use crate::models::context::{DashboardContextSummary, DailyContextPoint, FillBucket};
use std::collections::BTreeMap;
```

Then append the following function at the end of the file (after `empty_stats()`):

#[tauri::command]
pub async fn get_dashboard_context_summary(
    state: State<'_, AppState>,
    range: TimeRange,
) -> Result<DashboardContextSummary, AppError> {
    let (from, to) = range.to_date_range();
    let pricing = state.database().get_model_pricing().unwrap_or_default();
    let rows = state.database().get_context_aggregation(&from, &to)?;

    if rows.is_empty() {
        return Ok(DashboardContextSummary {
            avg_peak_fill_pct: None,
            avg_cache_hit_rate: 0.0,
            total_cache_savings_usd: 0.0,
            cache_savings_pct: 0.0,
            fill_distribution: default_fill_distribution(),
            daily_avg_fill: Vec::new(),
            daily_avg_cache_rate: Vec::new(),
        });
    }

    let mut total_cache_savings = 0.0;
    let mut total_input_cost = 0.0;
    let mut fill_pcts: Vec<f64> = Vec::new();
    let mut cache_rates: Vec<f64> = Vec::new();
    let mut buckets = [0i64; 5]; // 0-25, 25-50, 50-75, 75-90, 90+

    // Daily aggregation
    let mut daily_fills: BTreeMap<String, Vec<f64>> = BTreeMap::new();
    let mut daily_caches: BTreeMap<String, Vec<f64>> = BTreeMap::new();

    for (_session_id, total_input, total_cached, peak_input, _total_output, total_cost, day) in &rows {
        let total_input = *total_input;
        let total_cached = *total_cached;
        let peak_input = *peak_input;

        // Cache hit rate for this session
        let cache_rate = if total_input > 0 {
            total_cached as f64 / total_input as f64
        } else {
            0.0
        };
        cache_rates.push(cache_rate);

        // Cache savings estimate: cached tokens * (input_rate - cache_read_rate) / 1M
        // Use first matching pricing for estimate
        let input_rate = pricing.first().map(|p| p.input_per_million).unwrap_or(5.0);
        let cache_rate_price = pricing.first().map(|p| p.cache_read_per_million).unwrap_or(0.5);
        let savings = total_cached as f64 / 1_000_000.0 * (input_rate - cache_rate_price);
        total_cache_savings += savings;
        total_input_cost += *total_cost;

        // Fill percentage (if we have peak_input and a known limit)
        let context_limit = pricing.first().map(|p| p.context_limit).unwrap_or(200_000);
        let fill_pct = if context_limit > 0 {
            peak_input as f64 / context_limit as f64 * 100.0
        } else {
            0.0
        };
        fill_pcts.push(fill_pct);

        // Bucket
        let bucket_idx = if fill_pct < 25.0 { 0 }
            else if fill_pct < 50.0 { 1 }
            else if fill_pct < 75.0 { 2 }
            else if fill_pct < 90.0 { 3 }
            else { 4 };
        buckets[bucket_idx] += 1;

        // Daily
        daily_fills.entry(day.clone()).or_default().push(fill_pct);
        daily_caches.entry(day.clone()).or_default().push(cache_rate * 100.0);
    }

    let avg_peak_fill = if fill_pcts.is_empty() {
        None
    } else {
        Some(fill_pcts.iter().sum::<f64>() / fill_pcts.len() as f64)
    };

    let avg_cache_hit = if cache_rates.is_empty() {
        0.0
    } else {
        cache_rates.iter().sum::<f64>() / cache_rates.len() as f64
    };

    let cache_savings_pct = if total_input_cost > 0.0 {
        total_cache_savings / total_input_cost * 100.0
    } else {
        0.0
    };

    let fill_distribution = vec![
        FillBucket { label: "0–25%".to_string(), min_pct: 0.0, max_pct: 25.0, session_count: buckets[0] },
        FillBucket { label: "25–50%".to_string(), min_pct: 25.0, max_pct: 50.0, session_count: buckets[1] },
        FillBucket { label: "50–75%".to_string(), min_pct: 50.0, max_pct: 75.0, session_count: buckets[2] },
        FillBucket { label: "75–90%".to_string(), min_pct: 75.0, max_pct: 90.0, session_count: buckets[3] },
        FillBucket { label: "90%+".to_string(), min_pct: 90.0, max_pct: 100.0, session_count: buckets[4] },
    ];

    let daily_avg_fill: Vec<DailyContextPoint> = daily_fills
        .into_iter()
        .map(|(day, vals)| DailyContextPoint {
            day,
            value: vals.iter().sum::<f64>() / vals.len() as f64,
        })
        .collect();

    let daily_avg_cache_rate: Vec<DailyContextPoint> = daily_caches
        .into_iter()
        .map(|(day, vals)| DailyContextPoint {
            day,
            value: vals.iter().sum::<f64>() / vals.len() as f64,
        })
        .collect();

    Ok(DashboardContextSummary {
        avg_peak_fill_pct: avg_peak_fill,
        avg_cache_hit_rate: avg_cache_hit,
        total_cache_savings_usd: total_cache_savings,
        cache_savings_pct,
        fill_distribution,
        daily_avg_fill,
        daily_avg_cache_rate,
    })
}

fn default_fill_distribution() -> Vec<FillBucket> {
    vec![
        FillBucket { label: "0–25%".to_string(), min_pct: 0.0, max_pct: 25.0, session_count: 0 },
        FillBucket { label: "25–50%".to_string(), min_pct: 25.0, max_pct: 50.0, session_count: 0 },
        FillBucket { label: "50–75%".to_string(), min_pct: 50.0, max_pct: 75.0, session_count: 0 },
        FillBucket { label: "75–90%".to_string(), min_pct: 75.0, max_pct: 90.0, session_count: 0 },
        FillBucket { label: "90%+".to_string(), min_pct: 90.0, max_pct: 100.0, session_count: 0 },
    ]
}
```

- [ ] **Step 3: Verify it compiles**

Run: `cd src-tauri && cargo check`
Expected: compiles without errors.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/commands/context.rs src-tauri/src/db/mod.rs
git commit -m "feat(backend): implement get_dashboard_context_summary command"
```

---

### Task 7: Compute peak_input_tokens During Import

Ensure `peak_input_tokens` is populated when sessions are enriched from JSONL.

**Files:**
- Modify: `src-tauri/src/jsonl/types.rs`
- Modify: `src-tauri/src/jsonl/normalize.rs`
- Modify: `src-tauri/src/jsonl/import.rs` (the upsert SQL that writes sessions)

- [ ] **Step 1: Add peak_input_tokens to EnrichedSession**

In `src-tauri/src/jsonl/types.rs`, add `peak_input_tokens` to the `EnrichedSession` struct (after `total_cost_usd`):

```rust
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
    pub peak_input_tokens: i64,
}
```

- [ ] **Step 2: Compute peak_input_tokens in normalize_session_file**

In `src-tauri/src/jsonl/normalize.rs`, find the `normalize_session_file` function. Locate where the assistant turn token totals are accumulated (the loop that computes `total_input`, `total_output`, etc.). Add a `peak_input` tracker:

Near the variable declarations for totals (around where `total_input`, `total_output` etc. are declared), add:
```rust
let mut peak_input: i64 = 0;
```

Inside the loop that processes assistant entries (where `total_input += input;`), add:
```rust
if input > peak_input {
    peak_input = input;
}
```

Then in the `EnrichedSession` construction (around line 328), add:
```rust
peak_input_tokens: peak_input,
```

- [ ] **Step 3: Update the session upsert SQL in import.rs**

Find the SQL that inserts/updates sessions in `src-tauri/src/jsonl/import.rs`. The `INSERT INTO sessions ... ON CONFLICT` statement needs `peak_input_tokens` added to both the column list and the values/update clause.

Search for `peak_input_tokens` in import.rs — if it's not there, find the INSERT statement and add the column. The pattern will be something like:

```sql
INSERT INTO sessions (..., peak_input_tokens, ...)
VALUES (..., ?N, ...)
ON CONFLICT(source_session_id) DO UPDATE SET
  ..., peak_input_tokens = MAX(sessions.peak_input_tokens, excluded.peak_input_tokens), ...
```

Use `MAX` in the ON CONFLICT to keep the highest peak across reimports.

- [ ] **Step 4: Verify it compiles**

Run: `cd src-tauri && cargo check`
Expected: compiles without errors.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/jsonl/types.rs src-tauri/src/jsonl/normalize.rs src-tauri/src/jsonl/import.rs
git commit -m "feat(import): compute and store peak_input_tokens during session enrichment"
```

---

### Task 8: Register Commands in lib.rs

**Files:**
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Add context commands to the handler**

In `src-tauri/src/lib.rs`, add the two new commands to the `tauri::generate_handler![]` list (around line 136, before the closing `]`):

```rust
            commands::context::get_session_context_stats,
            commands::context::get_dashboard_context_summary,
```

- [ ] **Step 2: Verify the full app builds**

Run: `cd src-tauri && cargo build`
Expected: builds successfully.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "feat(tauri): register context monitor commands"
```

---

### Task 9: TypeScript Types and Tauri Wrappers

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/lib/tauri.ts`

- [ ] **Step 1: Add TypeScript interfaces**

In `src/types/index.ts`, add after the `DayWorklogProject` interface (end of file):

```typescript
// ── Context Monitor Types ────────────────────────────────────

export interface TurnContextPoint {
  turn: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
  is_compaction: boolean;
}

export interface SessionContextStats {
  context_limit: number | null;
  peak_input_tokens: number;
  peak_fill_pct: number | null;
  avg_fill_pct: number | null;
  cache_hit_rate: number;
  cache_savings_usd: number;
  compaction_count: number;
  turns: TurnContextPoint[];
}

export interface FillBucket {
  label: string;
  min_pct: number;
  max_pct: number;
  session_count: number;
}

export interface DailyContextPoint {
  day: string;
  value: number;
}

export interface DashboardContextSummary {
  avg_peak_fill_pct: number | null;
  avg_cache_hit_rate: number;
  total_cache_savings_usd: number;
  cache_savings_pct: number;
  fill_distribution: FillBucket[];
  daily_avg_fill: DailyContextPoint[];
  daily_avg_cache_rate: DailyContextPoint[];
}
```

- [ ] **Step 2: Update ModelPricing interface**

In `src/types/index.ts`, add `context_limit` to the `ModelPricing` interface:

```typescript
export interface ModelPricing {
  model_key: string;
  display_name: string;
  input_per_million: number;
  output_per_million: number;
  cache_read_per_million: number;
  cache_write_per_million: number;
  context_limit: number;
}
```

- [ ] **Step 3: Add Tauri command wrappers**

In `src/lib/tauri.ts`, add the imports and functions. First update the type import to include the new types:

```typescript
import type {
  // ... existing imports ...
  SessionContextStats,
  DashboardContextSummary,
} from '../types';
```

Then add at the end of the file:

```typescript
// ── Context Monitor Commands ──────────────────────────────────

export async function getSessionContextStats(
  sourceSessionId: string
): Promise<SessionContextStats> {
  return invoke<SessionContextStats>('get_session_context_stats', { sourceSessionId });
}

export async function getDashboardContextSummary(
  range: TimeRange
): Promise<DashboardContextSummary> {
  return invoke<DashboardContextSummary>('get_dashboard_context_summary', { range });
}
```

- [ ] **Step 4: Update updateModelPricing wrapper**

In `src/lib/tauri.ts`, update the `updateModelPricing` function to include `contextLimit`:

```typescript
export async function updateModelPricing(
  modelKey: string,
  inputPerMillion: number,
  outputPerMillion: number,
  cacheReadPerMillion: number,
  cacheWritePerMillion: number,
  contextLimit: number,
): Promise<void> {
  return invoke('update_model_pricing', {
    modelKey,
    inputPerMillion,
    outputPerMillion,
    cacheReadPerMillion,
    cacheWritePerMillion,
    contextLimit,
  });
}
```

- [ ] **Step 5: Commit**

```bash
git add src/types/index.ts src/lib/tauri.ts
git commit -m "feat(frontend): add context monitor TypeScript types and Tauri wrappers"
```

---

### Task 10: Frontend Hooks

**Files:**
- Create: `src/hooks/useSessionContext.ts`
- Create: `src/hooks/useDashboardContext.ts`

- [ ] **Step 1: Create useSessionContext hook**

Create `src/hooks/useSessionContext.ts`:

```typescript
import { useState, useEffect, useCallback } from 'react';
import type { SessionContextStats } from '../types';
import { getSessionContextStats } from '../lib/tauri';
import { useTauriEvent } from './useTauriEvent';

interface SessionContextData {
  stats: SessionContextStats | null;
  loading: boolean;
  error: string | null;
}

export function useSessionContext(sourceSessionId: string | null): SessionContextData {
  const [stats, setStats] = useState<SessionContextStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!sourceSessionId) {
      setStats(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await getSessionContextStats(sourceSessionId);
      setStats(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [sourceSessionId]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  const handleDbUpdate = useCallback(() => {
    fetch();
  }, [fetch]);

  useTauriEvent('db-updated', handleDbUpdate);

  return { stats, loading, error };
}
```

- [ ] **Step 2: Create useDashboardContext hook**

Create `src/hooks/useDashboardContext.ts`:

```typescript
import { useState, useEffect, useCallback } from 'react';
import type { DashboardContextSummary, TimeRange } from '../types';
import { getDashboardContextSummary } from '../lib/tauri';
import { useTauriEvent } from './useTauriEvent';

interface DashboardContextData {
  summary: DashboardContextSummary | null;
  loading: boolean;
  error: string | null;
}

export function useDashboardContext(range: TimeRange): DashboardContextData {
  const [summary, setSummary] = useState<DashboardContextSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setError(null);
    try {
      const data = await getDashboardContextSummary(range);
      setSummary(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    setLoading(true);
    fetch();
  }, [fetch]);

  const handleDbUpdate = useCallback(() => {
    fetch();
  }, [fetch]);

  useTauriEvent('db-updated', handleDbUpdate);

  return { summary, loading, error };
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no type errors (some existing warnings may be present).

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useSessionContext.ts src/hooks/useDashboardContext.ts
git commit -m "feat(hooks): add useSessionContext and useDashboardContext hooks"
```

---

### Task 11: Settings UI — Context Limit Column

**Files:**
- Modify: `src/pages/SettingsPage.tsx`

- [ ] **Step 1: Update the grid from 5 to 6 columns**

In `src/pages/SettingsPage.tsx`, change the header grid and row grids from `grid-cols-5` to `grid-cols-6`.

Find the header (around line 274):
```tsx
<div className="grid grid-cols-5 gap-2 text-[10px] text-text-secondary font-medium">
  <span>Model</span>
  <span>Input</span>
  <span>Output</span>
  <span>Cache Read</span>
  <span>Cache Write</span>
</div>
```

Replace with:
```tsx
<div className="grid grid-cols-6 gap-2 text-[10px] text-text-secondary font-medium">
  <span>Model</span>
  <span>Input</span>
  <span>Output</span>
  <span>Cache Read</span>
  <span>Cache Write</span>
  <span>Context Limit</span>
</div>
```

- [ ] **Step 2: Update row grid and add context_limit input**

Find the row grid (around line 284):
```tsx
<div key={p.model_key} className="grid grid-cols-5 gap-2 items-center">
```

Change to `grid-cols-6` and add a context_limit input after the cache_write input:

```tsx
<input
  type="number"
  step="1000"
  min="0"
  value={p.context_limit}
  onChange={(e) => updateField(i, 'context_limit', e.target.value)}
  className="px-3 py-1 rounded-full bg-[var(--input-bg)] border border-[var(--input-border)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--input-border-focus)] w-full"
/>
```

- [ ] **Step 3: Update hasPricingChanges check**

In the `hasPricingChanges` comparison (around line 65), add `context_limit`:

```typescript
const hasPricingChanges = pricing.some((p, i) => {
  const e = editedPricing[i];
  if (!e) return false;
  return (
    p.input_per_million !== e.input_per_million ||
    p.output_per_million !== e.output_per_million ||
    p.cache_read_per_million !== e.cache_read_per_million ||
    p.cache_write_per_million !== e.cache_write_per_million ||
    p.context_limit !== e.context_limit
  );
});
```

- [ ] **Step 4: Update handleSavePricing to pass context_limit**

In `handleSavePricing` (around line 89), update the `updateModelPricing` call to include `context_limit`:

```typescript
await updateModelPricing(
  edited.model_key,
  edited.input_per_million,
  edited.output_per_million,
  edited.cache_read_per_million,
  edited.cache_write_per_million,
  edited.context_limit,
);
```

Also update the change-detection `if` inside the loop to check `context_limit`:

```typescript
if (
  orig.input_per_million !== edited.input_per_million ||
  orig.output_per_million !== edited.output_per_million ||
  orig.cache_read_per_million !== edited.cache_read_per_million ||
  orig.cache_write_per_million !== edited.cache_write_per_million ||
  orig.context_limit !== edited.context_limit
) {
```

- [ ] **Step 5: Update updateField handler**

Find the `updateField` function (around line 118). It likely parses `parseFloat`. For `context_limit`, use `parseInt` instead. Update the function to handle this:

```typescript
const updateField = (
  index: number,
  field: keyof ModelPricing,
  value: string,
) => {
  setEditedPricing((prev) =>
    prev.map((p, i) =>
      i === index
        ? { ...p, [field]: field === 'context_limit' ? parseInt(value, 10) || 0 : parseFloat(value) || 0 }
        : p,
    ),
  );
};
```

- [ ] **Step 6: Verify in browser**

Run: `npm run dev` (or `cargo tauri dev`)
Navigate to Settings page. Verify the new "Context Limit" column appears with 200000 values for each model. Change a value, verify Save button activates.

- [ ] **Step 7: Commit**

```bash
git add src/pages/SettingsPage.tsx
git commit -m "feat(settings): add context limit column to model pricing table"
```

---

### Task 12: ContextMonitor Component (Session Detail)

The collapsible context monitor section for the session detail panel.

**Files:**
- Create: `src/features/sessions/ContextMonitor.tsx`
- Modify: `src/features/sessions/SessionDetailPanel.tsx`

- [ ] **Step 1: Create ContextMonitor component**

Create `src/features/sessions/ContextMonitor.tsx`:

```tsx
import { useState } from 'react';
import { ChevronRight, Activity } from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, ReferenceLine,
} from 'recharts';
import type { SessionContextStats } from '../../types';
import { useChartColors } from '../../hooks/useChartColors';

interface ContextMonitorProps {
  stats: SessionContextStats;
}

function formatTokensShort(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toString();
}

export function ContextMonitor({ stats }: ContextMonitorProps) {
  const [expanded, setExpanded] = useState(false);
  const colors = useChartColors();

  if (stats.turns.length === 0) return null;

  const fillPct = stats.peak_fill_pct ?? 0;
  const fillLabel = stats.context_limit
    ? `${formatTokensShort(stats.peak_input_tokens)} / ${formatTokensShort(stats.context_limit)} (${fillPct.toFixed(0)}%)`
    : `${formatTokensShort(stats.peak_input_tokens)} peak`;

  const gaugeWidth = stats.context_limit
    ? Math.min(100, (stats.peak_input_tokens / stats.context_limit) * 100)
    : 50;

  const chartData = stats.turns.map((t) => ({
    turn: t.turn,
    input: t.input_tokens,
    cacheRead: t.cache_read_tokens,
    output: t.output_tokens,
    isCompaction: t.is_compaction,
  }));

  const compactionTurns = stats.turns.filter((t) => t.is_compaction).map((t) => t.turn);

  const tooltipStyle: React.CSSProperties = {
    backgroundColor: colors.tooltipBg,
    border: `1px solid ${colors.tooltipBorder}`,
    borderRadius: 8,
    boxShadow: colors.tooltipShadow,
    color: colors.tooltipText,
    fontSize: 11,
    padding: '8px 12px',
  };

  return (
    <section className="glass-card glow-cyan space-y-2.5 px-5 py-4">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between w-full text-left"
      >
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--text-primary)]">
          <Activity size={13} strokeWidth={2} className="text-accent-cyan" />
          Context Monitor
        </span>
        <span className="inline-flex items-center gap-1 text-[10px] text-accent-cyan">
          <ChevronRight
            size={12}
            className={`transition-transform ${expanded ? 'rotate-90' : ''}`}
          />
          {expanded ? 'Hide' : 'Show'} details
        </span>
      </button>

      {/* Gauge bar */}
      <div>
        <div className="h-5 bg-[var(--bg-primary)]/60 rounded-full overflow-hidden relative">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${gaugeWidth}%`,
              background:
                gaugeWidth > 90
                  ? 'linear-gradient(90deg, #238636, #3fb950, #58a6ff, #d29922, #f85149)'
                  : gaugeWidth > 75
                    ? 'linear-gradient(90deg, #238636, #3fb950, #58a6ff, #d29922)'
                    : 'linear-gradient(90deg, #238636, #3fb950, #58a6ff)',
            }}
          />
          <span className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold text-white mix-blend-difference">
            {fillLabel}
          </span>
        </div>
      </div>

      {/* Summary stats (always visible) */}
      <div className="flex gap-2">
        <div className="flex-1 text-center py-1.5 rounded-md bg-[var(--bg-primary)]/40">
          <div className="text-sm font-bold text-accent-cyan">
            {fillPct > 0 ? `${fillPct.toFixed(0)}%` : '—'}
          </div>
          <div className="text-[9px] text-[var(--text-secondary)]">Peak fill</div>
        </div>
        <div className="flex-1 text-center py-1.5 rounded-md bg-[var(--bg-primary)]/40">
          <div className="text-sm font-bold text-green-400">
            {(stats.cache_hit_rate * 100).toFixed(0)}%
          </div>
          <div className="text-[9px] text-[var(--text-secondary)]">Cache hit</div>
        </div>
        <div className="flex-1 text-center py-1.5 rounded-md bg-[var(--bg-primary)]/40">
          <div className="text-sm font-bold text-orange-400">
            {stats.compaction_count}
          </div>
          <div className="text-[9px] text-[var(--text-secondary)]">Compactions</div>
        </div>
      </div>

      {/* Expanded: chart + extended stats */}
      {expanded && (
        <div className="space-y-2.5 pt-1">
          {/* Area chart */}
          <div className="rounded-lg bg-[var(--bg-primary)]/40 p-3">
            <div className="text-[9px] text-[var(--text-secondary)] font-medium uppercase tracking-wider mb-2">
              Context usage per turn
            </div>
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="grad-ctx-input" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#58a6ff" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#58a6ff" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="grad-ctx-cache" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3fb950" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#3fb950" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={colors.grid} strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="turn"
                  stroke={colors.axis}
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tickFormatter={formatTokensShort}
                  stroke={colors.axis}
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  width={42}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelFormatter={(v) => `Turn ${v}`}
                  formatter={(value: number, name: string) => {
                    const labels: Record<string, string> = {
                      input: 'Input tokens',
                      cacheRead: 'Cache read',
                      output: 'Output tokens',
                    };
                    return [formatTokensShort(value), labels[name] ?? name];
                  }}
                  itemSorter={() => 0}
                />
                {stats.context_limit && (
                  <ReferenceLine
                    y={stats.context_limit}
                    stroke="#f85149"
                    strokeDasharray="6 3"
                    strokeWidth={1.5}
                    label={{ value: 'Limit', position: 'right', fill: '#f85149', fontSize: 9 }}
                  />
                )}
                {compactionTurns.map((turn) => (
                  <ReferenceLine
                    key={turn}
                    x={turn}
                    stroke="#f0883e"
                    strokeDasharray="4 3"
                    strokeWidth={1}
                  />
                ))}
                <Area
                  type="monotone"
                  dataKey="input"
                  stroke="#58a6ff"
                  strokeWidth={2}
                  fill="url(#grad-ctx-input)"
                  dot={false}
                  activeDot={{ r: 3, fill: '#58a6ff', stroke: 'var(--bg-primary)', strokeWidth: 2 }}
                />
                <Area
                  type="monotone"
                  dataKey="cacheRead"
                  stroke="#3fb950"
                  strokeWidth={1.5}
                  fill="url(#grad-ctx-cache)"
                  dot={false}
                  activeDot={{ r: 3, fill: '#3fb950', stroke: 'var(--bg-primary)', strokeWidth: 2 }}
                />
                <Area
                  type="monotone"
                  dataKey="output"
                  stroke="transparent"
                  fill="transparent"
                  dot={false}
                  activeDot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
            {/* Legend */}
            <div className="flex gap-4 mt-2 text-[9px] text-[var(--text-secondary)]">
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-0.5 rounded-full bg-[#58a6ff] inline-block" />
                Total input
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-0.5 rounded-full bg-[#3fb950] inline-block" />
                Cache hit
              </span>
              {stats.compaction_count > 0 && (
                <span className="inline-flex items-center gap-1">
                  <span className="w-2.5 h-0.5 rounded-full bg-[#f0883e] inline-block" style={{ borderTop: '1px dashed #f0883e' }} />
                  Compaction
                </span>
              )}
              {stats.context_limit && (
                <span className="inline-flex items-center gap-1">
                  <span className="w-2.5 h-0.5 inline-block" style={{ borderTop: '1px dashed #f85149' }} />
                  Model limit
                </span>
              )}
            </div>
          </div>

          {/* Extended stats */}
          <div className="flex gap-1.5">
            <div className="flex-1 text-center py-2 rounded-md bg-[var(--bg-primary)]/40">
              <div className="text-xs font-bold text-accent-cyan">
                {fillPct > 0 ? `${fillPct.toFixed(0)}%` : '—'}
              </div>
              <div className="text-[8px] text-[var(--text-secondary)]">Peak fill</div>
            </div>
            <div className="flex-1 text-center py-2 rounded-md bg-[var(--bg-primary)]/40">
              <div className="text-xs font-bold text-[var(--text-primary)]">
                {stats.avg_fill_pct != null ? `${stats.avg_fill_pct.toFixed(0)}%` : '—'}
              </div>
              <div className="text-[8px] text-[var(--text-secondary)]">Avg fill</div>
            </div>
            <div className="flex-1 text-center py-2 rounded-md bg-[var(--bg-primary)]/40">
              <div className="text-xs font-bold text-green-400">
                {(stats.cache_hit_rate * 100).toFixed(0)}%
              </div>
              <div className="text-[8px] text-[var(--text-secondary)]">Cache hit</div>
            </div>
            <div className="flex-1 text-center py-2 rounded-md bg-[var(--bg-primary)]/40">
              <div className="text-xs font-bold text-green-400">
                ${stats.cache_savings_usd.toFixed(2)}
              </div>
              <div className="text-[8px] text-[var(--text-secondary)]">Cache saved</div>
            </div>
            <div className="flex-1 text-center py-2 rounded-md bg-[var(--bg-primary)]/40">
              <div className="text-xs font-bold text-orange-400">
                {stats.compaction_count}
              </div>
              <div className="text-[8px] text-[var(--text-secondary)]">Compactions</div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Integrate into SessionDetailPanel**

In `src/features/sessions/SessionDetailPanel.tsx`:

Add imports at the top:
```tsx
import { ContextMonitor } from './ContextMonitor';
import { useSessionContext } from '../../hooks/useSessionContext';
```

Inside the component, add the hook call (near other hook calls):
```tsx
const { stats: contextStats } = useSessionContext(session?.source_session_id ?? null);
```

Insert the component between the stats `</section>` and the Messages `<section>` (between lines 759 and 761):
```tsx
              {contextStats && contextStats.turns.length > 0 && (
                <ContextMonitor stats={contextStats} />
              )}
```

- [ ] **Step 3: Verify in browser**

Run: `cargo tauri dev`
Open a session with message data. Verify the Context Monitor section appears with gauge and stats. Click "Show details" to expand the chart.

- [ ] **Step 4: Commit**

```bash
git add src/features/sessions/ContextMonitor.tsx src/features/sessions/SessionDetailPanel.tsx
git commit -m "feat(sessions): add collapsible Context Monitor to session detail panel"
```

---

### Task 13: ContextOverviewCard Component (Dashboard)

The dashboard widget showing aggregated context and cache stats.

**Files:**
- Create: `src/features/dashboard/ContextOverviewCard.tsx`
- Modify: `src/pages/DashboardPage.tsx`

- [ ] **Step 1: Create ContextOverviewCard**

Create `src/features/dashboard/ContextOverviewCard.tsx`:

```tsx
import { Activity } from 'lucide-react';
import type { DashboardContextSummary } from '../../types';
import { SparklineArea } from '../../components/ui/SparklineArea';

interface ContextOverviewCardProps {
  summary: DashboardContextSummary;
}

const BUCKET_COLORS = ['#238636', '#3fb950', '#58a6ff', '#d29922', '#f85149'];

export function ContextOverviewCard({ summary }: ContextOverviewCardProps) {
  const maxBucketCount = Math.max(1, ...summary.fill_distribution.map((b) => b.session_count));

  return (
    <div className="glass-card glow-cyan p-5">
      <div className="flex items-center justify-between mb-4">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--text-primary)]">
          <Activity size={13} strokeWidth={2} className="text-accent-cyan" />
          Context &amp; Cache Overview
        </span>
      </div>

      <div className="flex gap-5">
        {/* Left: metric cards */}
        <div className="flex-1 flex flex-col gap-2.5">
          {/* Avg Context Fill */}
          <div className="flex items-center justify-between rounded-lg bg-[var(--bg-primary)]/40 px-3 py-2.5">
            <div>
              <div className="text-[9px] text-[var(--text-secondary)]">Avg Context Fill</div>
              <div className="text-lg font-bold text-accent-cyan">
                {summary.avg_peak_fill_pct != null ? `${summary.avg_peak_fill_pct.toFixed(0)}%` : '—'}
              </div>
            </div>
            {summary.daily_avg_fill.length > 1 && (
              <SparklineArea
                data={summary.daily_avg_fill.map((d) => d.value)}
                width={60}
                height={24}
                color="#22d3ee"
              />
            )}
          </div>

          {/* Avg Cache Hit Rate */}
          <div className="flex items-center justify-between rounded-lg bg-[var(--bg-primary)]/40 px-3 py-2.5">
            <div>
              <div className="text-[9px] text-[var(--text-secondary)]">Avg Cache Hit Rate</div>
              <div className="text-lg font-bold text-green-400">
                {(summary.avg_cache_hit_rate * 100).toFixed(0)}%
              </div>
            </div>
            {summary.daily_avg_cache_rate.length > 1 && (
              <SparklineArea
                data={summary.daily_avg_cache_rate.map((d) => d.value)}
                width={60}
                height={24}
                color="#4ade80"
              />
            )}
          </div>

          {/* Total Cache Savings */}
          <div className="flex items-center justify-between rounded-lg bg-[var(--bg-primary)]/40 px-3 py-2.5">
            <div>
              <div className="text-[9px] text-[var(--text-secondary)]">Total Cache Savings</div>
              <div className="text-lg font-bold text-green-400">
                ${summary.total_cache_savings_usd.toFixed(2)}
              </div>
            </div>
            <span className="text-[10px] text-green-400/70">
              {summary.cache_savings_pct.toFixed(0)}% of input cost
            </span>
          </div>
        </div>

        {/* Right: fill distribution */}
        <div className="flex-[1.5] rounded-lg bg-[var(--bg-primary)]/40 px-4 py-3">
          <div className="text-[9px] text-[var(--text-secondary)] font-medium uppercase tracking-wider mb-3">
            Context fill distribution
          </div>
          <div className="flex flex-col gap-1.5">
            {summary.fill_distribution.map((bucket, i) => (
              <div key={bucket.label} className="flex items-center gap-2 text-[11px]">
                <span className="w-12 text-right text-[var(--text-secondary)] shrink-0">
                  {bucket.label}
                </span>
                <div className="flex-1 h-3.5 bg-[var(--bg-card)] rounded overflow-hidden">
                  <div
                    className="h-full rounded transition-all duration-300"
                    style={{
                      width: `${(bucket.session_count / maxBucketCount) * 100}%`,
                      backgroundColor: BUCKET_COLORS[i],
                      minWidth: bucket.session_count > 0 ? 4 : 0,
                    }}
                  />
                </div>
                <span className="w-5 text-[var(--text-secondary)] text-right shrink-0">
                  {bucket.session_count}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Integrate into DashboardPage**

In `src/pages/DashboardPage.tsx`, add imports:

```tsx
import { ContextOverviewCard } from '../features/dashboard/ContextOverviewCard';
import { useDashboardContext } from '../hooks/useDashboardContext';
```

Inside `DashboardPage`, add the hook call alongside existing hooks:
```tsx
const { summary: contextSummary } = useDashboardContext(range);
```

Insert the widget after `<BentoSummary>` and before `<DailyHeatmap>` (between lines 74 and 76):
```tsx
          {/* Context & Cache overview */}
          {contextSummary && (
            <ContextOverviewCard summary={contextSummary} />
          )}
```

- [ ] **Step 3: Verify in browser**

Run: `cargo tauri dev`
Open the Dashboard. Verify the Context & Cache Overview widget appears between the Bento summary cards and the heatmap. Check that stats and the fill distribution chart render correctly.

- [ ] **Step 4: Commit**

```bash
git add src/features/dashboard/ContextOverviewCard.tsx src/pages/DashboardPage.tsx
git commit -m "feat(dashboard): add Context & Cache Overview widget"
```

---

### Task 14: End-to-End Verification

**Files:** None (testing only)

- [ ] **Step 1: Full build**

Run: `cargo tauri build --debug`
Expected: builds successfully.

- [ ] **Step 2: Test session detail context monitor**

1. Open the app
2. Go to Sessions page
3. Click a session with multiple turns
4. Verify: Context Monitor section visible between stats and conversation
5. Verify: gauge bar shows peak tokens / limit
6. Verify: three summary stats show values
7. Click "Show details" — area chart renders with turn data
8. Verify: compaction markers visible (if session has compaction events)
9. Verify: limit line appears (red dashed)
10. Hover chart — tooltip shows turn number, input tokens, cache read

- [ ] **Step 3: Test dashboard widget**

1. Go to Dashboard
2. Verify: Context & Cache Overview widget visible
3. Verify: three left-side metrics show values with sparklines
4. Verify: fill distribution bars render with correct colors
5. Change time range — verify data updates

- [ ] **Step 4: Test settings context limit**

1. Go to Settings
2. Verify: Context Limit column appears in pricing table
3. Change Opus limit to 150000
4. Click Save
5. Go back to a session — verify gauge now uses 150000 as the limit

- [ ] **Step 5: Test edge cases**

1. Open a session with only 1 turn — verify it renders without crashing
2. Open a session with no JSONL data — verify Context Monitor doesn't show
3. Check a session using an unknown model — verify raw numbers shown without percentages

- [ ] **Step 6: Final commit (if any fixes needed)**

```bash
git add -A
git commit -m "fix: address context monitor edge cases"
```
