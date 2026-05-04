# Worklog: csak Claude idő, tű pontos méréssel — Implementációs Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Drop user-time tracking from the worklog feature; make the remaining Claude-time measurement precise (real user message → last assistant `end_timestamp`, tool execution included, no idle cap, no heuristic).

**Architecture:** A `SessionMessage` minden assistant elemén tároljuk a merged entry-k legkésőbbi timestampjét egy új `end_timestamp` mezőben. A worklog számítás új turn-definíciót használ: a tool_result user üzenetek (amelyek `content_text == None`) nem zárnak turn-t, csak a valódi user üzenetek. Egy turn `claude_seconds = last_assistant.end_timestamp - real_user.timestamp`. A user-idő mezők (DB, Tauri response, frontend types) törölve. V11 migráció recreate-eli a `worklogs` táblát a szűkebb sémával és törli a `idle_threshold_seconds` beállítást; a felhasználó manuálisan újraszámolhatja a meglévő adatot a Settings-ben már létező `recompute_worklogs` command-on keresztül.

**Tech Stack:** Rust + Tauri 2 + rusqlite (backend), React 19 + TypeScript (frontend). Tesztek: `cargo test` (Rust), `npm run typecheck` és `npm run build` (frontend).

**Spec:** `docs/superpowers/specs/2026-05-04-worklog-claude-only-design.md`

---

## File Structure

**Backend (módosított fájlok):**
- `src-tauri/src/jsonl/types.rs` — `SessionMessage.end_timestamp` (új), `WorklogRow.user_work_seconds` (törölve), `TurnWorklog.user_seconds` és `TurnWorklog.user_capped` (törölve)
- `src-tauri/src/jsonl/normalize.rs` — `extract_session_messages` populálja az `end_timestamp` mezőt
- `src-tauri/src/jsonl/worklog.rs` — algoritmus rewrite (új turn-definíció, no idle cap, no user_seconds)
- `src-tauri/src/jsonl/import.rs` — `calculate_worklog` új signature-rel, `idle_threshold` lookup törölve
- `src-tauri/src/db/migrations.rs` — V11 migráció
- `src-tauri/src/db/mod.rs` — worklog query-k szűkebb shape-pel, idle_threshold helperek törölve
- `src-tauri/src/commands/worklog.rs` — response struct-ok szűkítve
- `src-tauri/src/commands/settings.rs` — `get_idle_threshold_minutes` / `update_idle_threshold_minutes` törölve
- `src-tauri/src/lib.rs` — törölt parancs regisztráció eltávolítva

**Frontend (módosított fájlok):**
- `src/types/index.ts` — Worklog típusokból user-mezők törölve
- `src/lib/tauri.ts` — `getIdleThresholdMinutes`/`updateIdleThresholdMinutes` wrapper-ek törölve
- `src/components/ui/WorklogPair.tsx` — fájl törölve
- `src/features/dashboard/WorklogBentoCard.tsx` — csak Claude idő
- `src/features/dashboard/DayWorklogDialog.tsx` — `WorklogPair` helyett `formatDuration` direktben
- `src/features/dashboard/ExpandedWidgetChart.tsx` — egy area, csak claude_seconds
- `src/features/sessions/SessionsList.tsx` — `WorklogPair` helyett duration label
- `src/features/sessions/SessionDetailPanel.tsx` — `WorklogPair` és `user_capped` badge törölve
- `src/pages/SettingsPage.tsx` — "User Idle Threshold" szekció törölve, helyette "Recompute Worklogs" gomb
- `src/hooks/*.ts` — típusváltozások (a hookok logikája változatlan, csak `WorklogSummary` és `TurnWorklog` átalakult)

---

## Task 1: V11 schema migráció

**Files:**
- Modify: `src-tauri/src/db/migrations.rs`

- [ ] **Step 1: Add the V11 migration constant**

Insert this block in `src-tauri/src/db/migrations.rs` immediately AFTER the existing `V10_UP` constant (after line 226, before the `fn get_schema_version` function):

```rust
const V11_UP: &str = r#"
-- Recreate worklogs without user_work_seconds (column drop via swap)
CREATE TABLE worklogs_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    project_path TEXT,
    day TEXT NOT NULL,
    claude_work_seconds INTEGER NOT NULL DEFAULT 0,
    turn_count INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL,
    UNIQUE (session_id, day)
);

DROP TABLE IF EXISTS worklogs;
ALTER TABLE worklogs_new RENAME TO worklogs;

CREATE INDEX IF NOT EXISTS idx_worklogs_day ON worklogs(day);
CREATE INDEX IF NOT EXISTS idx_worklogs_session ON worklogs(session_id);
CREATE INDEX IF NOT EXISTS idx_worklogs_project ON worklogs(project_path);

-- Drop the idle threshold setting (no longer used)
DELETE FROM app_state WHERE key = 'idle_threshold_seconds';
"#;
```

- [ ] **Step 2: Bump CURRENT_VERSION and register the migration**

Replace line 5 in `src-tauri/src/db/migrations.rs`:

```rust
const CURRENT_VERSION: i64 = 11;
```

Then insert this block immediately AFTER the `if current < 10 { ... }` block (after line 324, before the `let final_version` line):

```rust
    if current < 11 {
        conn.execute_batch(V11_UP)?;
        set_schema_version(conn, 11)?;
        tracing::info!("Applied migration V11 (schema version 11) — drop user_work_seconds + idle_threshold setting");
    }
```

- [ ] **Step 3: Run cargo build to verify**

Run: `cargo build --manifest-path src-tauri/Cargo.toml`
Expected: success with no errors.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/db/migrations.rs
git commit -m "feat(worklog): V11 migration drops user_work_seconds and idle threshold

Recreate worklogs table without user_work_seconds column; delete
idle_threshold_seconds app_state setting. Existing worklog rows are
discarded — recompute runs on next import or via Settings.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: SessionMessage.end_timestamp populálva

**Files:**
- Modify: `src-tauri/src/jsonl/types.rs`
- Modify: `src-tauri/src/jsonl/normalize.rs`
- Modify: `src-tauri/src/jsonl/worklog.rs` (test helper)

- [ ] **Step 1: Add the failing test**

Add this test to `src-tauri/src/jsonl/normalize.rs` inside the existing `mod tests` block (find the existing tests at the bottom of the file with `extract_session_messages` calls and add this alongside them):

```rust
    #[test]
    fn assistant_end_timestamp_is_latest_of_merged_entries() {
        // Two assistant entries sharing a request_id, with the second arriving
        // later — the merged SessionMessage should record the earliest as
        // `timestamp` and the latest as `end_timestamp`.
        let lines = [
            r#"{"type":"user","message":{"role":"user","content":"hi"},"timestamp":"2026-05-04T10:00:00.000Z","sessionId":"s1"}"#,
            r#"{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"first chunk"}],"usage":{"input_tokens":1,"output_tokens":1}},"timestamp":"2026-05-04T10:00:05.000Z","requestId":"req-A","sessionId":"s1"}"#,
            r#"{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"second chunk"}],"usage":{"input_tokens":1,"output_tokens":2}},"timestamp":"2026-05-04T10:00:42.000Z","requestId":"req-A","sessionId":"s1"}"#,
        ];
        let entries: Vec<crate::jsonl::types::RawSessionEntry> = lines
            .iter()
            .map(|l| serde_json::from_str(l).unwrap())
            .collect();
        let msgs = extract_session_messages(&entries, &[]);
        // Expect: 1 user + 1 merged assistant
        assert_eq!(msgs.len(), 2);
        let asst = msgs.iter().find(|m| m.role == "assistant").unwrap();
        assert_eq!(asst.timestamp.as_deref(), Some("2026-05-04T10:00:05.000Z"));
        assert_eq!(asst.end_timestamp.as_deref(), Some("2026-05-04T10:00:42.000Z"));
    }
```

- [ ] **Step 2: Run the test to verify it fails (compile error — field missing)**

Run: `cargo test --manifest-path src-tauri/Cargo.toml --lib jsonl::normalize::tests::assistant_end_timestamp_is_latest_of_merged_entries`
Expected: FAIL with `no field 'end_timestamp' on type SessionMessage` or similar compile error.

- [ ] **Step 3: Add the field to SessionMessage**

Modify `src-tauri/src/jsonl/types.rs`. Find the `pub struct SessionMessage { ... }` block (starts at line 165) and add the `end_timestamp` field immediately after the existing `timestamp` field:

```rust
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
```

- [ ] **Step 4: Populate end_timestamp for user entries in extract_session_messages**

Modify `src-tauri/src/jsonl/normalize.rs`. Find the user `messages.push((u.timestamp.clone(), SessionMessage { ... }));` block (around lines 444–463) and add `end_timestamp: u.timestamp.clone(),` between `timestamp:` and `content_text:`:

```rust
                messages.push((u.timestamp.clone(), SessionMessage {
                    role: "user".to_string(),
                    timestamp: u.timestamp.clone(),
                    end_timestamp: u.timestamp.clone(),
                    content_text,
                    content_blocks,
                    metadata: Some(MessageMetadata {
                        cwd: u.cwd.clone(),
                        git_branch: u.git_branch.clone(),
                        version: u.version.clone(),
                        is_sidechain: u.is_sidechain.unwrap_or(false),
                    }),
                    model: None,
                    input_tokens: 0,
                    output_tokens: 0,
                    cache_creation_tokens: 0,
                    cache_read_tokens: 0,
                    cost_usd: 0.0,
                    tool_use_count: 0,
                    is_meta,
                }));
```

- [ ] **Step 5: Track the latest timestamp during assistant merge**

Modify `src-tauri/src/jsonl/normalize.rs`. Find the `struct PendingAssistantTurn { ... }` definition (around lines 394–406) and add an `end_timestamp` field after `timestamp`:

```rust
    struct PendingAssistantTurn {
        timestamp: Option<String>,
        end_timestamp: Option<String>,
        model: Option<String>,
        content_blocks: Vec<ContentBlock>,
        input_tokens: i64,
        output_tokens: i64,
        cache_creation_tokens: i64,
        cache_read_tokens: i64,
        cwd: Option<String>,
        git_branch: Option<String>,
        version: Option<String>,
        is_sidechain: bool,
    }
```

In the merge branch (around lines 491–508, the `if let Some(ref rid) = a.request_id { if let Some(&idx) = request_id_index.get(...) { ... }` block), add a check that updates `end_timestamp` to the latest. Replace the existing block with this:

```rust
                if let Some(ref rid) = a.request_id {
                    if let Some(&idx) = request_id_index.get(rid.as_str()) {
                        // Merge into existing turn
                        let turn = &mut assistant_turns[idx].1;
                        turn.content_blocks.extend(blocks);
                        turn.input_tokens = turn.input_tokens.max(input);
                        turn.output_tokens = turn.output_tokens.max(output);
                        turn.cache_creation_tokens = turn.cache_creation_tokens.max(cache_create);
                        turn.cache_read_tokens = turn.cache_read_tokens.max(cache_read);
                        if turn.model.is_none() {
                            turn.model = model;
                        }
                        if turn.timestamp.is_none() || a.timestamp < turn.timestamp {
                            turn.timestamp = a.timestamp.clone();
                        }
                        if turn.end_timestamp.is_none() || a.timestamp > turn.end_timestamp {
                            turn.end_timestamp = a.timestamp.clone();
                        }
                        continue;
                    }
                }
```

In the new-turn branch (around lines 510–527, the `assistant_turns.push((a.request_id.clone(), PendingAssistantTurn { ... }));`), add `end_timestamp: a.timestamp.clone(),` after `timestamp:`:

```rust
                assistant_turns.push((a.request_id.clone(), PendingAssistantTurn {
                    timestamp: a.timestamp.clone(),
                    end_timestamp: a.timestamp.clone(),
                    model,
                    content_blocks: blocks,
                    input_tokens: input,
                    output_tokens: output,
                    cache_creation_tokens: cache_create,
                    cache_read_tokens: cache_read,
                    cwd: a.cwd.clone(),
                    git_branch: a.git_branch.clone(),
                    version: a.version.clone(),
                    is_sidechain: a.is_sidechain.unwrap_or(false),
                }));
```

In the conversion to `SessionMessage` (around lines 562–581, the `messages.push((turn.timestamp.clone(), SessionMessage { ... }));`), pass `end_timestamp: turn.end_timestamp,`:

```rust
        messages.push((turn.timestamp.clone(), SessionMessage {
            role: "assistant".to_string(),
            timestamp: turn.timestamp,
            end_timestamp: turn.end_timestamp,
            content_text,
            content_blocks: turn.content_blocks,
            metadata: Some(MessageMetadata {
                cwd: turn.cwd,
                git_branch: turn.git_branch,
                version: turn.version,
                is_sidechain: turn.is_sidechain,
            }),
            model: turn.model,
            input_tokens: turn.input_tokens,
            output_tokens: turn.output_tokens,
            cache_creation_tokens: turn.cache_creation_tokens,
            cache_read_tokens: turn.cache_read_tokens,
            cost_usd: cost,
            tool_use_count,
            is_meta: false,
        }));
```

- [ ] **Step 6: Update the test helper in worklog.rs**

Modify `src-tauri/src/jsonl/worklog.rs`. Find the `fn msg(role: &str, ts: &str, sidechain: bool, meta: bool) -> SessionMessage` test helper (around lines 200–221) and add `end_timestamp: Some(ts.to_string()),` after `timestamp:`:

```rust
    fn msg(role: &str, ts: &str, sidechain: bool, meta: bool) -> SessionMessage {
        SessionMessage {
            role: role.to_string(),
            timestamp: Some(ts.to_string()),
            end_timestamp: Some(ts.to_string()),
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
```

- [ ] **Step 7: Run all tests in the jsonl module**

Run: `cargo test --manifest-path src-tauri/Cargo.toml --lib jsonl::`
Expected: all tests pass, including the new `assistant_end_timestamp_is_latest_of_merged_entries`.

- [ ] **Step 8: Commit**

```bash
git add src-tauri/src/jsonl/types.rs src-tauri/src/jsonl/normalize.rs src-tauri/src/jsonl/worklog.rs
git commit -m "feat(worklog): track end_timestamp on merged assistant messages

Adds SessionMessage.end_timestamp to record the latest timestamp across
merged request_id groups, enabling precise turn-end measurement.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Új worklog algoritmus tesztekkel

**Files:**
- Modify: `src-tauri/src/jsonl/worklog.rs` (rewrite)

- [ ] **Step 1: Replace the entire `worklog.rs` file**

Open `src-tauri/src/jsonl/worklog.rs` and replace its full contents with:

```rust
use chrono::{DateTime, TimeZone, Utc};

use super::types::{SessionMessage, TurnWorklog, WorklogRow};

/// A turn = one real user message + all subsequent assistant + tool_result
/// messages until the next real user message. Tool_result user messages
/// (whose content_text is None / empty) do not break turns.
struct Turn {
    user_at: DateTime<Utc>,
    last_assistant_end: DateTime<Utc>,
}

/// Compute worklog rows (per day) from already-extracted SessionMessage list.
///
/// - `messages` must be sorted by timestamp ascending (caller responsibility).
/// - Sidechain and is_meta messages are ignored.
/// - User messages with no text content (tool_result) do not start a new turn.
/// - claude_seconds per turn = real_user.timestamp → last_assistant.end_timestamp.
/// - Multi-day turns are split at UTC midnight; each day gets its share of seconds.
pub fn calculate_worklog(
    messages: &[SessionMessage],
    project_path: Option<&str>,
    session_id: &str,
) -> (Vec<WorklogRow>, Vec<TurnWorklog>) {
    let turns = build_turns(messages);
    if turns.is_empty() {
        return (Vec::new(), Vec::new());
    }

    let mut per_day: std::collections::HashMap<String, (i64, i64)> =
        std::collections::HashMap::new();
    let mut turn_breakdowns: Vec<TurnWorklog> = Vec::with_capacity(turns.len());

    for (i, turn) in turns.iter().enumerate() {
        let claude_seconds = (turn.last_assistant_end - turn.user_at)
            .num_seconds()
            .max(0);

        let user_day = day_key(turn.user_at);

        for (day, secs) in split_seconds_by_day(turn.user_at, turn.last_assistant_end) {
            bucket_add(&mut per_day, &day, secs, 0);
        }
        bucket_add(&mut per_day, &user_day, 0, 1);

        turn_breakdowns.push(TurnWorklog {
            index: (i as i64) + 1,
            user_message_at: turn.user_at.to_rfc3339(),
            last_assistant_at: turn.last_assistant_end.to_rfc3339(),
            claude_seconds,
        });
    }

    let mut rows: Vec<WorklogRow> = per_day
        .into_iter()
        .map(|(day, (c, t))| WorklogRow {
            session_id: session_id.to_string(),
            project_path: project_path.map(|s| s.to_string()),
            day,
            claude_work_seconds: c,
            turn_count: t,
        })
        .collect();

    rows.sort_by(|a, b| a.day.cmp(&b.day));
    (rows, turn_breakdowns)
}

fn is_real_user_message(msg: &SessionMessage) -> bool {
    if msg.role != "user" {
        return false;
    }
    if msg.is_meta {
        return false;
    }
    let sidechain = msg
        .metadata
        .as_ref()
        .map(|m| m.is_sidechain)
        .unwrap_or(false);
    if sidechain {
        return false;
    }
    match msg.content_text.as_deref() {
        Some(s) if !s.is_empty() => true,
        _ => false,
    }
}

fn build_turns(messages: &[SessionMessage]) -> Vec<Turn> {
    let mut turns: Vec<Turn> = Vec::new();
    let mut current: Option<Turn> = None;

    for msg in messages {
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
                if !is_real_user_message(msg) {
                    // tool_result or empty user — does not start a new turn
                    continue;
                }
                if let Some(t) = current.take() {
                    turns.push(t);
                }
                current = Some(Turn {
                    user_at: ts,
                    last_assistant_end: ts,
                });
            }
            "assistant" => {
                if let Some(t) = current.as_mut() {
                    let end_ts = parse_ts(msg.end_timestamp.as_deref())
                        .or_else(|| parse_ts(msg.timestamp.as_deref()))
                        .unwrap_or(ts);
                    if end_ts > t.last_assistant_end {
                        t.last_assistant_end = end_ts;
                    }
                }
                // assistant before any real user — orphan, ignore
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
    map: &mut std::collections::HashMap<String, (i64, i64)>,
    day: &str,
    claude: i64,
    turns: i64,
) {
    let entry = map.entry(day.to_string()).or_insert((0, 0));
    entry.0 += claude;
    entry.1 += turns;
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
    use crate::jsonl::types::{MessageMetadata, SessionMessage};

    fn user_msg(ts: &str, text: Option<&str>, sidechain: bool, meta: bool) -> SessionMessage {
        SessionMessage {
            role: "user".to_string(),
            timestamp: Some(ts.to_string()),
            end_timestamp: Some(ts.to_string()),
            content_text: text.map(|s| s.to_string()),
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

    fn asst_msg(start: &str, end: &str) -> SessionMessage {
        SessionMessage {
            role: "assistant".to_string(),
            timestamp: Some(start.to_string()),
            end_timestamp: Some(end.to_string()),
            content_text: None,
            content_blocks: Vec::new(),
            metadata: Some(MessageMetadata {
                cwd: None,
                git_branch: None,
                version: None,
                is_sidechain: false,
            }),
            model: None,
            input_tokens: 0,
            output_tokens: 0,
            cache_creation_tokens: 0,
            cache_read_tokens: 0,
            cost_usd: 0.0,
            tool_use_count: 0,
            is_meta: false,
        }
    }

    #[test]
    fn single_turn_one_assistant() {
        let msgs = vec![
            user_msg("2026-05-04T10:00:00Z", Some("hello"), false, false),
            asst_msg("2026-05-04T10:00:05Z", "2026-05-04T10:00:30Z"),
        ];
        let (rows, turns) = calculate_worklog(&msgs, Some("p"), "s1");
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].claude_work_seconds, 30);
        assert_eq!(rows[0].turn_count, 1);
        assert_eq!(turns.len(), 1);
        assert_eq!(turns[0].claude_seconds, 30);
    }

    #[test]
    fn tool_chain_turn_includes_tool_exec() {
        // Real user → assistant tool_use ends → tool_result user (5s gap) → assistant text ends.
        // Expected claude_seconds = end_of_last_assistant - real_user_ts = 40s, NOT 5+5=10.
        let msgs = vec![
            user_msg("2026-05-04T10:00:00Z", Some("do X"), false, false),
            asst_msg("2026-05-04T10:00:01Z", "2026-05-04T10:00:05Z"),
            user_msg("2026-05-04T10:00:35Z", None, false, false), // tool_result
            asst_msg("2026-05-04T10:00:36Z", "2026-05-04T10:00:40Z"),
        ];
        let (rows, turns) = calculate_worklog(&msgs, None, "s");
        assert_eq!(turns.len(), 1);
        assert_eq!(rows[0].claude_work_seconds, 40);
        assert_eq!(rows[0].turn_count, 1);
    }

    #[test]
    fn tool_result_does_not_break_turn() {
        // Multiple tool_results inside one real-user turn — still one turn.
        let msgs = vec![
            user_msg("2026-05-04T10:00:00Z", Some("multi-tool"), false, false),
            asst_msg("2026-05-04T10:00:01Z", "2026-05-04T10:00:02Z"),
            user_msg("2026-05-04T10:00:10Z", None, false, false),
            asst_msg("2026-05-04T10:00:11Z", "2026-05-04T10:00:12Z"),
            user_msg("2026-05-04T10:00:20Z", None, false, false),
            asst_msg("2026-05-04T10:00:21Z", "2026-05-04T10:00:25Z"),
        ];
        let (_rows, turns) = calculate_worklog(&msgs, None, "s");
        assert_eq!(turns.len(), 1);
        assert_eq!(turns[0].claude_seconds, 25);
    }

    #[test]
    fn empty_user_content_treated_as_tool_result() {
        // Empty-string content_text behaves like None (no text).
        let msgs = vec![
            user_msg("2026-05-04T10:00:00Z", Some("real"), false, false),
            asst_msg("2026-05-04T10:00:01Z", "2026-05-04T10:00:05Z"),
            user_msg("2026-05-04T10:00:10Z", Some(""), false, false), // empty
            asst_msg("2026-05-04T10:00:11Z", "2026-05-04T10:00:15Z"),
        ];
        let (_rows, turns) = calculate_worklog(&msgs, None, "s");
        assert_eq!(turns.len(), 1);
        assert_eq!(turns[0].claude_seconds, 15);
    }

    #[test]
    fn multi_day_turn_splits_at_midnight() {
        let msgs = vec![
            user_msg("2026-05-04T23:55:00Z", Some("late"), false, false),
            asst_msg("2026-05-04T23:56:00Z", "2026-05-05T00:30:00Z"),
        ];
        let (rows, _) = calculate_worklog(&msgs, None, "s");
        assert_eq!(rows.len(), 2);
        let r0 = rows.iter().find(|r| r.day == "2026-05-04").unwrap();
        let r1 = rows.iter().find(|r| r.day == "2026-05-05").unwrap();
        assert_eq!(r0.claude_work_seconds, 5 * 60);
        assert_eq!(r1.claude_work_seconds, 30 * 60);
    }

    #[test]
    fn empty_input_returns_empty() {
        let (rows, turns) = calculate_worklog(&[], None, "s");
        assert!(rows.is_empty());
        assert!(turns.is_empty());
    }

    #[test]
    fn assistant_before_any_real_user_is_ignored() {
        let msgs = vec![
            asst_msg("2026-05-04T10:00:00Z", "2026-05-04T10:00:05Z"),
            user_msg("2026-05-04T10:01:00Z", Some("hi"), false, false),
            asst_msg("2026-05-04T10:01:01Z", "2026-05-04T10:02:00Z"),
        ];
        let (rows, turns) = calculate_worklog(&msgs, None, "s");
        assert_eq!(turns.len(), 1);
        assert_eq!(rows[0].claude_work_seconds, 60);
    }

    #[test]
    fn sidechain_and_meta_skipped() {
        let msgs = vec![
            user_msg("2026-05-04T10:00:00Z", Some("real"), false, false),
            asst_msg("2026-05-04T10:00:01Z", "2026-05-04T10:00:30Z"),
            user_msg("2026-05-04T10:01:00Z", Some("sidechain msg"), true, false),
            user_msg("2026-05-04T10:02:00Z", Some("/clear"), false, true),
            asst_msg("2026-05-04T10:03:00Z", "2026-05-04T10:04:00Z"),
        ];
        let (rows, turns) = calculate_worklog(&msgs, None, "s");
        // Real user @ 10:00 → assistant ends @ 10:04. The two skipped messages
        // are inside this same turn (they don't break it).
        assert_eq!(turns.len(), 1);
        assert_eq!(rows[0].claude_work_seconds, 4 * 60);
    }

    #[test]
    fn assistant_end_uses_latest_timestamp_when_distinct_from_start() {
        // assistant timestamp != end_timestamp — confirms end_timestamp wins.
        let msgs = vec![
            user_msg("2026-05-04T10:00:00Z", Some("hi"), false, false),
            asst_msg("2026-05-04T10:00:01Z", "2026-05-04T10:00:50Z"),
        ];
        let (rows, _) = calculate_worklog(&msgs, None, "s");
        assert_eq!(rows[0].claude_work_seconds, 50);
    }
}
```

- [ ] **Step 2: Verify the file compiles standalone (it won't yet — types.rs still has user fields, callers still pass idle_threshold)**

Run: `cargo build --manifest-path src-tauri/Cargo.toml`
Expected: compile errors mentioning `user_work_seconds`, `user_seconds`, `user_capped` no longer exist on the struct literals being constructed (or the WorklogRow/TurnWorklog struct itself has fewer fields than the rest of the code expects). This is expected — Tasks 4 and 5 fix it.

- [ ] **Step 3: DO NOT commit yet** — the codebase is in an intermediate state. Continue to Task 4.

---

## Task 4: WorklogRow / TurnWorklog típusok szűkítése

**Files:**
- Modify: `src-tauri/src/jsonl/types.rs`

- [ ] **Step 1: Drop user_work_seconds from WorklogRow**

Modify `src-tauri/src/jsonl/types.rs`. Find the `pub struct WorklogRow { ... }` block (around lines 204–211) and replace it with:

```rust
/// One worklog row per (session, day).
#[derive(Debug, Clone, Serialize)]
pub struct WorklogRow {
    pub session_id: String,
    pub project_path: Option<String>,
    pub day: String,                    // YYYY-MM-DD (UTC)
    pub claude_work_seconds: i64,
    pub turn_count: i64,
}
```

- [ ] **Step 2: Drop user_seconds and user_capped from TurnWorklog**

In the same file, find the `pub struct TurnWorklog { ... }` block (around lines 215–222) and replace it with:

```rust
/// Per-turn breakdown for a session (used in detail panel).
#[derive(Debug, Clone, Serialize)]
pub struct TurnWorklog {
    pub index: i64,                     // 1-based
    pub user_message_at: String,        // RFC3339 — the real user message timestamp
    pub last_assistant_at: String,      // RFC3339 — the turn's last assistant end_timestamp
    pub claude_seconds: i64,
}
```

- [ ] **Step 3: Verify cargo build still has expected errors (in db/mod.rs, commands/worklog.rs, import.rs)**

Run: `cargo build --manifest-path src-tauri/Cargo.toml 2>&1 | grep -E "error\[|^error:" | head -20`
Expected: errors in `src-tauri/src/db/mod.rs` (referencing `row.user_work_seconds`), in `src-tauri/src/commands/worklog.rs` (struct fields), and in `src-tauri/src/jsonl/import.rs` (signature mismatch). These are addressed in Tasks 5–7.

- [ ] **Step 4: DO NOT commit yet** — continue to Task 5.

---

## Task 5: db/mod.rs worklog query-k és idle threshold helperek

**Files:**
- Modify: `src-tauri/src/db/mod.rs`

- [ ] **Step 1: Drop the idle threshold helpers**

Modify `src-tauri/src/db/mod.rs`. Find lines 66–76 (`get_idle_threshold_seconds` and `set_idle_threshold_seconds`) and delete them entirely. The block to delete:

```rust
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

- [ ] **Step 2: Update upsert_worklog to drop user_work_seconds**

In the same file, find `pub fn upsert_worklog` (around lines 835–858) and replace its body with:

```rust
    pub fn upsert_worklog(&self, row: &crate::jsonl::types::WorklogRow) -> Result<(), AppError> {
        let conn = self.conn.lock().map_err(|e| AppError::Database(e.to_string()))?;
        let now = chrono::Utc::now().to_rfc3339();
        conn.execute(
            "INSERT INTO worklogs (session_id, project_path, day, claude_work_seconds, turn_count, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)
             ON CONFLICT(session_id, day) DO UPDATE SET
                project_path = excluded.project_path,
                claude_work_seconds = excluded.claude_work_seconds,
                turn_count = excluded.turn_count,
                updated_at = excluded.updated_at",
            rusqlite::params![
                row.session_id,
                row.project_path,
                row.day,
                row.claude_work_seconds,
                row.turn_count,
                now,
            ],
        )?;
        Ok(())
    }
```

- [ ] **Step 3: Update get_worklog_summary_for_session — return (claude_seconds, turn_count) tuple**

In the same file, find `pub fn get_worklog_summary_for_session` (around lines 875–890) and replace it with:

```rust
    pub fn get_worklog_summary_for_session(
        &self,
        session_id: &str,
    ) -> Result<(i64, i64), AppError> {
        let conn = self.conn.lock().map_err(|e| AppError::Database(e.to_string()))?;
        let row: (Option<i64>, Option<i64>) = conn.query_row(
            "SELECT
                COALESCE(SUM(claude_work_seconds), 0),
                COALESCE(SUM(turn_count), 0)
             FROM worklogs WHERE session_id = ?1",
            rusqlite::params![session_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )?;
        Ok((row.0.unwrap_or(0), row.1.unwrap_or(0)))
    }
```

- [ ] **Step 4: Update list_worklog_summaries — drop user column**

In the same file, find `pub fn list_worklog_summaries` (around lines 892–923) and replace its body with:

```rust
    pub fn list_worklog_summaries(
        &self,
        session_ids: &[String],
    ) -> Result<std::collections::HashMap<String, (i64, i64)>, AppError> {
        if session_ids.is_empty() {
            return Ok(std::collections::HashMap::new());
        }
        let conn = self.conn.lock().map_err(|e| AppError::Database(e.to_string()))?;
        let placeholders = vec!["?"; session_ids.len()].join(",");
        let sql = format!(
            "SELECT session_id, SUM(claude_work_seconds), SUM(turn_count)
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
            ))
        })?;
        let mut map = std::collections::HashMap::new();
        for row in rows {
            let (sid, c, t) = row?;
            map.insert(sid, (c, t));
        }
        Ok(map)
    }
```

- [ ] **Step 5: Update get_worklog_summary_for_range — drop user column**

In the same file, find `pub fn get_worklog_summary_for_range` (around lines 925–941) and replace it with:

```rust
    pub fn get_worklog_summary_for_range(
        &self,
        start_day: &str,
        end_day: &str,
    ) -> Result<(i64, i64), AppError> {
        let conn = self.conn.lock().map_err(|e| AppError::Database(e.to_string()))?;
        let row: (Option<i64>, Option<i64>) = conn.query_row(
            "SELECT
                COALESCE(SUM(claude_work_seconds), 0),
                COUNT(DISTINCT session_id)
             FROM worklogs WHERE day >= ?1 AND day <= ?2",
            rusqlite::params![start_day, end_day],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )?;
        Ok((row.0.unwrap_or(0), row.1.unwrap_or(0)))
    }
```

- [ ] **Step 6: Update get_worklog_timeseries — drop user column**

In the same file, find `pub fn get_worklog_timeseries` (around lines 943–962) and replace it with:

```rust
    pub fn get_worklog_timeseries(
        &self,
        start_day: &str,
        end_day: &str,
    ) -> Result<Vec<(String, i64)>, AppError> {
        let conn = self.conn.lock().map_err(|e| AppError::Database(e.to_string()))?;
        let mut stmt = conn.prepare(
            "SELECT day, COALESCE(SUM(claude_work_seconds), 0)
             FROM worklogs WHERE day >= ?1 AND day <= ?2
             GROUP BY day ORDER BY day ASC",
        )?;
        let rows = stmt.query_map(rusqlite::params![start_day, end_day], |r| {
            Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?))
        })?;
        let mut out = Vec::new();
        for row in rows {
            out.push(row?);
        }
        Ok(out)
    }
```

- [ ] **Step 7: Update get_worklog_by_project_for_day — drop user column**

In the same file, find `pub fn get_worklog_by_project_for_day` (around lines 964–991) and replace it with:

```rust
    pub fn get_worklog_by_project_for_day(
        &self,
        day: &str,
    ) -> Result<Vec<(Option<String>, i64, i64)>, AppError> {
        let conn = self.conn.lock().map_err(|e| AppError::Database(e.to_string()))?;
        let mut stmt = conn.prepare(
            "SELECT project_path,
                    COUNT(DISTINCT session_id),
                    COALESCE(SUM(claude_work_seconds), 0)
             FROM worklogs WHERE day = ?1
             GROUP BY project_path
             ORDER BY SUM(claude_work_seconds) DESC",
        )?;
        let rows = stmt.query_map(rusqlite::params![day], |r| {
            Ok((
                r.get::<_, Option<String>>(0)?,
                r.get::<_, i64>(1)?,
                r.get::<_, i64>(2)?,
            ))
        })?;
        let mut out = Vec::new();
        for row in rows {
            out.push(row?);
        }
        Ok(out)
    }
```

- [ ] **Step 8: DO NOT commit — continue to Task 6.**

---

## Task 6: commands/worklog.rs response shape-ek

**Files:**
- Modify: `src-tauri/src/commands/worklog.rs`

- [ ] **Step 1: Replace the file contents**

Open `src-tauri/src/commands/worklog.rs` and replace the entire file with:

```rust
use std::collections::HashMap;
use serde::Serialize;
use tauri::{AppHandle, State};

use crate::error::AppError;
use crate::events;
use crate::jsonl::types::TurnWorklog;
use crate::state::AppState;

#[derive(Serialize)]
pub struct WorklogTimeseriesPoint {
    pub day: String,
    pub claude_seconds: i64,
}

#[derive(Serialize)]
pub struct WorklogSummary {
    pub total_claude_seconds: i64,
    pub turn_count: i64,
    pub session_count: i64,
    pub timeseries: Vec<WorklogTimeseriesPoint>,
}

#[derive(Serialize)]
pub struct DayWorklogProject {
    pub project_path: Option<String>,
    pub session_count: i64,
    pub claude_work_seconds: i64,
}

#[tauri::command]
pub async fn get_session_worklog(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<WorklogSummary, AppError> {
    let (c, t) = state.database().get_worklog_summary_for_session(&session_id)?;
    Ok(WorklogSummary {
        total_claude_seconds: c,
        turn_count: t,
        session_count: if c > 0 { 1 } else { 0 },
        timeseries: Vec::new(),
    })
}

#[tauri::command]
pub async fn get_session_worklog_turns(
    _state: State<'_, AppState>,
    _session_id: String,
) -> Result<Vec<TurnWorklog>, AppError> {
    // v1: per-turn breakdown is computed on demand from the JSONL file.
    // For the initial release we return an empty list — the detail panel
    // gracefully hides the per-turn list when empty (the summary card still works).
    Ok(Vec::new())
}

#[tauri::command]
pub async fn get_dashboard_worklog(
    state: State<'_, AppState>,
    range: String,
) -> Result<WorklogSummary, AppError> {
    let (start, end) = crate::commands::dashboard::range_to_days(&range, state.database())?;
    let (c, sessions) = state
        .database()
        .get_worklog_summary_for_range(&start, &end)?;
    let series = state.database().get_worklog_timeseries(&start, &end)?;
    let timeseries = series
        .into_iter()
        .map(|(day, cs)| WorklogTimeseriesPoint {
            day,
            claude_seconds: cs,
        })
        .collect();
    Ok(WorklogSummary {
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
        .map(|(p, sc, c)| DayWorklogProject {
            project_path: p,
            session_count: sc,
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
        let (c, t) = summaries.get(&sid).copied().unwrap_or((0, 0));
        out.insert(sid.clone(), WorklogSummary {
            total_claude_seconds: c,
            turn_count: t,
            session_count: if c > 0 { 1 } else { 0 },
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
    let result: Result<(), String> = tauri::async_runtime::spawn_blocking(move || {
        crate::jsonl::import::run_import(&db, true).map(|_| ())
    })
    .await
    .map_err(|e| AppError::Database(e.to_string()))?;

    result.map_err(AppError::Database)?;
    events::frontend::emit_db_updated(&app);
    Ok(())
}
```

- [ ] **Step 2: DO NOT commit — continue to Task 7.**

---

## Task 7: commands/settings.rs és lib.rs registration

**Files:**
- Modify: `src-tauri/src/commands/settings.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Drop idle threshold commands from settings.rs**

Modify `src-tauri/src/commands/settings.rs`. Delete the two command functions at lines 45–61 (`get_idle_threshold_minutes` and `update_idle_threshold_minutes`). The block to delete:

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

- [ ] **Step 2: Drop the registration in lib.rs**

Modify `src-tauri/src/lib.rs`. Find the two lines that register the deleted commands (around lines 137–138):

```rust
            commands::settings::get_idle_threshold_minutes,
            commands::settings::update_idle_threshold_minutes,
```

Delete both lines.

- [ ] **Step 3: DO NOT commit — continue to Task 8.**

---

## Task 8: import.rs — új calculate_worklog signature

**Files:**
- Modify: `src-tauri/src/jsonl/import.rs`

- [ ] **Step 1: Drop the idle threshold lookup and update the call**

Modify `src-tauri/src/jsonl/import.rs`. Find lines 219–229 (the worklog-computation block):

```rust
                // Compute worklog rows from the same message list, keyed on the DB UUID
                // so that frontend queries (which use SessionRecord.id) resolve correctly.
                let messages = extract_session_messages(&session_entries, &pricing);
                let idle_threshold = db.get_idle_threshold_seconds().unwrap_or(300);
                let project_path_str = enriched.project_path.as_deref();
                let (worklog_rows, _turns) = crate::jsonl::worklog::calculate_worklog(
                    &messages,
                    idle_threshold,
                    project_path_str,
                    &db_session_id,
                );
```

Replace with:

```rust
                // Compute worklog rows from the same message list, keyed on the DB UUID
                // so that frontend queries (which use SessionRecord.id) resolve correctly.
                let messages = extract_session_messages(&session_entries, &pricing);
                let project_path_str = enriched.project_path.as_deref();
                let (worklog_rows, _turns) = crate::jsonl::worklog::calculate_worklog(
                    &messages,
                    project_path_str,
                    &db_session_id,
                );
```

- [ ] **Step 2: Run cargo build — expect success now**

Run: `cargo build --manifest-path src-tauri/Cargo.toml`
Expected: builds cleanly, no errors. Warnings about unused imports may appear — fix any that are introduced by the changes (e.g., unused `idle_threshold` variable would have been caught here).

- [ ] **Step 3: Run all backend tests**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: all tests pass, including the new `worklog::tests::*` tests and `normalize::tests::assistant_end_timestamp_is_latest_of_merged_entries`.

- [ ] **Step 4: Commit (backend complete)**

```bash
git add src-tauri/src/jsonl/types.rs src-tauri/src/jsonl/worklog.rs src-tauri/src/jsonl/import.rs src-tauri/src/db/mod.rs src-tauri/src/commands/worklog.rs src-tauri/src/commands/settings.rs src-tauri/src/lib.rs
git commit -m "feat(worklog): drop user-time, make Claude-time precise

calculate_worklog now uses real-user → last-assistant end_timestamp
wall clock (tool execution included), with tool_result user messages
detected via empty content_text and not breaking turns. WorklogRow
and TurnWorklog drop user_*_seconds fields; idle threshold setting
and commands removed.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Frontend types szűkítése

**Files:**
- Modify: `src/types/index.ts`

- [ ] **Step 1: Replace the Worklog type block**

Modify `src/types/index.ts`. Replace lines 161–192 (the entire `// ── Worklog Types ─` section) with:

```typescript
// ── Worklog Types ────────────────────────────────────────────

export interface WorklogTimeseriesPoint {
  day: string;
  claude_seconds: number;
}

export interface WorklogSummary {
  total_claude_seconds: number;
  turn_count: number;
  session_count: number;
  timeseries: WorklogTimeseriesPoint[];
}

export interface TurnWorklog {
  index: number;
  user_message_at: string;
  last_assistant_at: string;
  claude_seconds: number;
}

export interface DayWorklogProject {
  project_path: string | null;
  session_count: number;
  claude_work_seconds: number;
}
```

- [ ] **Step 2: DO NOT typecheck yet — continue to Task 10 (consumers still reference dropped fields).**

---

## Task 10: tauri.ts wrapper-ek

**Files:**
- Modify: `src/lib/tauri.ts`

- [ ] **Step 1: Remove the two deleted command wrappers**

Open `src/lib/tauri.ts`. Find lines 193–199 (the `getIdleThresholdMinutes` and `updateIdleThresholdMinutes` exports) and delete them entirely. The block to delete will look like:

```typescript
export async function getIdleThresholdMinutes(): Promise<number> {
  return invoke<number>('get_idle_threshold_minutes');
}

export async function updateIdleThresholdMinutes(minutes: number): Promise<void> {
  await invoke<void>('update_idle_threshold_minutes', { minutes });
}
```

- [ ] **Step 2: DO NOT typecheck yet — continue to Task 11.**

---

## Task 11: WorklogPair komponens törlése

**Files:**
- Delete: `src/components/ui/WorklogPair.tsx`

- [ ] **Step 1: Delete the file**

Run: `rm src/components/ui/WorklogPair.tsx`

- [ ] **Step 2: DO NOT typecheck yet — consumers still import it. Continue to Task 12.**

---

## Task 12: WorklogBentoCard csak Claude

**Files:**
- Modify: `src/features/dashboard/WorklogBentoCard.tsx`

- [ ] **Step 1: Replace the file contents**

Open `src/features/dashboard/WorklogBentoCard.tsx` and replace the entire file with:

```tsx
import { Clock } from 'lucide-react';
import { motion } from 'motion/react';
import type { WorklogSummary } from '../../types';
import { formatDuration } from '../../lib/duration';

interface WorklogBentoCardProps {
  data: WorklogSummary | null;
  onClick: () => void;
  layoutId: string;
}

export function WorklogBentoCard({ data, onClick, layoutId }: WorklogBentoCardProps) {
  const claudeSecs = data?.total_claude_seconds ?? 0;
  const sessions = data?.session_count ?? 0;

  return (
    <motion.div
      layoutId={layoutId}
      onClick={onClick}
      className="glass-card p-4 flex flex-col justify-between relative overflow-hidden glow-green cursor-pointer"
      style={{ borderRadius: 16 }}
      transition={{ layout: { duration: 0.4, ease: [0.4, 0, 0.2, 1] } }}
    >
      <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-text-secondary relative z-10">
        <Clock size={13} aria-hidden strokeWidth={2} />
        Worklog
      </span>
      <div className="relative z-10">
        <div className="text-2xl font-bold tracking-tight text-accent-purple whitespace-nowrap counter-animate">
          {formatDuration(claudeSecs)}
        </div>
        <div className="mt-1 text-[10px] text-text-secondary">
          <span>{sessions} session{sessions !== 1 ? 's' : ''}</span>
        </div>
      </div>
    </motion.div>
  );
}
```

---

## Task 13: DayWorklogDialog csak Claude

**Files:**
- Modify: `src/features/dashboard/DayWorklogDialog.tsx`

- [ ] **Step 1: Replace the file contents**

Open `src/features/dashboard/DayWorklogDialog.tsx` and replace the entire file with:

```tsx
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useEffect } from 'react';
import { Bot, Clock, X } from 'lucide-react';

import { useDayWorklog } from '../../hooks/useDayWorklog';
import { formatDuration } from '../../lib/duration';

interface DayWorklogDialogProps {
  day: string | null;
  onClose: () => void;
}

function projectName(path: string | null): string {
  if (!path) return '(no project)';
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] || path;
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

  const totalClaude = rows.reduce((s, r) => s + r.claude_work_seconds, 0);
  const totalSessions = rows.reduce((s, r) => s + r.session_count, 0);

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="backdrop"
        className="fixed inset-0 z-50 bg-black/30 backdrop-blur-md"
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
        <div
          className="pointer-events-auto w-full max-w-2xl rounded-2xl p-6 shadow-2xl"
          style={{
            background: 'var(--glass-tint)',
            border: '1px solid var(--glass-border)',
            backdropFilter: 'blur(40px) saturate(180%) brightness(110%)',
            WebkitBackdropFilter: 'blur(40px) saturate(180%) brightness(110%)',
          }}
        >
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-lg font-semibold text-text-primary">
                <Clock size={16} aria-hidden strokeWidth={2} />
                {formatDayHeading(day)}
              </div>
              <div className="text-xs text-text-secondary mt-0.5">
                {rows.length} project{rows.length === 1 ? '' : 's'} · {totalSessions} session
                {totalSessions === 1 ? '' : 's'}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <div className="rounded-md px-3 py-1.5 bg-[var(--bg-card)] inline-flex items-center gap-1 text-xs text-accent-purple">
                <Bot size={12} aria-hidden strokeWidth={2} />
                <span className="font-medium">{formatDuration(totalClaude)}</span>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-md p-1 text-text-secondary hover:bg-[var(--bg-card)] hover:text-text-primary transition"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {rows.length === 0 ? (
            <div className="py-8 text-center text-sm text-text-secondary">
              No worklog data for this day
            </div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {rows.map((r) => {
                const name = projectName(r.project_path);
                const fullPath = r.project_path ?? '(no project)';
                return (
                  <div
                    key={fullPath}
                    className="flex items-center justify-between rounded-lg px-3 py-2.5 bg-[var(--bg-card)]"
                    title={fullPath}
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-text-primary">{name}</div>
                      <div className="text-[11px] text-text-secondary">
                        {r.session_count} session{r.session_count === 1 ? '' : 's'}
                      </div>
                    </div>
                    <span className="inline-flex items-center gap-1 text-xs text-accent-purple">
                      <Bot size={12} aria-hidden strokeWidth={2} />
                      <span className="font-medium">{formatDuration(r.claude_work_seconds)}</span>
                    </span>
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

---

## Task 14: ExpandedWidgetChart worklog branch

**Files:**
- Modify: `src/features/dashboard/ExpandedWidgetChart.tsx`

- [ ] **Step 1: Replace the worklog branch**

Open `src/features/dashboard/ExpandedWidgetChart.tsx`. Find the worklog branch starting at line 65 (`if (widgetType === 'worklog') { ... }`) and ending around line 175 (the closing `</div> ); }` that ends the worklog branch). Replace the entire block with:

```tsx
  // Worklog chart rendered separately
  if (widgetType === 'worklog') {
    const worklogSeries = (worklogData?.timeseries ?? []).map((p) => ({
      day: p.day,
      claude: Math.round(p.claude_seconds / 60),
    }));

    const tooltipStyle = {
      backgroundColor: colors.tooltipBg,
      backdropFilter: 'blur(40px) saturate(180%)',
      border: `1px solid ${colors.tooltipBorder}`,
      borderRadius: '12px',
      fontSize: '12px',
      color: colors.tooltipText,
      boxShadow: colors.tooltipShadow,
    };

    const formatMinutes = (v: number) => {
      const h = Math.floor(v / 60);
      const m = v % 60;
      return h > 0 ? `${h}h ${m}m` : `${m}m`;
    };

    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-[var(--text-secondary)]">
            ⏱ Worklog
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); onClose(); }}
            className="w-7 h-7 flex items-center justify-center rounded-full
                       hover:bg-white/10 transition-colors text-[var(--text-secondary)]
                       hover:text-[var(--text-primary)]"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M1 1l12 12M13 1L1 13" />
            </svg>
          </button>
        </div>

        <motion.div
          className="flex-1 min-h-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.25, duration: 0.3 }}
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={worklogSeries} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="grad-claude" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#a855f7" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#a855f7" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={colors.grid} strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="day"
                tickFormatter={(d: string) => formatDate(d)}
                stroke={colors.axis}
                fontSize={10}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tickFormatter={formatMinutes}
                stroke={colors.axis}
                fontSize={10}
                tickLine={false}
                axisLine={false}
                width={50}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                labelFormatter={(label) => formatDate(String(label))}
                formatter={(value) => [
                  formatMinutes(typeof value === 'number' ? value : 0),
                  'Claude',
                ]}
                cursor={{ stroke: colors.axis, strokeDasharray: '3 3' }}
              />
              <Area
                type="monotone"
                dataKey="claude"
                stroke="#a855f7"
                strokeWidth={2}
                fill="url(#grad-claude)"
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: '#a855f7', fill: 'var(--bg-primary)' }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </motion.div>
      </div>
    );
  }
```

---

## Task 15: SessionsList — WorklogPair lecserélve

**Files:**
- Modify: `src/features/sessions/SessionsList.tsx`

- [ ] **Step 1: Drop the WorklogPair import**

Open `src/features/sessions/SessionsList.tsx`. Find line 3:

```tsx
import { WorklogPair } from '../../components/ui/WorklogPair';
```

Replace it with:

```tsx
import { Bot } from 'lucide-react';
import { formatDuration } from '../../lib/duration';
```

- [ ] **Step 2: Replace the worklog rendering block**

In the same file, find lines 160–171 (the `(() => { const w = worklogs[session.id]; if (!w || ...) return null; return (<WorklogPair ... />); })()` block) and replace with:

```tsx
            {(() => {
              const w = worklogs[session.id];
              if (!w || w.total_claude_seconds === 0) return null;
              return (
                <span className="mt-1 inline-flex items-center gap-1 text-xs text-accent-purple">
                  <Bot size={12} aria-hidden strokeWidth={2} />
                  <span className="font-medium">{formatDuration(w.total_claude_seconds)}</span>
                </span>
              );
            })()}
```

---

## Task 16: SessionDetailPanel — Worklog szekció Claude-only

**Files:**
- Modify: `src/features/sessions/SessionDetailPanel.tsx`

- [ ] **Step 1: Drop the WorklogPair import**

Open `src/features/sessions/SessionDetailPanel.tsx`. Find line 21 (`import { WorklogPair } ...`) and delete that import line entirely.

If `Bot` is not already imported from `lucide-react` in this file, add it to the existing lucide-react import. Check the existing imports near the top of the file; if there's a line like `import { Foo, Bar } from 'lucide-react';`, change it to include `Bot`. If `Bot` is already imported, no change needed. (To check: `grep -n "from 'lucide-react'" src/features/sessions/SessionDetailPanel.tsx`).

If `formatDuration` is not already imported from `../../lib/duration`, add it. Check via `grep -n "formatDuration" src/features/sessions/SessionDetailPanel.tsx`.

- [ ] **Step 2: Replace the Worklog block**

Find lines 745–787 (the entire `{worklog && (worklog.total_user_seconds > 0 || ...) && ( ... )}` block) and replace with:

```tsx
              {/* Worklog */}
              {worklog && worklog.total_claude_seconds > 0 && (
                <div className="space-y-3">
                  <div className="text-[11px] font-medium text-[var(--text-secondary)] uppercase tracking-wide">
                    Worklog
                  </div>
                  <div className="flex items-baseline gap-6">
                    <span className="inline-flex items-center gap-2 text-2xl font-bold text-accent-purple whitespace-nowrap">
                      <Bot size={18} aria-hidden strokeWidth={2} />
                      {formatDuration(worklog.total_claude_seconds)}
                    </span>
                    <div className="text-xs text-[var(--text-secondary)]">
                      {worklog.turn_count} turn{worklog.turn_count === 1 ? '' : 's'}
                    </div>
                  </div>

                  {turns.length > 0 && (
                    <div className="max-h-64 overflow-y-auto rounded-lg border border-[var(--border-subtle)] divide-y divide-[var(--border-subtle)]">
                      {turns.map((t) => (
                        <div key={t.index} className="flex items-center justify-between px-3 py-2 text-xs">
                          <span className="text-[var(--text-secondary)]">Turn {t.index}</span>
                          <span className="inline-flex items-center gap-1 text-accent-purple">
                            <Bot size={12} aria-hidden strokeWidth={2} />
                            <span className="font-medium">{formatDuration(t.claude_seconds)}</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
```

---

## Task 17: SettingsPage — idle threshold lecserélve recompute gombra

**Files:**
- Modify: `src/pages/SettingsPage.tsx`

- [ ] **Step 1: Drop the imports for the deleted commands**

Open `src/pages/SettingsPage.tsx`. Find the import block at lines 4–13 and replace with:

```tsx
import {
  clearLocalData,
  runJsonlImport,
  getModelPricing,
  updateModelPricing,
  resetModelPricing,
  recomputeWorklogs,
} from '../lib/tauri';
```

- [ ] **Step 2: Drop the idle state hooks and handler**

In the same file, find lines 41–43 (the idle state declarations):

```tsx
  // Idle threshold state
  const [idleMinutes, setIdleMinutes] = useState<number>(5);
  const [savingIdle, setSavingIdle] = useState(false);
```

Delete those three lines.

Find lines 59–61 (the idle threshold loader):

```tsx
  useEffect(() => {
    getIdleThresholdMinutes().then(setIdleMinutes).catch(() => {});
  }, []);
```

Delete those three lines.

Find lines 63–71 (the `onIdleSave` handler):

```tsx
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

Replace those nine lines with a recompute-only handler:

```tsx
  const [recomputing, setRecomputing] = useState(false);
  const onRecomputeWorklogs = async () => {
    setRecomputing(true);
    try {
      await recomputeWorklogs();
      toast({ title: 'Worklogs recomputed', variant: 'success' });
    } catch (e) {
      toast({ title: 'Recompute failed', description: String(e), variant: 'error' });
    } finally {
      setRecomputing(false);
    }
  };
```

- [ ] **Step 3: Replace the GlassCard JSX block**

Find lines 250–279 (the entire `<GlassCard>` block titled "User Idle Threshold") and replace with:

```tsx
      <GlassCard>
        <h2 className="text-sm font-medium text-text-primary mb-3">
          Worklog
        </h2>
        <p className="text-xs text-text-secondary mb-3">
          Recompute worklog totals across all sessions. Use this if numbers look wrong after an upgrade.
        </p>
        <button
          type="button"
          onClick={onRecomputeWorklogs}
          disabled={recomputing}
          className="px-4 py-1.5 text-xs font-medium rounded-full transition-colors
            bg-accent-cyan/10 text-accent-cyan border border-accent-cyan/20
            hover:bg-accent-cyan/20
            disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {recomputing ? 'Recomputing…' : 'Recompute Worklogs'}
        </button>
      </GlassCard>
```

---

## Task 18: Frontend typecheck + build verification

**Files:** none (verification only)

- [ ] **Step 1: Run typecheck**

Run: `npm run typecheck`
Expected: zero errors. If errors appear, they will most likely be:
- A leftover reference to `total_user_seconds`, `user_seconds`, `user_capped`, `user_work_seconds`, `WorklogPair`, `getIdleThresholdMinutes`, or `updateIdleThresholdMinutes`. Fix by removing the reference.
- An unused import (e.g., `Bot` imported but not used). Remove.

- [ ] **Step 2: Run build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Commit (frontend complete)**

```bash
git add src/types/index.ts src/lib/tauri.ts src/components/ui/WorklogPair.tsx src/features/dashboard/WorklogBentoCard.tsx src/features/dashboard/DayWorklogDialog.tsx src/features/dashboard/ExpandedWidgetChart.tsx src/features/sessions/SessionsList.tsx src/features/sessions/SessionDetailPanel.tsx src/pages/SettingsPage.tsx
git commit -m "feat(worklog): drop user-time UI; show only Claude time

WorklogPair component removed; per-screen renderings simplified to a
single Claude-time label. Settings page replaces idle-threshold input
with a Recompute Worklogs button.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 19: Smoke test futtatás

**Files:** none (manual verification)

- [ ] **Step 1: Start the dev app**

Run: `npm run tauri dev`
Expected: app boots, V11 migration runs (check tracing log for "Applied migration V11"). The worklogs table is empty after migration.

- [ ] **Step 2: Trigger recompute**

In the running app: open Settings → click "Recompute Worklogs". Wait for the toast. Then navigate to:
- **Dashboard** — Worklog bento card shows only Claude time (e.g., "1h 23m"); the expanded widget chart shows a single purple area.
- **Day worklog dialog** (click on a heatmap day) — header shows only the Claude duration; per-project rows show only Claude duration.
- **Sessions list** — each session item shows only the Claude duration label (or no label if 0).
- **Session detail panel** — Worklog section shows only Claude time + turn count; per-turn breakdown shows only Claude duration (no `capped` badge).

- [ ] **Step 3: Verify a known-precise turn**

Pick a recent session with tool use (e.g., a session where you ran multiple bash/read commands). Open it. Compare:
- The session's `total_claude_seconds` should now reflect wall clock from each real-user message to the corresponding final-assistant `end_timestamp`, INCLUDING tool execution gaps.
- Total should be visibly larger than the pre-migration value (because tool execution time was previously bucketed into user_seconds).

- [ ] **Step 4: Stop the dev app**

If the smoke test passes, no further code changes — go to Task 20.

If something is wrong, isolate the issue, fix the offending file, run `npm run typecheck` + `cargo test`, then commit a follow-up fix before going to Task 20.

---

## Task 20: Final test sweep

**Files:** none (verification)

- [ ] **Step 1: Run full backend tests**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: all tests pass.

- [ ] **Step 2: Run frontend typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: both succeed.

- [ ] **Step 3: Confirm clean git state**

Run: `git status`
Expected: working tree clean (everything committed).

- [ ] **Step 4: Done.** The implementation is complete.
