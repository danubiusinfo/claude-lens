use std::io::{BufRead, Seek, SeekFrom};

use crate::db::Database;
use crate::models::{ImportRecord, SessionRecord, SourceFileRecord, SourceRecordEntry};

use super::discovery::discover_jsonl_paths;
use super::normalize::{extract_search_content, extract_session_messages, normalize_session_file, normalize_sessions};
use super::parser::{parse_history_line, parse_session_line};
use super::types::{ImportResult, ParsedHistoryEntry, RawSessionEntry};

/// Run a full or incremental JSONL import.
/// If `full` is true, re-reads all files from the beginning.
/// Otherwise, reads only from last known offset.
pub fn run_import(db: &Database, full: bool) -> Result<ImportResult, String> {
    let start = std::time::Instant::now();

    // Load pricing from DB for cost calculations
    let pricing = db.get_model_pricing().unwrap_or_default();

    // Get directory override from settings
    let override_dir = db
        .get_app_setting("jsonl_directory_override")
        .ok()
        .flatten();

    let files = discover_jsonl_paths(override_dir.as_deref());

    // Create import record
    let now = chrono::Utc::now().to_rfc3339();
    let mut import_rec = ImportRecord {
        id: None,
        started_at: now.clone(),
        finished_at: None,
        status: "running".to_string(),
        files_scanned: 0,
        records_parsed: 0,
        records_imported: 0,
        records_skipped: 0,
        error_message: None,
    };
    let import_id = db
        .insert_import(&import_rec)
        .map_err(|e| e.to_string())?;
    import_rec.id = Some(import_id);

    let mut total_parsed: i64 = 0;
    let mut total_imported: i64 = 0;
    let mut total_skipped: i64 = 0;
    let mut sessions_created: i64 = 0;
    let mut sessions_updated: i64 = 0;
    let mut all_history_entries: Vec<ParsedHistoryEntry> = Vec::new();

    for discovered in &files {
        import_rec.files_scanned += 1;

        // Get or create source file record
        let existing_sf = db
            .get_source_file_by_path(&discovered.path)
            .map_err(|e| e.to_string())?;

        if discovered.file_type == "project" {
            // ── Per-session JSONL file ──────────────────────────────────
            // Skip if file size hasn't changed since last scan (unless full import)
            if !full {
                if let Some(ref esf) = existing_sf {
                    if esf.file_size == discovered.size as i64 {
                        total_skipped += 1;
                        continue;
                    }
                }
            }

            let sf = SourceFileRecord {
                id: existing_sf.as_ref().and_then(|s| s.id),
                file_path: discovered.path.clone(),
                file_type: discovered.file_type.clone(),
                file_size: discovered.size as i64,
                last_modified_at: discovered.modified_at.clone(),
                last_scanned_at: Some(now.clone()),
                last_offset: 0,
                record_count: existing_sf.as_ref().map_or(0, |s| s.record_count),
                created_at: existing_sf
                    .as_ref()
                    .map_or_else(|| now.clone(), |s| s.created_at.clone()),
            };
            let file_id = db.upsert_source_file(&sf).map_err(|e| e.to_string())?;

            // Read entire file and parse all lines
            let file = match std::fs::File::open(&discovered.path) {
                Ok(f) => f,
                Err(e) => {
                    tracing::warn!("Cannot open {}: {}", discovered.path, e);
                    continue;
                }
            };

            let reader = std::io::BufReader::new(file);
            let mut session_entries: Vec<RawSessionEntry> = Vec::new();
            let mut line_count: i64 = 0;
            let mut file_bytes: i64 = 0;

            for line_result in reader.lines() {
                match line_result {
                    Ok(line) => {
                        file_bytes += line.len() as i64 + 1; // +1 for newline
                        line_count += 1;
                        total_parsed += 1;
                        if let Some(entry) = parse_session_line(&line) {
                            session_entries.push(entry);
                        }
                    }
                    Err(e) => {
                        tracing::warn!("Read error in {}: {}", discovered.path, e);
                        break;
                    }
                }
            }

            // Derive fallback session ID from filename
            let fallback_id = std::path::Path::new(&discovered.path)
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("unknown");

            let search_text = extract_search_content(&session_entries);
            let search_content = if search_text.is_empty() { None } else { Some(search_text) };

            if let Some(enriched) = normalize_session_file(&session_entries, fallback_id, &pricing) {
                // Upsert session with full token/cost data; capture the DB UUID so worklog rows
                // key on the same ID that the frontend's SessionRecord.id holds.
                let db_session_id: String = match db.get_session_by_source_id(&enriched.session_id) {
                    Ok(Some(existing)) => {
                        let db_id = existing.id.clone();
                        let updated = SessionRecord {
                            id: existing.id.clone(),
                            source_session_id: Some(enriched.session_id.clone()),
                            first_seen_at: if enriched.first_seen_at < existing.first_seen_at {
                                enriched.first_seen_at.clone()
                            } else {
                                existing.first_seen_at
                            },
                            last_seen_at: if enriched.last_seen_at > existing.last_seen_at {
                                enriched.last_seen_at.clone()
                            } else {
                                existing.last_seen_at
                            },
                            model_summary: enriched.model_summary.clone().or(existing.model_summary),
                            total_input_tokens: enriched.total_input_tokens,
                            total_output_tokens: enriched.total_output_tokens,
                            total_cached_input_tokens: enriched.total_cached_input_tokens,
                            total_reasoning_tokens: enriched.total_reasoning_tokens,
                            total_tokens: enriched.total_tokens,
                            total_cost_usd: enriched.total_cost_usd,
                            event_count: existing.event_count.max(enriched.event_count),
                            tool_event_count: existing
                                .tool_event_count
                                .max(enriched.tool_event_count),
                            raw_metadata_json: existing.raw_metadata_json,
                            primary_source_kind: "jsonl".to_string(),
                            source_confidence: "high".to_string(),
                            import_first_seen_at: existing
                                .import_first_seen_at
                                .or(Some(now.clone())),
                            live_last_seen_at: None,
                            project_path: enriched.project_path.clone().or(existing.project_path),
                            display_text: enriched.display_text.clone().or(existing.display_text),
                            bookmarked: existing.bookmarked,
                            custom_name: existing.custom_name,
                            search_content: search_content.clone().or(existing.search_content),
                        };
                        if let Err(e) = db.upsert_session(&updated) {
                            tracing::error!(
                                "Failed to update session from per-session JSONL: {}",
                                e
                            );
                        }
                        sessions_updated += 1;
                        db_id
                    }
                    _ => {
                        // New session from per-session JSONL
                        let new_id = uuid::Uuid::new_v4().to_string();
                        let session = SessionRecord {
                            id: new_id.clone(),
                            source_session_id: Some(enriched.session_id.clone()),
                            first_seen_at: enriched.first_seen_at.clone(),
                            last_seen_at: enriched.last_seen_at.clone(),
                            model_summary: enriched.model_summary.clone(),
                            total_input_tokens: enriched.total_input_tokens,
                            total_output_tokens: enriched.total_output_tokens,
                            total_cached_input_tokens: enriched.total_cached_input_tokens,
                            total_reasoning_tokens: enriched.total_reasoning_tokens,
                            total_tokens: enriched.total_tokens,
                            total_cost_usd: enriched.total_cost_usd,
                            event_count: enriched.event_count,
                            tool_event_count: enriched.tool_event_count,
                            raw_metadata_json: None,
                            primary_source_kind: "jsonl".to_string(),
                            source_confidence: "high".to_string(),
                            import_first_seen_at: Some(now.clone()),
                            live_last_seen_at: None,
                            project_path: enriched.project_path.clone(),
                            display_text: enriched.display_text.clone(),
                            bookmarked: false,
                            custom_name: None,
                            search_content: search_content.clone(),
                        };
                        if let Err(e) = db.upsert_session(&session) {
                            tracing::error!(
                                "Failed to create session from per-session JSONL: {}",
                                e
                            );
                        }
                        sessions_created += 1;
                        new_id
                    }
                };

                // Compute worklog rows from the same message list, keyed on the DB UUID
                // so that frontend queries (which use SessionRecord.id) resolve correctly.
                let messages = extract_session_messages(&session_entries, &pricing);
                let project_path_str = enriched.project_path.as_deref();
                let (worklog_rows, _turns) = crate::jsonl::worklog::calculate_worklog(
                    &messages,
                    project_path_str,
                    &db_session_id,
                );

                // Replace existing worklog rows for this session (so re-imports stay correct)
                db.delete_worklogs_for_session(&db_session_id).ok();
                for row in &worklog_rows {
                    if let Err(e) = db.upsert_worklog(row) {
                        tracing::warn!("failed to upsert worklog row: {}", e);
                    }
                }

                // Update daily aggregates with full token data
                let day = &enriched.first_seen_at[..10];
                if enriched.total_tokens > 0 {
                    if let Err(e) = db.increment_daily_usage(
                        day,
                        enriched.total_input_tokens,
                        enriched.total_output_tokens,
                        enriched.total_cached_input_tokens,
                        enriched.total_reasoning_tokens,
                        enriched.total_tokens,
                        enriched.total_cost_usd,
                        enriched.event_count,
                        &now,
                    ) {
                        tracing::warn!(
                            "Failed to update daily usage from per-session JSONL: {}",
                            e
                        );
                    }
                } else {
                    if let Err(e) =
                        db.increment_daily_usage_jsonl(day, 1, enriched.event_count, &now)
                    {
                        tracing::warn!("Failed to update daily usage from per-session JSONL: {}", e);
                    }
                }

                // Update models_daily
                if let Some(ref model) = enriched.model_summary {
                    if let Err(e) = db.increment_models_daily(
                        day,
                        model,
                        enriched.total_tokens,
                        enriched.total_cost_usd,
                        enriched.event_count,
                    ) {
                        tracing::warn!("Failed to update models_daily from per-session JSONL: {}", e);
                    }
                }

                total_imported += line_count;
            }

            // Update file offset to file size
            if let Err(e) = db.update_source_file_offset(
                file_id,
                file_bytes,
                line_count,
                discovered.size as i64,
            ) {
                tracing::warn!("Failed to update source file offset: {}", e);
            }
        } else {
            // ── history.jsonl ──────────────────────────────────────────
            let start_offset = if full {
                0
            } else {
                existing_sf.as_ref().map_or(0, |sf| sf.last_offset)
            };

            let sf = SourceFileRecord {
                id: existing_sf.as_ref().and_then(|s| s.id),
                file_path: discovered.path.clone(),
                file_type: discovered.file_type.clone(),
                file_size: discovered.size as i64,
                last_modified_at: discovered.modified_at.clone(),
                last_scanned_at: Some(now.clone()),
                last_offset: start_offset,
                record_count: existing_sf.as_ref().map_or(0, |s| s.record_count),
                created_at: existing_sf
                    .as_ref()
                    .map_or_else(|| now.clone(), |s| s.created_at.clone()),
            };
            let file_id = db.upsert_source_file(&sf).map_err(|e| e.to_string())?;

            // Read file from offset
            let file = match std::fs::File::open(&discovered.path) {
                Ok(f) => f,
                Err(e) => {
                    tracing::warn!("Cannot open {}: {}", discovered.path, e);
                    continue;
                }
            };

            let mut reader = std::io::BufReader::new(file);
            if start_offset > 0 {
                if reader.seek(SeekFrom::Start(start_offset as u64)).is_err() {
                    tracing::warn!("Cannot seek in {}, reading from start", discovered.path);
                    let _ = reader.seek(SeekFrom::Start(0));
                }
            }

            let mut new_records = 0i64;
            let mut line = String::new();
            let mut current_offset = start_offset;

            loop {
                line.clear();
                match reader.read_line(&mut line) {
                    Ok(0) => break, // EOF
                    Ok(bytes_read) => {
                        current_offset += bytes_read as i64;
                        total_parsed += 1;

                        if let Some(entry) = parse_history_line(&line) {
                            let record_key =
                                format!("{}:{}", entry.session_id, entry.timestamp_ms);

                            // Check for dedup
                            match db.source_record_exists(&record_key) {
                                Ok(true) => {
                                    total_skipped += 1;
                                    continue;
                                }
                                Ok(false) => {}
                                Err(e) => {
                                    tracing::warn!("Dedup check failed: {}", e);
                                }
                            }

                            // Insert source record for dedup tracking
                            let src_rec = SourceRecordEntry {
                                id: None,
                                source_file_id: file_id,
                                record_key,
                                session_id: Some(entry.session_id.clone()),
                                timestamp: entry.timestamp_rfc3339.clone(),
                                created_at: now.clone(),
                            };
                            let _ = db.insert_source_record(&src_rec);

                            all_history_entries.push(entry);
                            new_records += 1;
                            total_imported += 1;
                        }
                    }
                    Err(e) => {
                        tracing::warn!("Read error in {}: {}", discovered.path, e);
                        break;
                    }
                }
            }

            // Update file offset
            let total_records = sf.record_count + new_records;
            if let Err(e) = db.update_source_file_offset(
                file_id,
                current_offset,
                total_records,
                discovered.size as i64,
            ) {
                tracing::warn!("Failed to update source file offset: {}", e);
            }
        }
    }

    // Normalize history.jsonl entries into sessions and persist
    let normalized = normalize_sessions(&all_history_entries);
    for ns in &normalized {
        match db.get_session_by_source_id(&ns.session_id) {
            Ok(Some(existing)) => {
                let updated = SessionRecord {
                    id: existing.id.clone(),
                    source_session_id: Some(ns.session_id.clone()),
                    first_seen_at: if ns.first_seen_at < existing.first_seen_at {
                        ns.first_seen_at.clone()
                    } else {
                        existing.first_seen_at
                    },
                    last_seen_at: if ns.last_seen_at > existing.last_seen_at {
                        ns.last_seen_at.clone()
                    } else {
                        existing.last_seen_at
                    },
                    model_summary: existing.model_summary,
                    total_input_tokens: existing.total_input_tokens,
                    total_output_tokens: existing.total_output_tokens,
                    total_cached_input_tokens: existing.total_cached_input_tokens,
                    total_reasoning_tokens: existing.total_reasoning_tokens,
                    total_tokens: existing.total_tokens,
                    total_cost_usd: existing.total_cost_usd,
                    event_count: existing.event_count.max(ns.event_count),
                    tool_event_count: existing.tool_event_count,
                    raw_metadata_json: existing.raw_metadata_json,
                    primary_source_kind: "jsonl".to_string(),
                    source_confidence: existing.source_confidence,
                    import_first_seen_at: existing.import_first_seen_at.or(Some(now.clone())),
                    live_last_seen_at: None,
                    project_path: ns.project_path.clone().or(existing.project_path),
                    display_text: ns.display_text.clone().or(existing.display_text),
                    bookmarked: existing.bookmarked,
                    custom_name: existing.custom_name,
                    search_content: existing.search_content,
                };
                if let Err(e) = db.upsert_session(&updated) {
                    tracing::error!("Failed to update session from JSONL: {}", e);
                }
                sessions_updated += 1;

                // Update daily aggregates for merged session
                let day = &ns.first_seen_at[..10];
                if let Err(e) = db.increment_daily_usage_jsonl(day, 1, ns.event_count, &now) {
                    tracing::warn!("Failed to update daily usage from JSONL merge: {}", e);
                }
            }
            _ => {
                // New session from JSONL only
                let new_id = uuid::Uuid::new_v4().to_string();
                let session = SessionRecord {
                    id: new_id,
                    source_session_id: Some(ns.session_id.clone()),
                    first_seen_at: ns.first_seen_at.clone(),
                    last_seen_at: ns.last_seen_at.clone(),
                    model_summary: None,
                    total_input_tokens: 0,
                    total_output_tokens: 0,
                    total_cached_input_tokens: 0,
                    total_reasoning_tokens: 0,
                    total_tokens: 0,
                    total_cost_usd: 0.0,
                    event_count: ns.event_count,
                    tool_event_count: 0,
                    raw_metadata_json: None,
                    primary_source_kind: "jsonl".to_string(),
                    source_confidence: "high".to_string(),
                    import_first_seen_at: Some(now.clone()),
                    live_last_seen_at: None,
                    project_path: ns.project_path.clone(),
                    display_text: ns.display_text.clone(),
                    bookmarked: false,
                    custom_name: None,
                    search_content: None,
                };
                if let Err(e) = db.upsert_session(&session) {
                    tracing::error!("Failed to create session from JSONL: {}", e);
                }
                sessions_created += 1;

                // Update daily aggregates for this session
                let day = &ns.first_seen_at[..10]; // YYYY-MM-DD from RFC3339
                if let Err(e) = db.increment_daily_usage_jsonl(day, 1, ns.event_count, &now) {
                    tracing::warn!("Failed to update daily usage from JSONL: {}", e);
                }
            }
        }
    }

    // Finalize import record
    let finished_at = chrono::Utc::now().to_rfc3339();
    import_rec.finished_at = Some(finished_at);
    import_rec.status = "completed".to_string();
    import_rec.records_parsed = total_parsed;
    import_rec.records_imported = total_imported;
    import_rec.records_skipped = total_skipped;
    let _ = db.update_import(&import_rec);

    let duration_ms = start.elapsed().as_millis() as u64;

    let result = ImportResult {
        files_scanned: import_rec.files_scanned,
        records_parsed: total_parsed,
        records_imported: total_imported,
        records_skipped: total_skipped,
        sessions_created,
        sessions_updated,
        duration_ms,
        error: None,
    };

    tracing::info!(
        "JSONL import complete: {} files, {} parsed, {} imported, {} skipped, {} sessions created, {} updated ({}ms)",
        result.files_scanned, result.records_parsed, result.records_imported,
        result.records_skipped, result.sessions_created, result.sessions_updated,
        result.duration_ms
    );

    Ok(result)
}

/// Backfill search_content for sessions that don't have it yet.
/// Reads per-session JSONL files and extracts text content.
pub fn backfill_search_content(db: &Database) {
    let sessions = match db.list_sessions_without_search_content() {
        Ok(s) => s,
        Err(e) => {
            tracing::warn!("Failed to list sessions for search backfill: {}", e);
            return;
        }
    };

    if sessions.is_empty() {
        return;
    }

    tracing::info!("Backfilling search_content for {} sessions", sessions.len());

    let override_dir = db
        .get_app_setting("jsonl_directory_override")
        .ok()
        .flatten();

    let claude_dir = if let Some(dir) = override_dir {
        std::path::PathBuf::from(dir)
    } else {
        match dirs::home_dir() {
            Some(home) => home.join(".claude"),
            None => return,
        }
    };

    let projects_dir = claude_dir.join("projects");
    if !projects_dir.exists() {
        return;
    }

    let mut backfilled = 0;
    for session in &sessions {
        let source_id = match &session.source_session_id {
            Some(id) => id,
            None => continue,
        };

        let target_filename = format!("{}.jsonl", source_id);
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
            None => continue,
        };

        let content = match std::fs::read_to_string(&path) {
            Ok(c) => c,
            Err(_) => continue,
        };

        let entries: Vec<RawSessionEntry> = content
            .lines()
            .filter_map(|line| parse_session_line(line))
            .collect();

        let search_text = extract_search_content(&entries);
        if !search_text.is_empty() {
            if let Err(e) = db.update_search_content(&session.id, &search_text) {
                tracing::warn!("Failed to backfill search_content for {}: {}", session.id, e);
            } else {
                backfilled += 1;
            }
        }
    }

    if backfilled > 0 {
        tracing::info!("Backfilled search_content for {} sessions", backfilled);
    }
}
