pub mod migrations;
pub mod schema;

use std::path::Path;
use std::sync::{Arc, Mutex};

use rusqlite::{params, Connection};

use crate::error::AppError;
use crate::models::*;

#[derive(Clone)]
pub struct Database {
    conn: Arc<Mutex<Connection>>,
}

impl Database {
    pub fn new(path: &Path) -> Result<Self, AppError> {
        let conn = Connection::open(path)?;
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")?;
        Ok(Self {
            conn: Arc::new(Mutex::new(conn)),
        })
    }

    pub fn run_migrations(&self) -> Result<(), AppError> {
        let conn = self.conn.lock().map_err(|e| AppError::Database(e.to_string()))?;
        migrations::run(&conn)
    }

    // ── App Settings ────────────────────────────────────────────

    pub fn get_app_setting(&self, key: &str) -> Result<Option<String>, AppError> {
        let conn = self.conn.lock().map_err(|e| AppError::Database(e.to_string()))?;
        let result: Result<String, _> = conn.query_row(
            "SELECT value FROM app_state WHERE key = ?1",
            params![key],
            |row| row.get(0),
        );
        match result {
            Ok(v) => Ok(Some(v)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(AppError::Database(e.to_string())),
        }
    }

    pub fn set_app_setting(&self, key: &str, value: &str) -> Result<(), AppError> {
        let conn = self.conn.lock().map_err(|e| AppError::Database(e.to_string()))?;
        let now = chrono::Utc::now().to_rfc3339();
        conn.execute(
            "INSERT INTO app_state (key, value, updated_at) VALUES (?1, ?2, ?3)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
            params![key, value, now],
        )?;
        Ok(())
    }

    pub fn get_app_state(&self, key: &str) -> Result<Option<String>, AppError> {
        self.get_app_setting(key)
    }

    pub fn set_app_state(&self, key: &str, value: &str) -> Result<(), AppError> {
        self.set_app_setting(key, value)
    }

    // ── Sessions ────────────────────────────────────────────────

    const SESSION_COLUMNS: &str = "id, source_session_id, first_seen_at, last_seen_at,
        model_summary, total_input_tokens, total_output_tokens,
        total_cached_input_tokens, total_reasoning_tokens, total_tokens,
        total_cost_usd, event_count, tool_event_count, raw_metadata_json,
        primary_source_kind, source_confidence, import_first_seen_at,
        live_last_seen_at, project_path, display_text, bookmarked,
        custom_name, search_content";

    fn row_to_session(row: &rusqlite::Row<'_>) -> rusqlite::Result<SessionRecord> {
        let bookmarked_int: i64 = row.get(20)?;
        Ok(SessionRecord {
            id: row.get(0)?,
            source_session_id: row.get(1)?,
            first_seen_at: row.get(2)?,
            last_seen_at: row.get(3)?,
            model_summary: row.get(4)?,
            total_input_tokens: row.get(5)?,
            total_output_tokens: row.get(6)?,
            total_cached_input_tokens: row.get(7)?,
            total_reasoning_tokens: row.get(8)?,
            total_tokens: row.get(9)?,
            total_cost_usd: row.get(10)?,
            event_count: row.get(11)?,
            tool_event_count: row.get(12)?,
            raw_metadata_json: row.get(13)?,
            primary_source_kind: row.get(14)?,
            source_confidence: row.get(15)?,
            import_first_seen_at: row.get(16)?,
            live_last_seen_at: row.get(17)?,
            project_path: row.get(18)?,
            display_text: row.get(19)?,
            bookmarked: bookmarked_int != 0,
            custom_name: row.get(21)?,
            search_content: row.get(22)?,
        })
    }

    pub fn upsert_session(&self, session: &SessionRecord) -> Result<(), AppError> {
        let conn = self.conn.lock().map_err(|e| AppError::Database(e.to_string()))?;
        conn.execute(
            "INSERT INTO sessions (id, source_session_id, first_seen_at, last_seen_at,
                model_summary, total_input_tokens, total_output_tokens,
                total_cached_input_tokens, total_reasoning_tokens, total_tokens,
                total_cost_usd, event_count, tool_event_count, raw_metadata_json,
                primary_source_kind, source_confidence, import_first_seen_at,
                live_last_seen_at, project_path, display_text, search_content)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21)
             ON CONFLICT(id) DO UPDATE SET
                source_session_id = excluded.source_session_id,
                last_seen_at = excluded.last_seen_at,
                model_summary = excluded.model_summary,
                total_input_tokens = excluded.total_input_tokens,
                total_output_tokens = excluded.total_output_tokens,
                total_cached_input_tokens = excluded.total_cached_input_tokens,
                total_reasoning_tokens = excluded.total_reasoning_tokens,
                total_tokens = excluded.total_tokens,
                total_cost_usd = excluded.total_cost_usd,
                event_count = excluded.event_count,
                tool_event_count = excluded.tool_event_count,
                raw_metadata_json = excluded.raw_metadata_json,
                primary_source_kind = excluded.primary_source_kind,
                source_confidence = excluded.source_confidence,
                import_first_seen_at = excluded.import_first_seen_at,
                live_last_seen_at = excluded.live_last_seen_at,
                project_path = excluded.project_path,
                display_text = excluded.display_text,
                search_content = COALESCE(excluded.search_content, sessions.search_content)",
            params![
                session.id,
                session.source_session_id,
                session.first_seen_at,
                session.last_seen_at,
                session.model_summary,
                session.total_input_tokens,
                session.total_output_tokens,
                session.total_cached_input_tokens,
                session.total_reasoning_tokens,
                session.total_tokens,
                session.total_cost_usd,
                session.event_count,
                session.tool_event_count,
                session.raw_metadata_json,
                session.primary_source_kind,
                session.source_confidence,
                session.import_first_seen_at,
                session.live_last_seen_at,
                session.project_path,
                session.display_text,
                session.search_content,
            ],
        )?;
        Ok(())
    }

    pub fn toggle_bookmark(&self, session_id: &str) -> Result<bool, AppError> {
        let conn = self.conn.lock().map_err(|e| AppError::Database(e.to_string()))?;
        conn.execute(
            "UPDATE sessions SET bookmarked = CASE WHEN bookmarked = 0 THEN 1 ELSE 0 END WHERE id = ?1",
            params![session_id],
        )?;
        let new_val: i64 = conn.query_row(
            "SELECT bookmarked FROM sessions WHERE id = ?1",
            params![session_id],
            |row| row.get(0),
        )?;
        Ok(new_val != 0)
    }

    pub fn get_session_by_id(
        &self,
        id: &str,
    ) -> Result<Option<SessionRecord>, AppError> {
        let conn = self.conn.lock().map_err(|e| AppError::Database(e.to_string()))?;
        let sql = format!(
            "SELECT {} FROM sessions WHERE id = ?1",
            Self::SESSION_COLUMNS
        );
        let result = conn.query_row(&sql, params![id], Self::row_to_session);
        match result {
            Ok(s) => Ok(Some(s)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(AppError::Database(e.to_string())),
        }
    }

    pub fn get_session_by_source_id(
        &self,
        source_session_id: &str,
    ) -> Result<Option<SessionRecord>, AppError> {
        let conn = self.conn.lock().map_err(|e| AppError::Database(e.to_string()))?;
        let sql = format!(
            "SELECT {} FROM sessions WHERE source_session_id = ?1",
            Self::SESSION_COLUMNS
        );
        let result = conn.query_row(&sql, params![source_session_id], Self::row_to_session);
        match result {
            Ok(s) => Ok(Some(s)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(AppError::Database(e.to_string())),
        }
    }

    pub fn list_sessions(
        &self,
        limit: i64,
        offset: i64,
        project: Option<&str>,
    ) -> Result<Vec<SessionRecord>, AppError> {
        let conn = self.conn.lock().map_err(|e| AppError::Database(e.to_string()))?;
        let (sql, rows) = if let Some(proj) = project {
            let sql = format!(
                "SELECT {} FROM sessions WHERE project_path = ?1 ORDER BY last_seen_at DESC LIMIT ?2 OFFSET ?3",
                Self::SESSION_COLUMNS
            );
            let mut stmt = conn.prepare(&sql)?;
            let rows = stmt
                .query_map(params![proj, limit, offset], Self::row_to_session)?
                .collect::<Result<Vec<_>, _>>()?;
            (sql, rows)
        } else {
            let sql = format!(
                "SELECT {} FROM sessions ORDER BY last_seen_at DESC LIMIT ?1 OFFSET ?2",
                Self::SESSION_COLUMNS
            );
            let mut stmt = conn.prepare(&sql)?;
            let rows = stmt
                .query_map(params![limit, offset], Self::row_to_session)?
                .collect::<Result<Vec<_>, _>>()?;
            (sql, rows)
        };
        Ok(rows)
    }

    pub fn list_distinct_projects(&self) -> Result<Vec<String>, AppError> {
        let conn = self.conn.lock().map_err(|e| AppError::Database(e.to_string()))?;
        let mut stmt = conn.prepare(
            "SELECT DISTINCT project_path FROM sessions WHERE project_path IS NOT NULL AND project_path != '' ORDER BY project_path"
        )?;
        let rows = stmt
            .query_map([], |row| row.get::<_, String>(0))?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    pub fn rename_session(&self, session_id: &str, custom_name: Option<&str>) -> Result<(), AppError> {
        let conn = self.conn.lock().map_err(|e| AppError::Database(e.to_string()))?;
        conn.execute(
            "UPDATE sessions SET custom_name = ?1 WHERE id = ?2",
            params![custom_name, session_id],
        )?;
        Ok(())
    }

    pub fn update_search_content(&self, session_id: &str, content: &str) -> Result<(), AppError> {
        let conn = self.conn.lock().map_err(|e| AppError::Database(e.to_string()))?;
        conn.execute(
            "UPDATE sessions SET search_content = ?1 WHERE id = ?2",
            params![content, session_id],
        )?;
        Ok(())
    }

    pub fn list_sessions_without_search_content(&self) -> Result<Vec<SessionRecord>, AppError> {
        let conn = self.conn.lock().map_err(|e| AppError::Database(e.to_string()))?;
        let sql = format!(
            "SELECT {} FROM sessions WHERE search_content IS NULL AND source_session_id IS NOT NULL",
            Self::SESSION_COLUMNS
        );
        let mut stmt = conn.prepare(&sql)?;
        let rows = stmt
            .query_map([], Self::row_to_session)?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    pub fn search_sessions(&self, query: &str, limit: i64) -> Result<Vec<SessionRecord>, AppError> {
        let conn = self.conn.lock().map_err(|e| AppError::Database(e.to_string()))?;
        let pattern = format!("%{}%", query);
        let sql = format!(
            "SELECT {} FROM sessions
             WHERE custom_name LIKE ?1
                OR display_text LIKE ?1
                OR project_path LIKE ?1
                OR model_summary LIKE ?1
                OR search_content LIKE ?1
             ORDER BY last_seen_at DESC
             LIMIT ?2",
            Self::SESSION_COLUMNS
        );
        let mut stmt = conn.prepare(&sql)?;
        let rows = stmt
            .query_map(params![pattern, limit], Self::row_to_session)?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    pub fn list_bookmarked_sessions(&self) -> Result<Vec<SessionRecord>, AppError> {
        let conn = self.conn.lock().map_err(|e| AppError::Database(e.to_string()))?;
        let sql = format!(
            "SELECT {} FROM sessions WHERE bookmarked = 1 ORDER BY last_seen_at DESC",
            Self::SESSION_COLUMNS
        );
        let mut stmt = conn.prepare(&sql)?;
        let rows = stmt
            .query_map([], Self::row_to_session)?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    // ── Daily Aggregates ────────────────────────────────────────

    pub fn upsert_daily_usage(&self, daily: &DailyUsageRecord) -> Result<(), AppError> {
        let conn = self.conn.lock().map_err(|e| AppError::Database(e.to_string()))?;
        conn.execute(
            "INSERT INTO daily_usage (day, total_input_tokens, total_output_tokens,
                total_cached_input_tokens, total_reasoning_tokens, total_tokens,
                total_cost_usd, session_count, event_count, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
             ON CONFLICT(day) DO UPDATE SET
                total_input_tokens = excluded.total_input_tokens,
                total_output_tokens = excluded.total_output_tokens,
                total_cached_input_tokens = excluded.total_cached_input_tokens,
                total_reasoning_tokens = excluded.total_reasoning_tokens,
                total_tokens = excluded.total_tokens,
                total_cost_usd = excluded.total_cost_usd,
                session_count = excluded.session_count,
                event_count = excluded.event_count,
                updated_at = excluded.updated_at",
            params![
                daily.day,
                daily.total_input_tokens,
                daily.total_output_tokens,
                daily.total_cached_input_tokens,
                daily.total_reasoning_tokens,
                daily.total_tokens,
                daily.total_cost_usd,
                daily.session_count,
                daily.event_count,
                daily.updated_at,
            ],
        )?;
        Ok(())
    }

    /// Increment daily usage counters atomically.
    pub fn increment_daily_usage(
        &self,
        day: &str,
        input_tokens: i64,
        output_tokens: i64,
        cached_tokens: i64,
        reasoning_tokens: i64,
        total_tokens: i64,
        cost: f64,
        event_count: i64,
        updated_at: &str,
    ) -> Result<(), AppError> {
        let conn = self.conn.lock().map_err(|e| AppError::Database(e.to_string()))?;
        conn.execute(
            "INSERT INTO daily_usage (day, total_input_tokens, total_output_tokens,
                total_cached_input_tokens, total_reasoning_tokens, total_tokens,
                total_cost_usd, session_count, event_count, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 0, ?8, ?9)
             ON CONFLICT(day) DO UPDATE SET
                total_input_tokens = daily_usage.total_input_tokens + excluded.total_input_tokens,
                total_output_tokens = daily_usage.total_output_tokens + excluded.total_output_tokens,
                total_cached_input_tokens = daily_usage.total_cached_input_tokens + excluded.total_cached_input_tokens,
                total_reasoning_tokens = daily_usage.total_reasoning_tokens + excluded.total_reasoning_tokens,
                total_tokens = daily_usage.total_tokens + excluded.total_tokens,
                total_cost_usd = daily_usage.total_cost_usd + excluded.total_cost_usd,
                event_count = daily_usage.event_count + excluded.event_count,
                updated_at = excluded.updated_at",
            params![day, input_tokens, output_tokens, cached_tokens, reasoning_tokens, total_tokens, cost, event_count, updated_at],
        )?;
        Ok(())
    }

    /// Increment daily usage for JSONL-sourced data (session_count + event_count only, no tokens).
    pub fn increment_daily_usage_jsonl(
        &self,
        day: &str,
        session_count: i64,
        event_count: i64,
        updated_at: &str,
    ) -> Result<(), AppError> {
        let conn = self.conn.lock().map_err(|e| AppError::Database(e.to_string()))?;
        conn.execute(
            "INSERT INTO daily_usage (day, total_input_tokens, total_output_tokens,
                total_cached_input_tokens, total_reasoning_tokens, total_tokens,
                total_cost_usd, session_count, event_count, updated_at, jsonl_contributed)
             VALUES (?1, 0, 0, 0, 0, 0, 0.0, ?2, ?3, ?4, 1)
             ON CONFLICT(day) DO UPDATE SET
                session_count = daily_usage.session_count + excluded.session_count,
                event_count = daily_usage.event_count + excluded.event_count,
                jsonl_contributed = 1,
                updated_at = excluded.updated_at",
            params![day, session_count, event_count, updated_at],
        )?;
        Ok(())
    }

    pub fn upsert_models_daily(&self, model_daily: &ModelsDailyRecord) -> Result<(), AppError> {
        let conn = self.conn.lock().map_err(|e| AppError::Database(e.to_string()))?;
        conn.execute(
            "INSERT INTO models_daily (day, model, total_tokens, total_cost_usd, event_count)
             VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(day, model) DO UPDATE SET
                total_tokens = excluded.total_tokens,
                total_cost_usd = excluded.total_cost_usd,
                event_count = excluded.event_count",
            params![
                model_daily.day,
                model_daily.model,
                model_daily.total_tokens,
                model_daily.total_cost_usd,
                model_daily.event_count,
            ],
        )?;
        Ok(())
    }

    /// Increment models_daily counters atomically.
    pub fn increment_models_daily(
        &self,
        day: &str,
        model: &str,
        total_tokens: i64,
        cost: f64,
        event_count: i64,
    ) -> Result<(), AppError> {
        let conn = self.conn.lock().map_err(|e| AppError::Database(e.to_string()))?;
        conn.execute(
            "INSERT INTO models_daily (day, model, total_tokens, total_cost_usd, event_count)
             VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(day, model) DO UPDATE SET
                total_tokens = models_daily.total_tokens + excluded.total_tokens,
                total_cost_usd = models_daily.total_cost_usd + excluded.total_cost_usd,
                event_count = models_daily.event_count + excluded.event_count",
            params![day, model, total_tokens, cost, event_count],
        )?;
        Ok(())
    }

    // ── Source Files ─────────────────────────────────────────────

    pub fn upsert_source_file(&self, sf: &SourceFileRecord) -> Result<i64, AppError> {
        let conn = self.conn.lock().map_err(|e| AppError::Database(e.to_string()))?;
        conn.execute(
            "INSERT INTO source_files (file_path, file_type, file_size, last_modified_at,
                last_scanned_at, last_offset, record_count, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
             ON CONFLICT(file_path) DO UPDATE SET
                file_size = excluded.file_size,
                last_modified_at = excluded.last_modified_at,
                last_scanned_at = excluded.last_scanned_at,
                last_offset = excluded.last_offset,
                record_count = excluded.record_count",
            params![
                sf.file_path,
                sf.file_type,
                sf.file_size,
                sf.last_modified_at,
                sf.last_scanned_at,
                sf.last_offset,
                sf.record_count,
                sf.created_at,
            ],
        )?;
        let id = conn.last_insert_rowid();
        // If it was an update (conflict), get the actual id
        let actual_id: i64 = conn.query_row(
            "SELECT id FROM source_files WHERE file_path = ?1",
            params![sf.file_path],
            |row| row.get(0),
        )?;
        Ok(if id == 0 { actual_id } else { id })
    }

    pub fn get_source_file_by_path(&self, path: &str) -> Result<Option<SourceFileRecord>, AppError> {
        let conn = self.conn.lock().map_err(|e| AppError::Database(e.to_string()))?;
        let result = conn.query_row(
            "SELECT id, file_path, file_type, file_size, last_modified_at,
                    last_scanned_at, last_offset, record_count, created_at
             FROM source_files WHERE file_path = ?1",
            params![path],
            |row| {
                Ok(SourceFileRecord {
                    id: row.get(0)?,
                    file_path: row.get(1)?,
                    file_type: row.get(2)?,
                    file_size: row.get(3)?,
                    last_modified_at: row.get(4)?,
                    last_scanned_at: row.get(5)?,
                    last_offset: row.get(6)?,
                    record_count: row.get(7)?,
                    created_at: row.get(8)?,
                })
            },
        );
        match result {
            Ok(sf) => Ok(Some(sf)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(AppError::Database(e.to_string())),
        }
    }

    pub fn list_source_files(&self) -> Result<Vec<SourceFileRecord>, AppError> {
        let conn = self.conn.lock().map_err(|e| AppError::Database(e.to_string()))?;
        let mut stmt = conn.prepare(
            "SELECT id, file_path, file_type, file_size, last_modified_at,
                    last_scanned_at, last_offset, record_count, created_at
             FROM source_files ORDER BY file_path ASC",
        )?;
        let rows = stmt
            .query_map([], |row| {
                Ok(SourceFileRecord {
                    id: row.get(0)?,
                    file_path: row.get(1)?,
                    file_type: row.get(2)?,
                    file_size: row.get(3)?,
                    last_modified_at: row.get(4)?,
                    last_scanned_at: row.get(5)?,
                    last_offset: row.get(6)?,
                    record_count: row.get(7)?,
                    created_at: row.get(8)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    pub fn update_source_file_offset(
        &self,
        file_id: i64,
        offset: i64,
        record_count: i64,
        file_size: i64,
    ) -> Result<(), AppError> {
        let conn = self.conn.lock().map_err(|e| AppError::Database(e.to_string()))?;
        let now = chrono::Utc::now().to_rfc3339();
        conn.execute(
            "UPDATE source_files SET last_offset = ?1, record_count = ?2,
                file_size = ?3, last_scanned_at = ?4 WHERE id = ?5",
            params![offset, record_count, file_size, now, file_id],
        )?;
        Ok(())
    }

    // ── Source Records ───────────────────────────────────────────

    pub fn insert_source_record(&self, rec: &SourceRecordEntry) -> Result<i64, AppError> {
        let conn = self.conn.lock().map_err(|e| AppError::Database(e.to_string()))?;
        conn.execute(
            "INSERT OR IGNORE INTO source_records (source_file_id, record_key, session_id, timestamp, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                rec.source_file_id,
                rec.record_key,
                rec.session_id,
                rec.timestamp,
                rec.created_at,
            ],
        )?;
        Ok(conn.last_insert_rowid())
    }

    pub fn source_record_exists(&self, record_key: &str) -> Result<bool, AppError> {
        let conn = self.conn.lock().map_err(|e| AppError::Database(e.to_string()))?;
        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM source_records WHERE record_key = ?1",
            params![record_key],
            |row| row.get(0),
        )?;
        Ok(count > 0)
    }

    // ── Imports ──────────────────────────────────────────────────

    pub fn insert_import(&self, import: &ImportRecord) -> Result<i64, AppError> {
        let conn = self.conn.lock().map_err(|e| AppError::Database(e.to_string()))?;
        conn.execute(
            "INSERT INTO imports (started_at, finished_at, status, files_scanned,
                records_parsed, records_imported, records_skipped, error_message)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                import.started_at,
                import.finished_at,
                import.status,
                import.files_scanned,
                import.records_parsed,
                import.records_imported,
                import.records_skipped,
                import.error_message,
            ],
        )?;
        Ok(conn.last_insert_rowid())
    }

    pub fn update_import(&self, import: &ImportRecord) -> Result<(), AppError> {
        let conn = self.conn.lock().map_err(|e| AppError::Database(e.to_string()))?;
        conn.execute(
            "UPDATE imports SET finished_at = ?1, status = ?2, files_scanned = ?3,
                records_parsed = ?4, records_imported = ?5, records_skipped = ?6,
                error_message = ?7 WHERE id = ?8",
            params![
                import.finished_at,
                import.status,
                import.files_scanned,
                import.records_parsed,
                import.records_imported,
                import.records_skipped,
                import.error_message,
                import.id,
            ],
        )?;
        Ok(())
    }

    pub fn list_imports(&self, limit: i64) -> Result<Vec<ImportRecord>, AppError> {
        let conn = self.conn.lock().map_err(|e| AppError::Database(e.to_string()))?;
        let mut stmt = conn.prepare(
            "SELECT id, started_at, finished_at, status, files_scanned,
                    records_parsed, records_imported, records_skipped, error_message
             FROM imports ORDER BY started_at DESC LIMIT ?1",
        )?;
        let rows = stmt
            .query_map(params![limit], |row| {
                Ok(ImportRecord {
                    id: row.get(0)?,
                    started_at: row.get(1)?,
                    finished_at: row.get(2)?,
                    status: row.get(3)?,
                    files_scanned: row.get(4)?,
                    records_parsed: row.get(5)?,
                    records_imported: row.get(6)?,
                    records_skipped: row.get(7)?,
                    error_message: row.get(8)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    // ── Dashboard Queries ───────────────────────────────────────

    /// Get summary stats for a date range.
    pub fn get_dashboard_summary(
        &self,
        from_date: &str,
        to_date: &str,
    ) -> Result<DashboardSummary, AppError> {
        let conn = self.conn.lock().map_err(|e| AppError::Database(e.to_string()))?;

        let (total_tokens, total_cost, total_input, total_output, total_cached, total_reasoning, event_count): (i64, f64, i64, i64, i64, i64, i64) = conn
            .query_row(
                "SELECT COALESCE(SUM(total_tokens), 0),
                        COALESCE(SUM(total_cost_usd), 0.0),
                        COALESCE(SUM(total_input_tokens), 0),
                        COALESCE(SUM(total_output_tokens), 0),
                        COALESCE(SUM(total_cached_input_tokens), 0),
                        COALESCE(SUM(total_reasoning_tokens), 0),
                        COALESCE(SUM(event_count), 0)
                 FROM daily_usage WHERE day >= ?1 AND day <= ?2",
                params![from_date, to_date],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?, row.get(6)?)),
            )
            .unwrap_or((0, 0.0, 0, 0, 0, 0, 0));

        let session_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sessions
                 WHERE last_seen_at >= ?1 AND first_seen_at <= ?2",
                params![from_date, to_date],
                |row| row.get(0),
            )
            .unwrap_or(0);

        let last_event_at: Option<String> = conn
            .query_row(
                "SELECT MAX(last_seen_at) FROM sessions",
                [],
                |row| row.get(0),
            )
            .unwrap_or(None);

        Ok(DashboardSummary {
            total_tokens,
            total_cost_usd: total_cost,
            total_input_tokens: total_input,
            total_output_tokens: total_output,
            total_cached_input_tokens: total_cached,
            total_reasoning_tokens: total_reasoning,
            session_count,
            event_count,
            last_event_at,
        })
    }

    /// Get token time series data, aggregated by day.
    pub fn get_token_timeseries(
        &self,
        from_date: &str,
        to_date: &str,
    ) -> Result<Vec<TimeseriesPoint>, AppError> {
        let conn = self.conn.lock().map_err(|e| AppError::Database(e.to_string()))?;
        let mut stmt = conn.prepare(
            "SELECT day,
                    total_tokens,
                    total_input_tokens,
                    total_output_tokens,
                    total_cached_input_tokens,
                    total_reasoning_tokens,
                    total_cost_usd
             FROM daily_usage
             WHERE day >= ?1 AND day <= ?2
             ORDER BY day ASC",
        )?;
        let rows = stmt
            .query_map(params![from_date, to_date], |row| {
                Ok(TimeseriesPoint {
                    date: row.get(0)?,
                    total: row.get(1)?,
                    input: row.get(2)?,
                    output: row.get(3)?,
                    cached: row.get(4)?,
                    reasoning: row.get(5)?,
                    cost: row.get(6)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    /// Get input/output breakdown for a date range.
    pub fn get_input_output_breakdown(
        &self,
        from_date: &str,
        to_date: &str,
    ) -> Result<Vec<TimeseriesPoint>, AppError> {
        self.get_token_timeseries(from_date, to_date)
    }

    /// Get daily usage records for heatmap.
    pub fn get_daily_heatmap(
        &self,
        from_date: &str,
        to_date: &str,
    ) -> Result<Vec<DailyUsageRecord>, AppError> {
        let conn = self.conn.lock().map_err(|e| AppError::Database(e.to_string()))?;
        let mut stmt = conn.prepare(
            "SELECT day, total_input_tokens, total_output_tokens,
                    total_cached_input_tokens, total_reasoning_tokens, total_tokens,
                    total_cost_usd, session_count, event_count, updated_at
             FROM daily_usage
             WHERE day >= ?1 AND day <= ?2
             ORDER BY day ASC",
        )?;
        let rows = stmt
            .query_map(params![from_date, to_date], |row| {
                Ok(DailyUsageRecord {
                    day: row.get(0)?,
                    total_input_tokens: row.get(1)?,
                    total_output_tokens: row.get(2)?,
                    total_cached_input_tokens: row.get(3)?,
                    total_reasoning_tokens: row.get(4)?,
                    total_tokens: row.get(5)?,
                    total_cost_usd: row.get(6)?,
                    session_count: row.get(7)?,
                    event_count: row.get(8)?,
                    updated_at: row.get(9)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    // ── Project Stats ─────────────────────────────────────────

    pub fn get_project_stats(&self, limit: i64) -> Result<Vec<ProjectStats>, AppError> {
        let conn = self.conn.lock().map_err(|e| AppError::Database(e.to_string()))?;
        let mut stmt = conn.prepare(
            "SELECT project_path,
                    COUNT(*) as session_count,
                    COALESCE(SUM(total_tokens), 0) as total_tokens,
                    COALESCE(SUM(total_cost_usd), 0.0) as total_cost_usd,
                    MAX(last_seen_at) as last_seen_at
             FROM sessions
             WHERE project_path IS NOT NULL AND project_path != ''
             GROUP BY project_path
             ORDER BY last_seen_at DESC
             LIMIT ?1",
        )?;
        let rows = stmt
            .query_map(params![limit], |row| {
                let path: String = row.get(0)?;
                let name = path
                    .rsplit('/')
                    .next()
                    .unwrap_or(&path)
                    .to_string();
                Ok(ProjectStats {
                    project_path: path,
                    project_name: name,
                    session_count: row.get(1)?,
                    total_tokens: row.get(2)?,
                    total_cost_usd: row.get(3)?,
                    last_seen_at: row.get(4)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    // ── Worklogs ─────────────────────────────────────────────────

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

    // ── Housekeeping ────────────────────────────────────────────

    pub fn clear_all_data(&self) -> Result<(), AppError> {
        let conn = self.conn.lock().map_err(|e| AppError::Database(e.to_string()))?;
        conn.execute_batch(
            "DELETE FROM source_records;
             DELETE FROM source_files;
             DELETE FROM imports;
             DELETE FROM sessions;
             DELETE FROM daily_usage;
             DELETE FROM models_daily;",
        )?;
        Ok(())
    }

    pub fn has_jsonl_data(&self) -> Result<bool, AppError> {
        let conn = self.conn.lock().map_err(|e| AppError::Database(e.to_string()))?;
        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM sessions",
            [],
            |row| row.get(0),
        )?;
        Ok(count > 0)
    }

    pub fn count_sessions(&self) -> Result<i64, AppError> {
        let conn = self.conn.lock().map_err(|e| AppError::Database(e.to_string()))?;
        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM sessions",
            [],
            |row| row.get(0),
        )?;
        Ok(count)
    }

    // ── Model Pricing ────────────────────────────────────────────

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
            params![input_per_million, output_per_million, cache_read_per_million, cache_write_per_million, context_limit, now, model_key],
        )?;
        Ok(())
    }

    pub fn reset_model_pricing(&self) -> Result<Vec<ModelPricing>, AppError> {
        let conn = self.conn.lock().map_err(|e| AppError::Database(e.to_string()))?;
        let now = chrono::Utc::now().to_rfc3339();
        for p in crate::models::pricing::default_pricing() {
            conn.execute(
                "INSERT INTO model_pricing (model_key, display_name, input_per_million, output_per_million, cache_read_per_million, cache_write_per_million, context_limit, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
                 ON CONFLICT(model_key) DO UPDATE SET
                    input_per_million = excluded.input_per_million,
                    output_per_million = excluded.output_per_million,
                    cache_read_per_million = excluded.cache_read_per_million,
                    cache_write_per_million = excluded.cache_write_per_million,
                    context_limit = excluded.context_limit,
                    updated_at = excluded.updated_at",
                params![p.model_key, p.display_name, p.input_per_million, p.output_per_million, p.cache_read_per_million, p.cache_write_per_million, p.context_limit, now],
            )?;
        }
        drop(conn);
        self.get_model_pricing()
    }
}

// ── Query result types ──────────────────────────────────────────

use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct DashboardSummary {
    pub total_tokens: i64,
    pub total_cost_usd: f64,
    pub total_input_tokens: i64,
    pub total_output_tokens: i64,
    pub total_cached_input_tokens: i64,
    pub total_reasoning_tokens: i64,
    pub session_count: i64,
    pub event_count: i64,
    pub last_event_at: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct TimeseriesPoint {
    pub date: String,
    pub total: i64,
    pub input: i64,
    pub output: i64,
    pub cached: i64,
    pub reasoning: i64,
    pub cost: f64,
}

#[derive(Debug, Clone, Serialize)]
pub struct ProjectStats {
    pub project_path: String,
    pub project_name: String,
    pub session_count: i64,
    pub total_tokens: i64,
    pub total_cost_usd: f64,
    pub last_seen_at: String,
}
