use rusqlite::Connection;

use crate::error::AppError;

const CURRENT_VERSION: i64 = 10;

const V1_UP: &str = r#"
CREATE TABLE IF NOT EXISTS app_state (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    source_session_id TEXT UNIQUE,
    first_seen_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    model_summary TEXT,
    total_input_tokens INTEGER DEFAULT 0,
    total_output_tokens INTEGER DEFAULT 0,
    total_cached_input_tokens INTEGER DEFAULT 0,
    total_reasoning_tokens INTEGER DEFAULT 0,
    total_tokens INTEGER DEFAULT 0,
    total_cost_usd REAL DEFAULT 0,
    event_count INTEGER DEFAULT 0,
    tool_event_count INTEGER DEFAULT 0,
    raw_metadata_json TEXT
);

CREATE TABLE IF NOT EXISTS metric_points (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,
    session_id TEXT,
    metric_name TEXT NOT NULL,
    metric_type TEXT NOT NULL,
    value REAL NOT NULL,
    unit TEXT,
    model TEXT,
    attributes_json TEXT
);

CREATE TABLE IF NOT EXISTS events_raw (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,
    session_id TEXT,
    event_name TEXT NOT NULL,
    payload_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS daily_usage (
    day TEXT PRIMARY KEY,
    total_input_tokens INTEGER DEFAULT 0,
    total_output_tokens INTEGER DEFAULT 0,
    total_cached_input_tokens INTEGER DEFAULT 0,
    total_reasoning_tokens INTEGER DEFAULT 0,
    total_tokens INTEGER DEFAULT 0,
    total_cost_usd REAL DEFAULT 0,
    session_count INTEGER DEFAULT 0,
    event_count INTEGER DEFAULT 0,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS models_daily (
    day TEXT NOT NULL,
    model TEXT NOT NULL,
    total_tokens INTEGER DEFAULT 0,
    total_cost_usd REAL DEFAULT 0,
    event_count INTEGER DEFAULT 0,
    PRIMARY KEY (day, model)
);

CREATE INDEX IF NOT EXISTS idx_metric_points_timestamp ON metric_points(timestamp);
CREATE INDEX IF NOT EXISTS idx_metric_points_session_id ON metric_points(session_id);
CREATE INDEX IF NOT EXISTS idx_events_raw_timestamp ON events_raw(timestamp);
CREATE INDEX IF NOT EXISTS idx_events_raw_session_id ON events_raw(session_id);
CREATE INDEX IF NOT EXISTS idx_sessions_last_seen ON sessions(last_seen_at);
"#;

const V2_UP: &str = r#"
-- Track discovered JSONL source files
CREATE TABLE IF NOT EXISTS source_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_path TEXT UNIQUE NOT NULL,
    file_type TEXT NOT NULL DEFAULT 'history',
    file_size INTEGER DEFAULT 0,
    last_modified_at TEXT,
    last_scanned_at TEXT,
    last_offset INTEGER DEFAULT 0,
    record_count INTEGER DEFAULT 0,
    created_at TEXT NOT NULL
);

-- Track individual parsed records for dedup
CREATE TABLE IF NOT EXISTS source_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_file_id INTEGER NOT NULL,
    record_key TEXT UNIQUE NOT NULL,
    session_id TEXT,
    timestamp TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (source_file_id) REFERENCES source_files(id)
);

-- Track import runs
CREATE TABLE IF NOT EXISTS imports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at TEXT NOT NULL,
    finished_at TEXT,
    status TEXT NOT NULL DEFAULT 'running',
    files_scanned INTEGER DEFAULT 0,
    records_parsed INTEGER DEFAULT 0,
    records_imported INTEGER DEFAULT 0,
    records_skipped INTEGER DEFAULT 0,
    error_message TEXT
);

-- Add source tracking to existing tables
ALTER TABLE sessions ADD COLUMN primary_source_kind TEXT NOT NULL DEFAULT 'otel';
ALTER TABLE sessions ADD COLUMN source_confidence TEXT NOT NULL DEFAULT 'high';
ALTER TABLE sessions ADD COLUMN import_first_seen_at TEXT;
ALTER TABLE sessions ADD COLUMN live_last_seen_at TEXT;
ALTER TABLE sessions ADD COLUMN project_path TEXT;
ALTER TABLE sessions ADD COLUMN display_text TEXT;

ALTER TABLE metric_points ADD COLUMN source_kind TEXT NOT NULL DEFAULT 'otel';
ALTER TABLE metric_points ADD COLUMN source_record_id INTEGER;

ALTER TABLE events_raw ADD COLUMN source_kind TEXT NOT NULL DEFAULT 'otel';
ALTER TABLE events_raw ADD COLUMN source_record_id INTEGER;

ALTER TABLE daily_usage ADD COLUMN jsonl_contributed INTEGER DEFAULT 0;
ALTER TABLE daily_usage ADD COLUMN otel_contributed INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_source_records_key ON source_records(record_key);
CREATE INDEX IF NOT EXISTS idx_source_records_session ON source_records(session_id);
CREATE INDEX IF NOT EXISTS idx_sessions_source_kind ON sessions(primary_source_kind);
CREATE INDEX IF NOT EXISTS idx_sessions_project_path ON sessions(project_path);
"#;

const V3_UP: &str = r#"
-- Migrate all sessions to JSONL-only source kind
UPDATE sessions SET primary_source_kind = 'jsonl' WHERE primary_source_kind IN ('otel', 'both');

-- Drop OTel-only tables
DROP TABLE IF EXISTS metric_points;
DROP TABLE IF EXISTS events_raw;
"#;

const V4_UP: &str = r#"
ALTER TABLE sessions ADD COLUMN bookmarked INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_sessions_bookmarked ON sessions(bookmarked);
"#;

const V5_UP: &str = r#"
ALTER TABLE sessions ADD COLUMN custom_name TEXT;
ALTER TABLE sessions ADD COLUMN search_content TEXT;
"#;

const V6_UP: &str = r#"
CREATE TABLE IF NOT EXISTS model_pricing (
    model_key TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    input_per_million REAL NOT NULL,
    output_per_million REAL NOT NULL,
    cache_read_per_million REAL NOT NULL,
    updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO model_pricing (model_key, display_name, input_per_million, output_per_million, cache_read_per_million, updated_at)
VALUES
    ('opus', 'Claude Opus', 15.0, 75.0, 1.5, datetime('now')),
    ('sonnet', 'Claude Sonnet', 3.0, 15.0, 0.3, datetime('now')),
    ('haiku', 'Claude Haiku', 0.25, 1.25, 0.03, datetime('now'));
"#;

const V7_UP: &str = r#"
CREATE TABLE IF NOT EXISTS sentiment_cache (
    session_id TEXT NOT NULL,
    message_index INTEGER NOT NULL,
    label TEXT NOT NULL,
    score REAL NOT NULL,
    positive REAL NOT NULL,
    negative REAL NOT NULL,
    neutral_score REAL NOT NULL,
    is_technical INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    PRIMARY KEY (session_id, message_index)
);

CREATE INDEX IF NOT EXISTS idx_sentiment_session ON sentiment_cache(session_id);
"#;

const V8_UP: &str = r#"
ALTER TABLE model_pricing ADD COLUMN cache_write_per_million REAL NOT NULL DEFAULT 0;

UPDATE model_pricing SET cache_write_per_million = 6.25,  input_per_million = 5.0,  output_per_million = 25.0, cache_read_per_million = 0.50 WHERE model_key = 'opus';
UPDATE model_pricing SET cache_write_per_million = 3.75,  input_per_million = 3.0,  output_per_million = 15.0, cache_read_per_million = 0.30 WHERE model_key = 'sonnet';
UPDATE model_pricing SET cache_write_per_million = 1.25,  input_per_million = 1.0,  output_per_million = 5.0,  cache_read_per_million = 0.10 WHERE model_key = 'haiku';
"#;

const V9_UP: &str = r#"
DROP TABLE IF EXISTS sentiment_cache;
DELETE FROM app_state WHERE key = 'sentiment_enabled';
"#;

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

fn get_schema_version(conn: &Connection) -> Result<i64, AppError> {
    // Check if app_state table exists
    let table_exists: bool = conn.query_row(
        "SELECT COUNT(*) > 0 FROM sqlite_master WHERE type='table' AND name='app_state'",
        [],
        |row| row.get(0),
    )?;

    if !table_exists {
        return Ok(0);
    }

    let version: Result<String, _> = conn.query_row(
        "SELECT value FROM app_state WHERE key = 'schema_version'",
        [],
        |row| row.get(0),
    );

    match version {
        Ok(v) => v.parse::<i64>().map_err(|e| AppError::Database(e.to_string())),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(0),
        Err(e) => Err(AppError::Database(e.to_string())),
    }
}

fn set_schema_version(conn: &Connection, version: i64) -> Result<(), AppError> {
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO app_state (key, value, updated_at) VALUES ('schema_version', ?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
        rusqlite::params![version.to_string(), now],
    )?;
    Ok(())
}

pub fn run(conn: &Connection) -> Result<(), AppError> {
    let current = get_schema_version(conn)?;

    if current < 1 {
        conn.execute_batch(V1_UP)?;
        set_schema_version(conn, 1)?;
        tracing::info!("Applied migration V1 (schema version 1)");
    }

    if current < 2 {
        conn.execute_batch(V2_UP)?;
        set_schema_version(conn, 2)?;
        tracing::info!("Applied migration V2 (schema version 2) — JSONL source tables");
    }

    if current < 3 {
        conn.execute_batch(V3_UP)?;
        set_schema_version(conn, 3)?;
        tracing::info!("Applied migration V3 (schema version 3) — removed OTel tables");
    }

    if current < 4 {
        conn.execute_batch(V4_UP)?;
        set_schema_version(conn, 4)?;
        tracing::info!("Applied migration V4 (schema version 4) — session bookmarks");
    }

    if current < 5 {
        conn.execute_batch(V5_UP)?;
        set_schema_version(conn, 5)?;
        tracing::info!("Applied migration V5 (schema version 5) — custom_name + search_content");
    }

    if current < 6 {
        conn.execute_batch(V6_UP)?;
        set_schema_version(conn, 6)?;
        tracing::info!("Applied migration V6 (schema version 6) — model_pricing table");
    }

    if current < 7 {
        conn.execute_batch(V7_UP)?;
        set_schema_version(conn, 7)?;
        tracing::info!("Applied migration V7 (schema version 7) — sentiment_cache table");
    }

    if current < 8 {
        conn.execute_batch(V8_UP)?;
        set_schema_version(conn, 8)?;
        tracing::info!("Applied migration V8 (schema version 8) — cache_write_per_million + updated default prices");
    }

    if current < 9 {
        conn.execute_batch(V9_UP)?;
        set_schema_version(conn, 9)?;
        tracing::info!("Applied migration V9 (schema version 9) — removed sentiment_cache");
    }

    if current < 10 {
        conn.execute_batch(V10_UP)?;
        set_schema_version(conn, 10)?;
        tracing::info!("Applied migration V10 (schema version 10) — worklogs table + idle_threshold setting");
    }

    let final_version = get_schema_version(conn)?;
    tracing::info!(
        "Database schema at version {} (latest: {})",
        final_version,
        CURRENT_VERSION
    );

    Ok(())
}
