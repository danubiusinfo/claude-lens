# Timesheet / Worklog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add user vs. Claude Code work-time tracking ("worklog") to claude-lens, computed turn-by-turn from JSONL message timestamps with a configurable user idle cap; surface it on session list, session detail, dashboard heatmap day-click dialog, and a new dashboard widget.

**Architecture:** Worklog is computed during JSONL import (Rust) and stored in a new `worklogs` table with `(session_id, day)` granularity. Two summable counters: `user_work_seconds` and `claude_work_seconds`. A configurable `idle_threshold_seconds` setting (default 300) caps the user gap per turn. Frontend reads via new Tauri commands and renders with a reusable `WorklogPair` UI component.

**Tech Stack:** Rust + Tauri 2 + rusqlite (backend), React 19 + TypeScript + Tailwind + Framer Motion + Recharts (frontend).

**Spec:** `/Users/beno/.claude/plans/timesheet-funkci-szeretn-k-atomic-pixel.md`

---

## File Structure

**Backend (new):**
- `src-tauri/src/jsonl/worklog.rs` — pure worklog calculation (turn detection, idle cap, day split)
- `src-tauri/src/commands/worklog.rs` — Tauri command handlers

**Backend (modified):**
- `src-tauri/src/db/migrations.rs` — V10 migration (worklogs table + idle_threshold_seconds in app_state)
- `src-tauri/src/db/mod.rs` — DB queries for worklogs + settings getter/setter
- `src-tauri/src/jsonl/mod.rs` — re-export worklog module
- `src-tauri/src/jsonl/types.rs` — `WorklogRow`, `TurnWorklog` types
- `src-tauri/src/jsonl/import.rs` — call calculate_worklog after extract_session_messages
- `src-tauri/src/commands/mod.rs` — re-export worklog commands
- `src-tauri/src/commands/settings.rs` — get/set idle threshold + recompute trigger
- `src-tauri/src/lib.rs` — register new commands

**Frontend (new):**
- `src/lib/duration.ts` — formatDuration helper
- `src/components/ui/WorklogPair.tsx` — reusable user+claude time display
- `src/hooks/useSessionWorklog.ts`
- `src/hooks/useSessionWorklogTurns.ts`
- `src/hooks/useDashboardWorklog.ts`
- `src/hooks/useDayWorklog.ts`
- `src/hooks/useSessionWorklogs.ts`
- `src/features/dashboard/WorklogBentoCard.tsx`
- `src/features/dashboard/DayWorklogDialog.tsx`

**Frontend (modified):**
- `src/types/index.ts` — Worklog types
- `src/lib/tauri.ts` — new command wrappers
- `src/features/sessions/SessionsList.tsx` — show WorklogPair on items
- `src/features/sessions/SessionDetailPanel.tsx` — Worklog section
- `src/features/dashboard/BentoSummary.tsx` — 3-column grid
- `src/features/dashboard/ExpandedWidgetChart.tsx` — worklog widget type
- `src/features/dashboard/DailyHeatmap.tsx` — onClick handler
- `src/pages/SettingsPage.tsx` — idle threshold input

---

## Phase 1: Database & Settings

### Task 1: Add V10 migration

**Files:**
- Modify: `src-tauri/src/db/migrations.rs`

- [ ] **Step 1: Bump CURRENT_VERSION and add V10_UP**

In `src-tauri/src/db/migrations.rs`, change `const CURRENT_VERSION: i64 = 9;` to `const CURRENT_VERSION: i64 = 10;` and add after `V9_UP`:

```rust
const V10_UP: &str = r#"
CREATE TABLE IF NOT EXISTS worklogs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    project_path TEXT,
    day TEXT NOT NULL,
    user_work_seconds INTEGER NOT NULL DEFAULT 0,
    claude_work_seconds INTEGER NOT NULL DEFAULT 0,
    turn_count INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL,
    UNIQUE (session_id, day)
);

CREATE INDEX IF NOT EXISTS idx_worklogs_day ON worklogs(day);
CREATE INDEX IF NOT EXISTS idx_worklogs_session ON worklogs(session_id);
CREATE INDEX IF NOT EXISTS idx_worklogs_project ON worklogs(project_path);

INSERT OR IGNORE INTO app_state (key, value, updated_at)
VALUES ('idle_threshold_seconds', '300', datetime('now'));
"#;
```

- [ ] **Step 2: Apply V10 in run()**

In `run()` function, add after the V9 block:

```rust
    if current < 10 {
        conn.execute_batch(V10_UP)?;
        set_schema_version(conn, 10)?;
        tracing::info!("Applied migration V10 (schema version 10) — worklogs table + idle_threshold setting");
    }
```

- [ ] **Step 3: Build and run app once to apply migration**

Run: `cd src-tauri && cargo check`
Expected: Compiles without errors.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/db/migrations.rs
git commit -m "feat(db): add worklogs table and idle_threshold setting (V10)"
```

---

### Task 2: Add app_state getter/setter for settings

**Files:**
- Modify: `src-tauri/src/db/mod.rs`

- [ ] **Step 1: Add helper methods on Database**

In `src-tauri/src/db/mod.rs`, add inside `impl Database`:

```rust
pub fn get_app_state(&self, key: &str) -> Result<Option<String>, AppError> {
    let conn = self.conn.lock().map_err(|e| AppError::Database(e.to_string()))?;
    let result: Result<String, _> = conn.query_row(
        "SELECT value FROM app_state WHERE key = ?1",
        rusqlite::params![key],
        |row| row.get(0),
    );
    match result {
        Ok(v) => Ok(Some(v)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(AppError::Database(e.to_string())),
    }
}

pub fn set_app_state(&self, key: &str, value: &str) -> Result<(), AppError> {
    let conn = self.conn.lock().map_err(|e| AppError::Database(e.to_string()))?;
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO app_state (key, value, updated_at) VALUES (?1, ?2, ?3)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
        rusqlite::params![key, value, now],
    )?;
    Ok(())
}

pub fn get_idle_threshold_seconds(&self) -> Result<i64, AppError> {
    Ok(self
        .get_app_state("idle_threshold_seconds")?
        .and_then(|v| v.parse::<i64>().ok())
        .unwrap_or(300))
}

pub fn set_idle_threshold_seconds(&self, seconds: i64) -> Result<(), AppError> {
    let clamped = seconds.clamp(60, 3600);
    self.set_app_state("idle_threshold_seconds", &clamped.to_string())
}
```

Note: if the existing Database struct uses a different mutex/connection access pattern, mirror it. Check `src-tauri/src/db/mod.rs` for the canonical pattern (e.g., `self.with_conn(|conn| ...)` or similar) and adapt.

- [ ] **Step 2: Build**

Run: `cd src-tauri && cargo check`
Expected: Compiles without errors.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/db/mod.rs
git commit -m "feat(db): add app_state getter/setter and idle_threshold helpers"
```

---

## Phase 2: Worklog Calculation Module

### Task 3: Add worklog types

**Files:**
- Modify: `src-tauri/src/jsonl/types.rs`

- [ ] **Step 1: Append worklog types**

At the end of `src-tauri/src/jsonl/types.rs`:

```rust
// ── Worklog types ────────────────────────────────────────────────────

/// One worklog row per (session, day).
#[derive(Debug, Clone, Serialize)]
pub struct WorklogRow {
    pub session_id: String,
    pub project_path: Option<String>,
    pub day: String,                    // YYYY-MM-DD (UTC)
    pub user_work_seconds: i64,
    pub claude_work_seconds: i64,
    pub turn_count: i64,
}

/// Per-turn breakdown for a session (used in detail panel).
#[derive(Debug, Clone, Serialize)]
pub struct TurnWorklog {
    pub index: i64,                     // 1-based
    pub user_message_at: String,        // RFC3339
    pub last_assistant_at: String,      // RFC3339
    pub user_seconds: i64,
    pub claude_seconds: i64,
    pub user_capped: bool,
}
```

- [ ] **Step 2: Build**

Run: `cd src-tauri && cargo check`
Expected: Compiles.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/jsonl/types.rs
git commit -m "feat(jsonl): add WorklogRow and TurnWorklog types"
```

---

### Task 4: Create worklog module with calculation

**Files:**
- Create: `src-tauri/src/jsonl/worklog.rs`
- Modify: `src-tauri/src/jsonl/mod.rs`

- [ ] **Step 1: Create `src-tauri/src/jsonl/worklog.rs`**

```rust
use chrono::{DateTime, Duration, NaiveDate, TimeZone, Utc};

use super::types::{SessionMessage, TurnWorklog, WorklogRow};

/// A turn = one user message + all subsequent assistant messages until the next user message.
struct Turn {
    user_at: DateTime<Utc>,
    last_assistant_at: DateTime<Utc>,
}

/// Compute worklog rows (per day) from already-extracted SessionMessage list.
///
/// - `messages` must be sorted by timestamp ascending (caller responsibility).
/// - `idle_threshold_seconds` caps the user gap between turns. The first turn's
///   user_seconds is always 0 (no preceding turn).
/// - Sidechain and is_meta messages are ignored.
/// - Multi-day turns are split at UTC midnight; each day gets its share of seconds.
pub fn calculate_worklog(
    messages: &[SessionMessage],
    idle_threshold_seconds: i64,
    project_path: Option<&str>,
    session_id: &str,
) -> (Vec<WorklogRow>, Vec<TurnWorklog>) {
    let turns = build_turns(messages);
    if turns.is_empty() {
        return (Vec::new(), Vec::new());
    }

    let mut per_day: std::collections::HashMap<String, (i64, i64, i64)> =
        std::collections::HashMap::new();
    let mut turn_breakdowns: Vec<TurnWorklog> = Vec::with_capacity(turns.len());

    let mut prev_assistant_end: Option<DateTime<Utc>> = None;

    for (i, turn) in turns.iter().enumerate() {
        // User work (gap before this turn's user message)
        let (user_seconds, user_capped) = match prev_assistant_end {
            None => (0i64, false),
            Some(prev) => {
                let raw = (turn.user_at - prev).num_seconds().max(0);
                if raw > idle_threshold_seconds {
                    (idle_threshold_seconds, true)
                } else {
                    (raw, false)
                }
            }
        };

        // Claude work (user → last assistant in this turn)
        let claude_seconds = (turn.last_assistant_at - turn.user_at).num_seconds().max(0);

        // Bucket user_seconds onto the user_at day
        let user_day = day_key(turn.user_at);
        bucket_add(&mut per_day, &user_day, user_seconds, 0, 0);

        // Split claude_seconds across days if turn crosses midnight
        for (day, secs) in split_seconds_by_day(turn.user_at, turn.last_assistant_at) {
            bucket_add(&mut per_day, &day, 0, secs, 0);
        }

        // Count this turn against the user_at day
        bucket_add(&mut per_day, &user_day, 0, 0, 1);

        turn_breakdowns.push(TurnWorklog {
            index: (i as i64) + 1,
            user_message_at: turn.user_at.to_rfc3339(),
            last_assistant_at: turn.last_assistant_at.to_rfc3339(),
            user_seconds,
            claude_seconds,
            user_capped,
        });

        prev_assistant_end = Some(turn.last_assistant_at);
    }

    let mut rows: Vec<WorklogRow> = per_day
        .into_iter()
        .map(|(day, (u, c, t))| WorklogRow {
            session_id: session_id.to_string(),
            project_path: project_path.map(|s| s.to_string()),
            day,
            user_work_seconds: u,
            claude_work_seconds: c,
            turn_count: t,
        })
        .collect();

    rows.sort_by(|a, b| a.day.cmp(&b.day));
    (rows, turn_breakdowns)
}

fn build_turns(messages: &[SessionMessage]) -> Vec<Turn> {
    let mut turns: Vec<Turn> = Vec::new();
    let mut current: Option<Turn> = None;

    for msg in messages {
        // Skip sidechain and meta — they distort turn detection.
        let sidechain = msg
            .metadata
            .as_ref()
            .map(|m| m.is_sidechain)
            .unwrap_or(false);
        if sidechain || msg.is_meta {
            continue;
        }

        let ts = match parse_ts(msg.timestamp.as_deref()) {
            Some(t) => t,
            None => continue,
        };

        match msg.role.as_str() {
            "user" => {
                if let Some(t) = current.take() {
                    turns.push(t);
                }
                current = Some(Turn {
                    user_at: ts,
                    last_assistant_at: ts,
                });
            }
            "assistant" => {
                if let Some(t) = current.as_mut() {
                    if ts > t.last_assistant_at {
                        t.last_assistant_at = ts;
                    }
                }
                // assistant before any user → ignore (orphan)
            }
            _ => {}
        }
    }

    if let Some(t) = current {
        turns.push(t);
    }

    turns
}

fn parse_ts(ts: Option<&str>) -> Option<DateTime<Utc>> {
    let s = ts?;
    DateTime::parse_from_rfc3339(s)
        .ok()
        .map(|dt| dt.with_timezone(&Utc))
}

fn day_key(dt: DateTime<Utc>) -> String {
    dt.format("%Y-%m-%d").to_string()
}

fn bucket_add(
    map: &mut std::collections::HashMap<String, (i64, i64, i64)>,
    day: &str,
    user: i64,
    claude: i64,
    turns: i64,
) {
    let entry = map.entry(day.to_string()).or_insert((0, 0, 0));
    entry.0 += user;
    entry.1 += claude;
    entry.2 += turns;
}

/// Split [start, end] into per-UTC-day chunks, returning (day, seconds) pairs.
fn split_seconds_by_day(
    start: DateTime<Utc>,
    end: DateTime<Utc>,
) -> Vec<(String, i64)> {
    if end <= start {
        return vec![(day_key(start), 0)];
    }

    let mut out: Vec<(String, i64)> = Vec::new();
    let mut cursor = start;
    while cursor < end {
        let next_midnight = next_utc_midnight(cursor);
        let chunk_end = if next_midnight < end {
            next_midnight
        } else {
            end
        };
        let secs = (chunk_end - cursor).num_seconds().max(0);
        out.push((day_key(cursor), secs));
        cursor = chunk_end;
    }
    out
}

fn next_utc_midnight(dt: DateTime<Utc>) -> DateTime<Utc> {
    let date = dt.date_naive() + chrono::Duration::days(1);
    Utc.from_utc_datetime(&date.and_hms_opt(0, 0, 0).unwrap())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::jsonl::types::{ContentBlock, MessageMetadata, SessionMessage};

    fn msg(role: &str, ts: &str, sidechain: bool, meta: bool) -> SessionMessage {
        SessionMessage {
            role: role.to_string(),
            timestamp: Some(ts.to_string()),
            content_text: None,
            content_blocks: Vec::new(),
            metadata: Some(MessageMetadata {
                cwd: None,
                git_branch: None,
                version: None,
                is_sidechain: sidechain,
            }),
            model: None,
            input_tokens: 0,
            output_tokens: 0,
            cache_creation_tokens: 0,
            cache_read_tokens: 0,
            cost_usd: 0.0,
            tool_use_count: 0,
            is_meta: meta,
        }
    }

    #[test]
    fn single_turn_one_assistant() {
        let msgs = vec![
            msg("user", "2026-05-04T10:00:00Z", false, false),
            msg("assistant", "2026-05-04T10:00:30Z", false, false),
        ];
        let (rows, turns) = calculate_worklog(&msgs, 300, Some("p"), "s1");
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].user_work_seconds, 0);
        assert_eq!(rows[0].claude_work_seconds, 30);
        assert_eq!(rows[0].turn_count, 1);
        assert_eq!(turns.len(), 1);
        assert_eq!(turns[0].user_seconds, 0);
        assert_eq!(turns[0].claude_seconds, 30);
        assert!(!turns[0].user_capped);
    }

    #[test]
    fn tool_chain_turn_uses_last_assistant() {
        let msgs = vec![
            msg("user", "2026-05-04T10:00:00Z", false, false),
            msg("assistant", "2026-05-04T10:00:30Z", false, false),
            msg("assistant", "2026-05-04T10:01:00Z", false, false),
            msg("assistant", "2026-05-04T10:02:00Z", false, false),
        ];
        let (rows, _) = calculate_worklog(&msgs, 300, None, "s");
        assert_eq!(rows[0].claude_work_seconds, 120);
    }

    #[test]
    fn user_idle_capped_at_threshold() {
        let msgs = vec![
            msg("user", "2026-05-04T10:00:00Z", false, false),
            msg("assistant", "2026-05-04T10:00:30Z", false, false),
            // 30-minute gap before next user — should cap at 300 sec
            msg("user", "2026-05-04T10:30:30Z", false, false),
            msg("assistant", "2026-05-04T10:31:00Z", false, false),
        ];
        let (rows, turns) = calculate_worklog(&msgs, 300, None, "s");
        // First turn: user=0, claude=30
        // Second turn: user=300 (capped from 1800), claude=30
        assert_eq!(rows[0].user_work_seconds, 300);
        assert_eq!(rows[0].claude_work_seconds, 60);
        assert!(turns[1].user_capped);
        assert_eq!(turns[1].user_seconds, 300);
    }

    #[test]
    fn multi_day_turn_splits_at_midnight() {
        let msgs = vec![
            msg("user", "2026-05-04T23:55:00Z", false, false),
            msg("assistant", "2026-05-05T00:30:00Z", false, false),
        ];
        let (rows, _) = calculate_worklog(&msgs, 300, None, "s");
        assert_eq!(rows.len(), 2);
        let r0 = rows.iter().find(|r| r.day == "2026-05-04").unwrap();
        let r1 = rows.iter().find(|r| r.day == "2026-05-05").unwrap();
        assert_eq!(r0.claude_work_seconds, 5 * 60);
        assert_eq!(r1.claude_work_seconds, 30 * 60);
    }

    #[test]
    fn empty_input_returns_empty() {
        let (rows, turns) = calculate_worklog(&[], 300, None, "s");
        assert!(rows.is_empty());
        assert!(turns.is_empty());
    }

    #[test]
    fn assistant_before_user_is_ignored() {
        let msgs = vec![
            msg("assistant", "2026-05-04T10:00:00Z", false, false),
            msg("user", "2026-05-04T10:01:00Z", false, false),
            msg("assistant", "2026-05-04T10:02:00Z", false, false),
        ];
        let (rows, turns) = calculate_worklog(&msgs, 300, None, "s");
        assert_eq!(turns.len(), 1);
        assert_eq!(rows[0].claude_work_seconds, 60);
    }

    #[test]
    fn sidechain_and_meta_skipped() {
        let msgs = vec![
            msg("user", "2026-05-04T10:00:00Z", false, false),
            msg("assistant", "2026-05-04T10:00:30Z", true, false),  // sidechain — skipped
            msg("user", "2026-05-04T10:01:00Z", false, true),       // meta — skipped
            msg("assistant", "2026-05-04T10:02:00Z", false, false),
        ];
        let (rows, _) = calculate_worklog(&msgs, 300, None, "s");
        // Only 1 valid turn: user@10:00 → assistant@10:02
        assert_eq!(rows[0].turn_count, 1);
        assert_eq!(rows[0].claude_work_seconds, 120);
    }
}
```

- [ ] **Step 2: Register module in `src-tauri/src/jsonl/mod.rs`**

Add `pub mod worklog;` near the other `pub mod` declarations.

- [ ] **Step 3: Run unit tests**

Run: `cd src-tauri && cargo test --lib jsonl::worklog`
Expected: All 7 tests pass.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/jsonl/worklog.rs src-tauri/src/jsonl/mod.rs
git commit -m "feat(jsonl): add worklog calculation module with turn-based logic"
```

---

## Phase 3: DB Queries & Import Integration

### Task 5: Add worklog DB queries

**Files:**
- Modify: `src-tauri/src/db/mod.rs`

- [ ] **Step 1: Add upsert + delete methods**

In `impl Database`:

```rust
pub fn upsert_worklog(&self, row: &crate::jsonl::types::WorklogRow) -> Result<(), AppError> {
    let conn = self.conn.lock().map_err(|e| AppError::Database(e.to_string()))?;
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO worklogs (session_id, project_path, day, user_work_seconds, claude_work_seconds, turn_count, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
         ON CONFLICT(session_id, day) DO UPDATE SET
            project_path = excluded.project_path,
            user_work_seconds = excluded.user_work_seconds,
            claude_work_seconds = excluded.claude_work_seconds,
            turn_count = excluded.turn_count,
            updated_at = excluded.updated_at",
        rusqlite::params![
            row.session_id,
            row.project_path,
            row.day,
            row.user_work_seconds,
            row.claude_work_seconds,
            row.turn_count,
            now,
        ],
    )?;
    Ok(())
}

pub fn delete_worklogs_for_session(&self, session_id: &str) -> Result<(), AppError> {
    let conn = self.conn.lock().map_err(|e| AppError::Database(e.to_string()))?;
    conn.execute(
        "DELETE FROM worklogs WHERE session_id = ?1",
        rusqlite::params![session_id],
    )?;
    Ok(())
}

pub fn delete_all_worklogs(&self) -> Result<(), AppError> {
    let conn = self.conn.lock().map_err(|e| AppError::Database(e.to_string()))?;
    conn.execute("DELETE FROM worklogs", [])?;
    Ok(())
}
```

- [ ] **Step 2: Add summary query for one session**

```rust
pub fn get_worklog_summary_for_session(
    &self,
    session_id: &str,
) -> Result<(i64, i64, i64), AppError> {
    let conn = self.conn.lock().map_err(|e| AppError::Database(e.to_string()))?;
    let row: (Option<i64>, Option<i64>, Option<i64>) = conn.query_row(
        "SELECT
            COALESCE(SUM(user_work_seconds), 0),
            COALESCE(SUM(claude_work_seconds), 0),
            COALESCE(SUM(turn_count), 0)
         FROM worklogs WHERE session_id = ?1",
        rusqlite::params![session_id],
        |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
    )?;
    Ok((row.0.unwrap_or(0), row.1.unwrap_or(0), row.2.unwrap_or(0)))
}

pub fn list_worklog_summaries(
    &self,
    session_ids: &[String],
) -> Result<std::collections::HashMap<String, (i64, i64, i64)>, AppError> {
    if session_ids.is_empty() {
        return Ok(std::collections::HashMap::new());
    }
    let conn = self.conn.lock().map_err(|e| AppError::Database(e.to_string()))?;
    let placeholders = vec!["?"; session_ids.len()].join(",");
    let sql = format!(
        "SELECT session_id, SUM(user_work_seconds), SUM(claude_work_seconds), SUM(turn_count)
         FROM worklogs WHERE session_id IN ({})
         GROUP BY session_id",
        placeholders
    );
    let mut stmt = conn.prepare(&sql)?;
    let params: Vec<&dyn rusqlite::ToSql> = session_ids.iter().map(|s| s as &dyn rusqlite::ToSql).collect();
    let rows = stmt.query_map(params.as_slice(), |r| {
        Ok((
            r.get::<_, String>(0)?,
            r.get::<_, Option<i64>>(1)?.unwrap_or(0),
            r.get::<_, Option<i64>>(2)?.unwrap_or(0),
            r.get::<_, Option<i64>>(3)?.unwrap_or(0),
        ))
    })?;
    let mut map = std::collections::HashMap::new();
    for row in rows {
        let (sid, u, c, t) = row?;
        map.insert(sid, (u, c, t));
    }
    Ok(map)
}
```

- [ ] **Step 3: Add range and day queries**

```rust
pub fn get_worklog_summary_for_range(
    &self,
    start_day: &str,
    end_day: &str,
) -> Result<(i64, i64, i64), AppError> {
    let conn = self.conn.lock().map_err(|e| AppError::Database(e.to_string()))?;
    let row: (Option<i64>, Option<i64>, Option<i64>) = conn.query_row(
        "SELECT
            COALESCE(SUM(user_work_seconds), 0),
            COALESCE(SUM(claude_work_seconds), 0),
            COUNT(DISTINCT session_id)
         FROM worklogs WHERE day >= ?1 AND day <= ?2",
        rusqlite::params![start_day, end_day],
        |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
    )?;
    Ok((row.0.unwrap_or(0), row.1.unwrap_or(0), row.2.unwrap_or(0)))
}

pub fn get_worklog_timeseries(
    &self,
    start_day: &str,
    end_day: &str,
) -> Result<Vec<(String, i64, i64)>, AppError> {
    let conn = self.conn.lock().map_err(|e| AppError::Database(e.to_string()))?;
    let mut stmt = conn.prepare(
        "SELECT day, COALESCE(SUM(user_work_seconds), 0), COALESCE(SUM(claude_work_seconds), 0)
         FROM worklogs WHERE day >= ?1 AND day <= ?2
         GROUP BY day ORDER BY day ASC",
    )?;
    let rows = stmt.query_map(rusqlite::params![start_day, end_day], |r| {
        Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?, r.get::<_, i64>(2)?))
    })?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row?);
    }
    Ok(out)
}

pub fn get_worklog_by_project_for_day(
    &self,
    day: &str,
) -> Result<Vec<(Option<String>, i64, i64, i64)>, AppError> {
    let conn = self.conn.lock().map_err(|e| AppError::Database(e.to_string()))?;
    let mut stmt = conn.prepare(
        "SELECT project_path,
                COUNT(DISTINCT session_id),
                COALESCE(SUM(user_work_seconds), 0),
                COALESCE(SUM(claude_work_seconds), 0)
         FROM worklogs WHERE day = ?1
         GROUP BY project_path
         ORDER BY (SUM(user_work_seconds) + SUM(claude_work_seconds)) DESC",
    )?;
    let rows = stmt.query_map(rusqlite::params![day], |r| {
        Ok((
            r.get::<_, Option<String>>(0)?,
            r.get::<_, i64>(1)?,
            r.get::<_, i64>(2)?,
            r.get::<_, i64>(3)?,
        ))
    })?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row?);
    }
    Ok(out)
}
```

- [ ] **Step 4: Build**

Run: `cd src-tauri && cargo check`
Expected: Compiles.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/db/mod.rs
git commit -m "feat(db): add worklog CRUD and summary queries"
```

---

### Task 6: Wire worklog computation into import pipeline

**Files:**
- Modify: `src-tauri/src/jsonl/import.rs`

- [ ] **Step 1: Locate the per-session import path**

Read `src-tauri/src/jsonl/import.rs` and find where `extract_session_messages` is called for per-session JSONL files (where the EnrichedSession is upserted).

- [ ] **Step 2: Compute and persist worklogs after session upsert**

Right after the existing `extract_session_messages` call (and after the session is upserted), add:

```rust
// Compute worklog rows from the same message list
let idle_threshold = db.get_idle_threshold_seconds().unwrap_or(300);
let project_path_str = enriched.project_path.as_deref();
let (worklog_rows, _turns) = crate::jsonl::worklog::calculate_worklog(
    &messages,
    idle_threshold,
    project_path_str,
    &enriched.session_id,
);

// Replace existing worklog rows for this session (so re-imports stay correct)
db.delete_worklogs_for_session(&enriched.session_id).ok();
for row in &worklog_rows {
    if let Err(e) = db.upsert_worklog(row) {
        tracing::warn!("failed to upsert worklog row: {}", e);
    }
}
```

Note: Variable names (`db`, `messages`, `enriched`) reflect the existing function's identifiers — adapt if they differ.

- [ ] **Step 3: Build**

Run: `cd src-tauri && cargo check`
Expected: Compiles.

- [ ] **Step 4: Manually verify with a test run**

Run: `cd src-tauri && cargo run --bin claude-lens` (or `npm run tauri:dev` from project root). Wait for auto-import. Then:

```bash
sqlite3 ~/Library/Application\ Support/com.claude-lens.app/claudelens.db \
  "SELECT COUNT(*) FROM worklogs;"
```

Expected: positive integer (worklog rows present).

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/jsonl/import.rs
git commit -m "feat(import): compute and persist worklogs during JSONL import"
```

---

## Phase 4: Tauri Commands

### Task 7: Create worklog command module

**Files:**
- Create: `src-tauri/src/commands/worklog.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Create `src-tauri/src/commands/worklog.rs`**

```rust
use std::collections::HashMap;
use serde::Serialize;
use tauri::{AppHandle, Manager, State};

use crate::error::AppError;
use crate::events;
use crate::jsonl::types::TurnWorklog;
use crate::state::AppState;

#[derive(Serialize)]
pub struct WorklogTimeseriesPoint {
    pub day: String,
    pub user_seconds: i64,
    pub claude_seconds: i64,
}

#[derive(Serialize)]
pub struct WorklogSummary {
    pub total_user_seconds: i64,
    pub total_claude_seconds: i64,
    pub turn_count: i64,
    pub session_count: i64,
    pub timeseries: Vec<WorklogTimeseriesPoint>,
}

#[derive(Serialize)]
pub struct DayWorklogProject {
    pub project_path: Option<String>,
    pub session_count: i64,
    pub user_work_seconds: i64,
    pub claude_work_seconds: i64,
}

#[tauri::command]
pub async fn get_session_worklog(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<WorklogSummary, AppError> {
    let (u, c, t) = state.database().get_worklog_summary_for_session(&session_id)?;
    Ok(WorklogSummary {
        total_user_seconds: u,
        total_claude_seconds: c,
        turn_count: t,
        session_count: if u > 0 || c > 0 { 1 } else { 0 },
        timeseries: Vec::new(),
    })
}

#[tauri::command]
pub async fn get_session_worklog_turns(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<Vec<TurnWorklog>, AppError> {
    // Recompute from JSONL on demand (no per-turn DB storage).
    let idle = state.database().get_idle_threshold_seconds().unwrap_or(300);
    let messages = crate::jsonl::import::extract_session_messages_for_session(
        state.database(),
        &session_id,
    )?;
    let project = state.database().get_session_project_path(&session_id).ok().flatten();
    let (_rows, turns) = crate::jsonl::worklog::calculate_worklog(
        &messages,
        idle,
        project.as_deref(),
        &session_id,
    );
    Ok(turns)
}

#[tauri::command]
pub async fn get_dashboard_worklog(
    state: State<'_, AppState>,
    range: String,
) -> Result<WorklogSummary, AppError> {
    let (start, end) = crate::commands::dashboard::range_to_days(&range, state.database())?;
    let (u, c, sessions) = state
        .database()
        .get_worklog_summary_for_range(&start, &end)?;
    let series = state.database().get_worklog_timeseries(&start, &end)?;
    let timeseries = series
        .into_iter()
        .map(|(day, us, cs)| WorklogTimeseriesPoint {
            day,
            user_seconds: us,
            claude_seconds: cs,
        })
        .collect();
    Ok(WorklogSummary {
        total_user_seconds: u,
        total_claude_seconds: c,
        turn_count: 0,
        session_count: sessions,
        timeseries,
    })
}

#[tauri::command]
pub async fn get_day_worklog_by_project(
    state: State<'_, AppState>,
    day: String,
) -> Result<Vec<DayWorklogProject>, AppError> {
    let rows = state.database().get_worklog_by_project_for_day(&day)?;
    Ok(rows
        .into_iter()
        .map(|(p, sc, u, c)| DayWorklogProject {
            project_path: p,
            session_count: sc,
            user_work_seconds: u,
            claude_work_seconds: c,
        })
        .collect())
}

#[tauri::command]
pub async fn list_session_worklogs(
    state: State<'_, AppState>,
    session_ids: Vec<String>,
) -> Result<HashMap<String, WorklogSummary>, AppError> {
    let summaries = state.database().list_worklog_summaries(&session_ids)?;
    let mut out: HashMap<String, WorklogSummary> = HashMap::new();
    for sid in session_ids {
        let (u, c, t) = summaries.get(&sid).copied().unwrap_or((0, 0, 0));
        out.insert(sid.clone(), WorklogSummary {
            total_user_seconds: u,
            total_claude_seconds: c,
            turn_count: t,
            session_count: if u > 0 || c > 0 { 1 } else { 0 },
            timeseries: Vec::new(),
        });
    }
    Ok(out)
}

#[tauri::command]
pub async fn recompute_worklogs(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    let db = state.database().clone();
    tauri::async_runtime::spawn_blocking(move || {
        db.delete_all_worklogs().ok();
        // Re-run full import — it will re-create worklogs with the current threshold.
        if let Err(e) = crate::jsonl::import::run_import(&db, true) {
            tracing::error!("recompute_worklogs failed: {}", e);
        }
    })
    .await
    .map_err(|e| AppError::Database(e.to_string()))?;
    events::frontend::emit_db_updated(&app);
    Ok(())
}
```

Note: `get_session_worklog_turns` references `extract_session_messages_for_session` and `get_session_project_path`. If those don't exist yet, defer this command (or implement the helpers) — see Task 8 below for an alternative simpler approach if needed.

- [ ] **Step 2: Wire helpers needed for `get_session_worklog_turns`**

Add the following helpers — first check if they exist; if not, add them:

In `src-tauri/src/jsonl/import.rs` (or a sibling module), expose:

```rust
pub fn extract_session_messages_for_session(
    db: &crate::db::Database,
    session_id: &str,
) -> Result<Vec<crate::jsonl::types::SessionMessage>, String> {
    // Look up the source JSONL file for this session_id from source_files
    // (or from the sessions table if there's a stored path), parse its lines,
    // and call extract_session_messages with the model_pricing snapshot.
    // If the lookup is non-trivial, document this as a follow-up — for v1 we
    // can return Vec::new() and let the detail panel render a notice instead.
    Ok(Vec::new())
}
```

In `src-tauri/src/db/mod.rs`, add:

```rust
pub fn get_session_project_path(&self, session_id: &str) -> Result<Option<String>, AppError> {
    let conn = self.conn.lock().map_err(|e| AppError::Database(e.to_string()))?;
    let res: Result<Option<String>, _> = conn.query_row(
        "SELECT project_path FROM sessions WHERE id = ?1",
        rusqlite::params![session_id],
        |r| r.get::<_, Option<String>>(0),
    );
    match res {
        Ok(v) => Ok(v),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(AppError::Database(e.to_string())),
    }
}
```

If `extract_session_messages_for_session` is too involved, ship Task 7 with `get_session_worklog_turns` returning empty `Vec` and add a follow-up task to populate it later (the detail panel will render the per-session summary; turn-level detail is enhancement).

- [ ] **Step 3: Add `range_to_days` helper if missing**

In `src-tauri/src/commands/dashboard.rs`, look for an existing helper that converts `range` ("Today" / "WorkWeek" / "Week" / "Month" / "All") to a `(start, end)` date pair — it's used by other dashboard commands. Make it `pub`. If no such helper exists, extract the inline range logic into:

```rust
pub fn range_to_days(
    range: &str,
    db: &crate::db::Database,
) -> Result<(String, String), AppError> {
    use chrono::{Duration, Local, NaiveDate};
    let today: NaiveDate = Local::now().date_naive();
    let (start, end) = match range {
        "Today" => (today, today),
        "WorkWeek" => {
            // Monday → today (or Friday if today > Friday)
            let weekday = today.weekday().num_days_from_monday() as i64;
            (today - Duration::days(weekday), today)
        }
        "Week" => (today - Duration::days(6), today),
        "Month" => (today - Duration::days(29), today),
        "All" => {
            let earliest: Option<String> = db
                .get_earliest_session_day()
                .ok()
                .flatten();
            let start = earliest
                .and_then(|s| NaiveDate::parse_from_str(&s, "%Y-%m-%d").ok())
                .unwrap_or(today);
            (start, today)
        }
        _ => (today, today),
    };
    Ok((start.format("%Y-%m-%d").to_string(), end.format("%Y-%m-%d").to_string()))
}
```

If `get_earliest_session_day` doesn't exist on `Database`, add a small query method:

```rust
pub fn get_earliest_session_day(&self) -> Result<Option<String>, AppError> {
    let conn = self.conn.lock().map_err(|e| AppError::Database(e.to_string()))?;
    let res: Result<Option<String>, _> = conn.query_row(
        "SELECT MIN(substr(first_seen_at, 1, 10)) FROM sessions",
        [],
        |r| r.get::<_, Option<String>>(0),
    );
    match res {
        Ok(v) => Ok(v),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(AppError::Database(e.to_string())),
    }
}
```

- [ ] **Step 4: Register module in `src-tauri/src/commands/mod.rs`**

Add `pub mod worklog;` next to the existing module declarations.

- [ ] **Step 5: Register commands in `src-tauri/src/lib.rs`**

In `tauri::generate_handler![...]`, append:

```rust
            commands::worklog::get_session_worklog,
            commands::worklog::get_session_worklog_turns,
            commands::worklog::get_dashboard_worklog,
            commands::worklog::get_day_worklog_by_project,
            commands::worklog::list_session_worklogs,
            commands::worklog::recompute_worklogs,
```

- [ ] **Step 6: Build**

Run: `cd src-tauri && cargo check`
Expected: Compiles.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/commands/worklog.rs src-tauri/src/commands/mod.rs src-tauri/src/commands/dashboard.rs src-tauri/src/lib.rs src-tauri/src/db/mod.rs src-tauri/src/jsonl/import.rs
git commit -m "feat(commands): add worklog Tauri commands"
```

---

### Task 8: Settings get/update with idle threshold

**Files:**
- Modify: `src-tauri/src/commands/settings.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Add command handlers**

In `src-tauri/src/commands/settings.rs`:

```rust
#[tauri::command]
pub async fn get_idle_threshold_minutes(
    state: State<'_, AppState>,
) -> Result<i64, AppError> {
    let secs = state.database().get_idle_threshold_seconds()?;
    Ok((secs / 60).max(1))
}

#[tauri::command]
pub async fn update_idle_threshold_minutes(
    state: State<'_, AppState>,
    minutes: i64,
) -> Result<(), AppError> {
    let clamped = minutes.clamp(1, 60);
    state.database().set_idle_threshold_seconds(clamped * 60)?;
    Ok(())
}
```

- [ ] **Step 2: Register the commands**

In `src-tauri/src/lib.rs`, append to the handler list:

```rust
            commands::settings::get_idle_threshold_minutes,
            commands::settings::update_idle_threshold_minutes,
```

- [ ] **Step 3: Build**

Run: `cd src-tauri && cargo check`
Expected: Compiles.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/commands/settings.rs src-tauri/src/lib.rs
git commit -m "feat(settings): add idle threshold get/update commands"
```

---

## Phase 5: Frontend Foundations

### Task 9: TypeScript types

**Files:**
- Modify: `src/types/index.ts`

- [ ] **Step 1: Append worklog types**

```typescript
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
```

- [ ] **Step 2: Commit**

```bash
git add src/types/index.ts
git commit -m "feat(types): add worklog interfaces"
```

---

### Task 10: Duration formatter

**Files:**
- Create: `src/lib/duration.ts`
- Create: `src/lib/duration.test.ts` (or co-located with the test runner the project uses)

- [ ] **Step 1: Create `src/lib/duration.ts`**

```typescript
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0m';
  const totalMinutes = Math.floor(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

export function formatDurationLong(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0 minutes';
  const totalMinutes = Math.floor(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const h = hours === 0 ? '' : `${hours} hour${hours === 1 ? '' : 's'}`;
  const m = minutes === 0 ? '' : `${minutes} minute${minutes === 1 ? '' : 's'}`;
  return [h, m].filter(Boolean).join(' ') || '0 minutes';
}
```

- [ ] **Step 2: Smoke test (manual or Vitest if present)**

If the project uses Vitest, add `src/lib/duration.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { formatDuration } from './duration';

describe('formatDuration', () => {
  it('returns 0m for 0 or negative', () => {
    expect(formatDuration(0)).toBe('0m');
    expect(formatDuration(-5)).toBe('0m');
  });
  it('formats minutes only when under 1 hour', () => {
    expect(formatDuration(1500)).toBe('25m');
    expect(formatDuration(60)).toBe('1m');
  });
  it('formats hours and minutes', () => {
    expect(formatDuration(4320)).toBe('1h 12m');
    expect(formatDuration(86400)).toBe('24h 0m');
  });
});
```

If no test runner exists, skip the test file and verify manually by importing into a component.

- [ ] **Step 3: Commit**

```bash
git add src/lib/duration.ts src/lib/duration.test.ts
git commit -m "feat(lib): add duration formatter"
```

---

### Task 11: Tauri command wrappers

**Files:**
- Modify: `src/lib/tauri.ts`

- [ ] **Step 1: Add wrappers**

Append to `src/lib/tauri.ts` (using the existing `invoke` import / pattern):

```typescript
import type {
  WorklogSummary,
  TurnWorklog,
  DayWorklogProject,
} from '../types';

export async function getSessionWorklog(sessionId: string): Promise<WorklogSummary> {
  return invoke<WorklogSummary>('get_session_worklog', { sessionId });
}

export async function getSessionWorklogTurns(sessionId: string): Promise<TurnWorklog[]> {
  return invoke<TurnWorklog[]>('get_session_worklog_turns', { sessionId });
}

export async function getDashboardWorklog(range: TimeRange): Promise<WorklogSummary> {
  return invoke<WorklogSummary>('get_dashboard_worklog', { range });
}

export async function getDayWorklogByProject(day: string): Promise<DayWorklogProject[]> {
  return invoke<DayWorklogProject[]>('get_day_worklog_by_project', { day });
}

export async function listSessionWorklogs(
  sessionIds: string[],
): Promise<Record<string, WorklogSummary>> {
  return invoke<Record<string, WorklogSummary>>('list_session_worklogs', { sessionIds });
}

export async function recomputeWorklogs(): Promise<void> {
  await invoke<void>('recompute_worklogs');
}

export async function getIdleThresholdMinutes(): Promise<number> {
  return invoke<number>('get_idle_threshold_minutes');
}

export async function updateIdleThresholdMinutes(minutes: number): Promise<void> {
  await invoke<void>('update_idle_threshold_minutes', { minutes });
}
```

Match existing camelCase / snake_case conventions of the file. If the existing file uses a different `invoke` wrapper, mirror that.

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: Compiles without TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/tauri.ts
git commit -m "feat(tauri): add worklog command wrappers"
```

---

### Task 12: WorklogPair UI component

**Files:**
- Create: `src/components/ui/WorklogPair.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { formatDuration } from '../../lib/duration';

type Size = 'sm' | 'md' | 'lg';

interface WorklogPairProps {
  userSeconds: number;
  claudeSeconds: number;
  size?: Size;
  className?: string;
}

const SIZE_STYLES: Record<Size, { wrap: string; icon: string; value: string }> = {
  sm: {
    wrap: 'gap-2 text-xs',
    icon: 'text-[11px]',
    value: 'font-medium',
  },
  md: {
    wrap: 'gap-3 text-sm',
    icon: 'text-xs',
    value: 'font-semibold',
  },
  lg: {
    wrap: 'gap-4 text-2xl',
    icon: 'text-base',
    value: 'font-bold',
  },
};

export function WorklogPair({
  userSeconds,
  claudeSeconds,
  size = 'sm',
  className = '',
}: WorklogPairProps) {
  const styles = SIZE_STYLES[size];
  return (
    <div className={`inline-flex items-center ${styles.wrap} ${className}`}>
      <span className="inline-flex items-center gap-1 text-cyan-400">
        <span className={styles.icon} aria-hidden>
          👤
        </span>
        <span className={styles.value}>{formatDuration(userSeconds)}</span>
      </span>
      <span className="inline-flex items-center gap-1 text-purple-400">
        <span className={styles.icon} aria-hidden>
          🤖
        </span>
        <span className={styles.value}>{formatDuration(claudeSeconds)}</span>
      </span>
    </div>
  );
}
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: Compiles.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/WorklogPair.tsx
git commit -m "feat(ui): add WorklogPair component"
```

---

## Phase 6: React Hooks

### Task 13: useSessionWorklog + useSessionWorklogs

**Files:**
- Create: `src/hooks/useSessionWorklog.ts`
- Create: `src/hooks/useSessionWorklogs.ts`

- [ ] **Step 1: Create `useSessionWorklog.ts`**

```typescript
import { useEffect, useState } from 'react';
import type { WorklogSummary } from '../types';
import { getSessionWorklog } from '../lib/tauri';
import { useTauriEvent } from './useTauriEvent';

export function useSessionWorklog(sessionId: string | null) {
  const [data, setData] = useState<WorklogSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    if (!sessionId) {
      setData(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await getSessionWorklog(sessionId);
      setData(result);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, [sessionId]);

  useTauriEvent('db-updated', () => {
    refresh();
  });

  return { data, loading, error };
}
```

- [ ] **Step 2: Create `useSessionWorklogs.ts`**

```typescript
import { useEffect, useState } from 'react';
import type { WorklogSummary } from '../types';
import { listSessionWorklogs } from '../lib/tauri';
import { useTauriEvent } from './useTauriEvent';

export function useSessionWorklogs(sessionIds: string[]) {
  const [data, setData] = useState<Record<string, WorklogSummary>>({});
  const [loading, setLoading] = useState(false);

  const idsKey = sessionIds.join(',');

  const refresh = async () => {
    if (sessionIds.length === 0) {
      setData({});
      return;
    }
    setLoading(true);
    try {
      const result = await listSessionWorklogs(sessionIds);
      setData(result);
    } catch (e) {
      // ignore — non-critical
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, [idsKey]);

  useTauriEvent('db-updated', () => {
    refresh();
  });

  return { data, loading };
}
```

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useSessionWorklog.ts src/hooks/useSessionWorklogs.ts
git commit -m "feat(hooks): add session worklog hooks"
```

---

### Task 14: useDashboardWorklog + useDayWorklog + useSessionWorklogTurns

**Files:**
- Create: `src/hooks/useDashboardWorklog.ts`
- Create: `src/hooks/useDayWorklog.ts`
- Create: `src/hooks/useSessionWorklogTurns.ts`

- [ ] **Step 1: Create `useDashboardWorklog.ts`**

```typescript
import { useEffect, useState } from 'react';
import type { WorklogSummary } from '../types';
import { getDashboardWorklog } from '../lib/tauri';
import { useTauriEvent } from './useTauriEvent';
import type { TimeRange } from '../types';

export function useDashboardWorklog(range: TimeRange) {
  const [data, setData] = useState<WorklogSummary | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const result = await getDashboardWorklog(range);
      setData(result);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, [range]);

  useTauriEvent('db-updated', () => {
    refresh();
  });

  return { data, loading };
}
```

- [ ] **Step 2: Create `useDayWorklog.ts`**

```typescript
import { useEffect, useState } from 'react';
import type { DayWorklogProject } from '../types';
import { getDayWorklogByProject } from '../lib/tauri';
import { useTauriEvent } from './useTauriEvent';

export function useDayWorklog(day: string | null) {
  const [data, setData] = useState<DayWorklogProject[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    if (!day) {
      setData([]);
      return;
    }
    setLoading(true);
    try {
      const rows = await getDayWorklogByProject(day);
      setData(rows);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, [day]);

  useTauriEvent('db-updated', () => {
    refresh();
  });

  return { data, loading };
}
```

- [ ] **Step 3: Create `useSessionWorklogTurns.ts`**

```typescript
import { useEffect, useState } from 'react';
import type { TurnWorklog } from '../types';
import { getSessionWorklogTurns } from '../lib/tauri';
import { useTauriEvent } from './useTauriEvent';

export function useSessionWorklogTurns(sessionId: string | null) {
  const [data, setData] = useState<TurnWorklog[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    if (!sessionId) {
      setData([]);
      return;
    }
    setLoading(true);
    try {
      const rows = await getSessionWorklogTurns(sessionId);
      setData(rows);
    } catch {
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, [sessionId]);

  useTauriEvent('db-updated', () => {
    refresh();
  });

  return { data, loading };
}
```

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useDashboardWorklog.ts src/hooks/useDayWorklog.ts src/hooks/useSessionWorklogTurns.ts
git commit -m "feat(hooks): add dashboard, day, and turn worklog hooks"
```

---

## Phase 7: Sessions UI

### Task 15: WorklogPair on Sessions list

**Files:**
- Modify: `src/features/sessions/SessionsList.tsx`

- [ ] **Step 1: Read the current SessionsList component**

Open `src/features/sessions/SessionsList.tsx` to understand how items are rendered and where session IDs are available.

- [ ] **Step 2: Add the hook and render WorklogPair**

Near the top of the component (after current data hooks):

```tsx
import { useSessionWorklogs } from '../../hooks/useSessionWorklogs';
import { WorklogPair } from '../../components/ui/WorklogPair';

// inside the component, after sessions data is loaded:
const visibleIds = sessions.map((s) => s.id);
const { data: worklogs } = useSessionWorklogs(visibleIds);
```

In the per-item render block, add (next to the existing token/cost display):

```tsx
{(() => {
  const w = worklogs[session.id];
  if (!w || (w.total_user_seconds === 0 && w.total_claude_seconds === 0)) return null;
  return (
    <WorklogPair
      userSeconds={w.total_user_seconds}
      claudeSeconds={w.total_claude_seconds}
      size="sm"
      className="mt-1"
    />
  );
})()}
```

Adjust JSX placement to fit the existing layout — the goal is one compact line per item showing 👤 and 🤖.

- [ ] **Step 3: Verify**

Run: `npm run tauri:dev`
Expected: Sessions list shows WorklogPair on items that have worklog data.

- [ ] **Step 4: Commit**

```bash
git add src/features/sessions/SessionsList.tsx
git commit -m "feat(sessions): show worklog pair on list items"
```

---

### Task 16: Worklog section on Session detail panel

**Files:**
- Modify: `src/features/sessions/SessionDetailPanel.tsx`

- [ ] **Step 1: Add the hooks and render section**

Imports:

```tsx
import { useSessionWorklog } from '../../hooks/useSessionWorklog';
import { useSessionWorklogTurns } from '../../hooks/useSessionWorklogTurns';
import { WorklogPair } from '../../components/ui/WorklogPair';
import { formatDuration } from '../../lib/duration';
```

Inside the component:

```tsx
const { data: worklog } = useSessionWorklog(session.id);
const { data: turns } = useSessionWorklogTurns(session.id);
```

Add a section block after the existing token/cost / metadata sections:

```tsx
{worklog && (worklog.total_user_seconds > 0 || worklog.total_claude_seconds > 0) && (
  <section className="space-y-3">
    <h3 className="text-sm uppercase tracking-wide text-slate-400">Worklog</h3>
    <div className="flex items-baseline gap-6">
      <WorklogPair
        userSeconds={worklog.total_user_seconds}
        claudeSeconds={worklog.total_claude_seconds}
        size="lg"
      />
      <div className="text-xs text-slate-500">
        {worklog.turn_count} turn{worklog.turn_count === 1 ? '' : 's'}
      </div>
    </div>

    {turns.length > 0 && (
      <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-800/60 divide-y divide-slate-800/40">
        {turns.map((t) => (
          <div key={t.index} className="flex items-center justify-between px-3 py-2 text-xs">
            <span className="text-slate-500">Turn {t.index}</span>
            <div className="flex items-center gap-3">
              <WorklogPair
                userSeconds={t.user_seconds}
                claudeSeconds={t.claude_seconds}
                size="sm"
              />
              {t.user_capped && (
                <span
                  className="rounded bg-amber-500/15 text-amber-400 px-1.5 py-0.5 text-[10px]"
                  title="User idle gap was capped at the configured threshold"
                >
                  capped
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    )}
  </section>
)}
```

If `useSessionWorklogTurns` returns an empty list (the backend doesn't expose per-session messages yet), the turns block stays hidden — graceful degradation.

- [ ] **Step 2: Verify in dev**

Run: `npm run tauri:dev`
Expected: Selecting a session with worklog data shows the Worklog section with totals.

- [ ] **Step 3: Commit**

```bash
git add src/features/sessions/SessionDetailPanel.tsx
git commit -m "feat(sessions): add worklog section to detail panel"
```

---

## Phase 8: Dashboard UI

### Task 17: WorklogBentoCard component

**Files:**
- Create: `src/features/dashboard/WorklogBentoCard.tsx`

- [ ] **Step 1: Read existing BentoSummary widgets to mirror style**

Open `src/features/dashboard/BentoSummary.tsx` — copy the Tokens or Cost card markup as a structural template.

- [ ] **Step 2: Create `WorklogBentoCard.tsx`**

```tsx
import { motion } from 'framer-motion';
import type { WorklogSummary } from '../../types';
import { formatDuration } from '../../lib/duration';

interface WorklogBentoCardProps {
  data: WorklogSummary | null;
  onClick: () => void;
  layoutId: string;
}

export function WorklogBentoCard({ data, onClick, layoutId }: WorklogBentoCardProps) {
  const userSecs = data?.total_user_seconds ?? 0;
  const claudeSecs = data?.total_claude_seconds ?? 0;
  const total = userSecs + claudeSecs;
  const sessions = data?.session_count ?? 0;

  return (
    <motion.button
      layoutId={layoutId}
      onClick={onClick}
      className="relative overflow-hidden rounded-2xl border border-slate-800/60 bg-slate-900/40 p-5 text-left transition hover:border-slate-700"
      whileHover={{ y: -2 }}
    >
      <div className="flex items-center gap-2 text-sm font-medium text-slate-300">
        <span aria-hidden>⏱</span>
        <span>Worklog</span>
      </div>

      <div className="mt-4 flex gap-6">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-slate-500">User</div>
          <div className="text-2xl font-bold text-cyan-400">{formatDuration(userSecs)}</div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wide text-slate-500">Claude</div>
          <div className="text-2xl font-bold text-purple-400">{formatDuration(claudeSecs)}</div>
        </div>
      </div>

      <div className="mt-4 text-xs text-slate-500">
        Total: {formatDuration(total)} · {sessions} session{sessions === 1 ? '' : 's'}
      </div>
    </motion.button>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/features/dashboard/WorklogBentoCard.tsx
git commit -m "feat(dashboard): add WorklogBentoCard widget"
```

---

### Task 18: Wire WorklogBentoCard into BentoSummary (3-column)

**Files:**
- Modify: `src/features/dashboard/BentoSummary.tsx`

- [ ] **Step 1: Update grid and add the new widget**

Imports:

```tsx
import { useDashboardWorklog } from '../../hooks/useDashboardWorklog';
import { WorklogBentoCard } from './WorklogBentoCard';
```

Inside the component, add the data hook (next to existing dashboard hooks):

```tsx
const { data: worklog } = useDashboardWorklog(range);
```

Change the grid container class from `grid grid-cols-2` to:

```tsx
className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"
```

Add the WorklogBentoCard after the Cost card:

```tsx
<WorklogBentoCard
  data={worklog}
  layoutId="worklog-card"
  onClick={() => setSelectedWidget('worklog')}
/>
```

Update the `selectedWidget` state type to `'tokens' | 'cost' | 'worklog' | null`.

- [ ] **Step 2: Verify in dev**

Run: `npm run tauri:dev`
Expected: Three widgets visible side-by-side on desktop; stacked on mobile.

- [ ] **Step 3: Commit**

```bash
git add src/features/dashboard/BentoSummary.tsx
git commit -m "feat(dashboard): show 3-column bento with worklog widget"
```

---

### Task 19: Worklog support in ExpandedWidgetChart

**Files:**
- Modify: `src/features/dashboard/ExpandedWidgetChart.tsx`
- Modify: `src/features/dashboard/BentoSummary.tsx`

- [ ] **Step 1: Add a 'worklog' widget config in ExpandedWidgetChart**

Open the existing ExpandedWidgetChart and add a `worklog` case. The chart series for worklog uses two stacked areas: `user_seconds` and `claude_seconds` from the WorklogSummary timeseries.

Pseudo-skeleton (adapt to existing structure):

```tsx
if (widgetType === 'worklog' && worklogData) {
  const series = worklogData.timeseries.map((p) => ({
    day: p.day,
    user: p.user_seconds / 60,    // minutes for nicer y-axis
    claude: p.claude_seconds / 60,
  }));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={series}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
        <XAxis dataKey="day" tick={{ fill: '#64748b', fontSize: 11 }} />
        <YAxis tick={{ fill: '#64748b', fontSize: 11 }} />
        <Tooltip
          formatter={(v: number, name: string) =>
            [`${Math.floor(v / 60)}h ${Math.round(v % 60)}m`, name]
          }
        />
        <Area dataKey="user" stackId="1" stroke="#06b6d4" fill="#06b6d4" fillOpacity={0.3} />
        <Area dataKey="claude" stackId="1" stroke="#a855f7" fill="#a855f7" fillOpacity={0.3} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
```

Pass `worklogData` from BentoSummary into the modal alongside the existing props.

- [ ] **Step 2: Update BentoSummary to render the modal for worklog**

In the existing modal block, branch on `selectedWidget === 'worklog'` and pass `worklogData={worklog}` to `ExpandedWidgetChart`.

- [ ] **Step 3: Verify in dev**

Click the Worklog widget — modal opens with sparkline-like dual area chart over the selected time range.

- [ ] **Step 4: Commit**

```bash
git add src/features/dashboard/ExpandedWidgetChart.tsx src/features/dashboard/BentoSummary.tsx
git commit -m "feat(dashboard): expand worklog widget into dual-area chart modal"
```

---

### Task 20: DayWorklogDialog component

**Files:**
- Create: `src/features/dashboard/DayWorklogDialog.tsx`

- [ ] **Step 1: Create the dialog**

```tsx
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useEffect } from 'react';

import type { DayWorklogProject } from '../../types';
import { useDayWorklog } from '../../hooks/useDayWorklog';
import { WorklogPair } from '../../components/ui/WorklogPair';
import { formatDuration } from '../../lib/duration';

interface DayWorklogDialogProps {
  day: string | null;
  onClose: () => void;
}

const PROJECT_COLORS = [
  '#06b6d4',
  '#a855f7',
  '#22c55e',
  '#f59e0b',
  '#ec4899',
  '#3b82f6',
  '#10b981',
  '#ef4444',
];

function colorFor(project: string | null): string {
  if (!project) return '#64748b';
  let hash = 0;
  for (let i = 0; i < project.length; i++) hash = (hash * 31 + project.charCodeAt(i)) >>> 0;
  return PROJECT_COLORS[hash % PROJECT_COLORS.length];
}

function formatDayHeading(day: string): string {
  const d = new Date(`${day}T00:00:00`);
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  });
}

export function DayWorklogDialog({ day, onClose }: DayWorklogDialogProps) {
  const { data: rows } = useDayWorklog(day);

  useEffect(() => {
    if (!day) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [day, onClose]);

  if (!day) return null;

  const totalUser = rows.reduce((s, r) => s + r.user_work_seconds, 0);
  const totalClaude = rows.reduce((s, r) => s + r.claude_work_seconds, 0);
  const totalSessions = rows.reduce((s, r) => s + r.session_count, 0);

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="backdrop"
        className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />
      <motion.div
        key="dialog"
        className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
      >
        <div className="pointer-events-auto w-full max-w-2xl rounded-2xl border border-slate-800/60 bg-slate-900/90 p-6 shadow-2xl">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <div className="text-lg font-semibold text-slate-100">{formatDayHeading(day)}</div>
              <div className="text-xs text-slate-500">
                {rows.length} project{rows.length === 1 ? '' : 's'} · {totalSessions} session
                {totalSessions === 1 ? '' : 's'}
              </div>
            </div>
            <div className="rounded-md bg-slate-800/60 px-3 py-1.5">
              <WorklogPair userSeconds={totalUser} claudeSeconds={totalClaude} size="sm" />
            </div>
          </div>

          {rows.length === 0 ? (
            <div className="py-8 text-center text-sm text-slate-500">
              No worklog data for this day
            </div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {rows.map((r) => {
                const project = r.project_path ?? '(no project)';
                const accent = colorFor(r.project_path);
                return (
                  <div
                    key={project}
                    className="flex items-center justify-between rounded-lg bg-slate-800/40 px-3 py-2.5"
                    style={{ borderLeft: `3px solid ${accent}` }}
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-slate-200">{project}</div>
                      <div className="text-[11px] text-slate-500">
                        {r.session_count} session{r.session_count === 1 ? '' : 's'}
                      </div>
                    </div>
                    <WorklogPair
                      userSeconds={r.user_work_seconds}
                      claudeSeconds={r.claude_work_seconds}
                      size="sm"
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/features/dashboard/DayWorklogDialog.tsx
git commit -m "feat(dashboard): add DayWorklogDialog for heatmap day-click"
```

---

### Task 21: Hook DailyHeatmap to open the dialog

**Files:**
- Modify: `src/features/dashboard/DailyHeatmap.tsx`

- [ ] **Step 1: Add click state and dialog**

Imports:

```tsx
import { useState } from 'react';
import { DayWorklogDialog } from './DayWorklogDialog';
```

Inside the component:

```tsx
const [openDay, setOpenDay] = useState<string | null>(null);
```

On the cell element (which already has hover handlers), add:

```tsx
onClick={() => {
  if (cell.day && (cell.value ?? 0) > 0) setOpenDay(cell.day);
}}
style={{ cursor: cell.value ? 'pointer' : 'default' }}
```

Render the dialog at the end of the component's return:

```tsx
<DayWorklogDialog day={openDay} onClose={() => setOpenDay(null)} />
```

- [ ] **Step 2: Verify in dev**

Run: `npm run tauri:dev`
Expected: Clicking on a heatmap day with data opens the dialog with project rows.

- [ ] **Step 3: Commit**

```bash
git add src/features/dashboard/DailyHeatmap.tsx
git commit -m "feat(dashboard): clicking heatmap day opens worklog dialog"
```

---

## Phase 9: Settings Page

### Task 22: Idle threshold input + recompute

**Files:**
- Modify: `src/pages/SettingsPage.tsx`

- [ ] **Step 1: Add hook state and input**

Imports:

```tsx
import { useEffect, useState } from 'react';
import {
  getIdleThresholdMinutes,
  updateIdleThresholdMinutes,
  recomputeWorklogs,
} from '../lib/tauri';
```

State:

```tsx
const [idleMinutes, setIdleMinutes] = useState<number>(5);
const [savingIdle, setSavingIdle] = useState(false);

useEffect(() => {
  getIdleThresholdMinutes().then(setIdleMinutes).catch(() => {});
}, []);

const onIdleSave = async () => {
  setSavingIdle(true);
  try {
    await updateIdleThresholdMinutes(idleMinutes);
    await recomputeWorklogs();
  } finally {
    setSavingIdle(false);
  }
};
```

JSX (add a section near other settings — match existing label/input/glass-card styling):

```tsx
<section className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-5 space-y-3">
  <h3 className="text-sm font-semibold text-slate-200">User idle threshold</h3>
  <p className="text-xs text-slate-500">
    Ennyi perc után számít idle-nek a user, és az ezen felüli idő nem lesz munkaidőként számolva.
  </p>
  <div className="flex items-center gap-3">
    <input
      type="number"
      min={1}
      max={60}
      value={idleMinutes}
      onChange={(e) => setIdleMinutes(Math.max(1, Math.min(60, Number(e.target.value) || 1)))}
      className="w-24 rounded-md border border-slate-700 bg-slate-800/60 px-3 py-1.5 text-sm text-slate-200"
    />
    <span className="text-xs text-slate-500">perc (1–60)</span>
    <button
      type="button"
      onClick={onIdleSave}
      disabled={savingIdle}
      className="rounded-md bg-cyan-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-cyan-500 disabled:opacity-50"
    >
      {savingIdle ? 'Recomputing…' : 'Save'}
    </button>
  </div>
</section>
```

- [ ] **Step 2: Verify in dev**

Run: `npm run tauri:dev`
Expected: Settings page shows the input. Changing it and clicking Save triggers a recompute (visible spinner). After it finishes, dashboard worklog values reflect the new threshold.

- [ ] **Step 3: Commit**

```bash
git add src/pages/SettingsPage.tsx
git commit -m "feat(settings): add idle threshold input with recompute trigger"
```

---

## Phase 10: Final Verification

### Task 23: End-to-end smoke test

- [ ] **Step 1: Full dev run**

```bash
cd /Users/beno/Projects/claude-lens/source/claude-lens
npm run tauri:dev
```

- [ ] **Step 2: Walkthrough checklist**

Verify each item:

- Dashboard loads with three Bento widgets (Tokens, Cost, Worklog) on desktop
- TimeRangeSelector ("Today" / "WorkWeek" / "7d" / "30d" / "All") changes the worklog values
- Clicking the Worklog widget opens the expanded modal with a dual-area chart
- Clicking a heatmap day with data opens the DayWorklogDialog
- The dialog header shows the day, total worklog pair, and session/project counts
- Each project row shows its name, session count, and worklog pair
- Sessions list shows the worklog pair on items that have data
- Selecting a session shows the Worklog section in the detail panel with totals (and turn list if available)
- Settings page idle threshold input loads the current value, saves on click, and triggers a recompute
- After recompute completes, the dashboard worklog values update

- [ ] **Step 3: DB sanity check**

```bash
sqlite3 ~/Library/Application\ Support/com.claude-lens.app/claudelens.db <<'SQL'
SELECT COUNT(*) FROM worklogs;
SELECT day, SUM(user_work_seconds), SUM(claude_work_seconds), SUM(turn_count)
FROM worklogs
GROUP BY day
ORDER BY day DESC
LIMIT 5;
SELECT key, value FROM app_state WHERE key = 'idle_threshold_seconds';
SQL
```

Expected: positive worklog rows, daily aggregates look reasonable, idle_threshold_seconds matches the settings UI.

- [ ] **Step 4: Manual hand-calc sanity**

Pick one session you remember working on. Open its detail panel. The Worklog total should be at most a few minutes off from your recollection — large discrepancies (orders of magnitude) indicate a bug.

- [ ] **Step 5: Final commit (if any tweaks were made)**

```bash
git add -A
git commit -m "chore: e2e verification tweaks"
```

---

## Out of Scope (follow-ups, not implemented)

- Worklog CSV / PDF export
- Weekly / monthly email reports
- Calendar (Google / Outlook) sync
- Cost-per-hour calculation (worklog × hourly rate)
- Per-turn bookmarks / annotations
- Background worker for `recompute_worklogs` (current impl uses spawn_blocking; for very large dbs this may need batching)
