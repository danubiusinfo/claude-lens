use serde::Serialize;
use tauri::State;

use crate::error::AppError;
use crate::jsonl::discovery::discover_jsonl_paths;
use crate::jsonl::import::run_import;
use crate::jsonl::status::JsonlStatusInfo;
use crate::jsonl::types::ImportResult;
use crate::models::{ImportRecord, SourceFileRecord};
use crate::state::AppState;

#[derive(Debug, Serialize)]
pub struct SourceStatusInfo {
    pub jsonl: JsonlStatusInfo,
    pub has_jsonl_data: bool,
    pub source_file_count: i64,
    pub total_jsonl_sessions: i64,
}

#[tauri::command]
pub async fn discover_jsonl_sources(
    state: State<'_, AppState>,
) -> Result<Vec<SourceFileRecord>, AppError> {
    let override_dir = state
        .database()
        .get_app_setting("jsonl_directory_override")
        .ok()
        .flatten();

    let discovered = discover_jsonl_paths(override_dir.as_deref());
    let now = chrono::Utc::now().to_rfc3339();

    let mut result = Vec::new();
    for d in discovered {
        let sf = SourceFileRecord {
            id: None,
            file_path: d.path,
            file_type: d.file_type,
            file_size: d.size as i64,
            last_modified_at: d.modified_at,
            last_scanned_at: Some(now.clone()),
            last_offset: 0,
            record_count: 0,
            created_at: now.clone(),
        };
        result.push(sf);
    }

    Ok(result)
}

#[tauri::command]
pub async fn list_jsonl_sources(
    state: State<'_, AppState>,
) -> Result<Vec<SourceFileRecord>, AppError> {
    state.database().list_source_files()
}

#[tauri::command]
pub async fn run_jsonl_import(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    full: Option<bool>,
) -> Result<ImportResult, AppError> {
    let jsonl_status = state.jsonl_status().clone();
    jsonl_status.set_importing(true);

    let result = run_import(state.database(), full.unwrap_or(false));

    match &result {
        Ok(r) => {
            jsonl_status.update_completed(
                r.files_scanned as u64,
                r.records_imported as u64,
                (r.sessions_created + r.sessions_updated) as u64,
            );
            crate::events::frontend::emit_db_updated(&app);
        }
        Err(e) => {
            jsonl_status.update_error(e.clone());
        }
    }

    result.map_err(|e| AppError::Internal(e))
}

#[tauri::command]
pub async fn get_import_history(
    state: State<'_, AppState>,
) -> Result<Vec<ImportRecord>, AppError> {
    state.database().list_imports(20)
}

#[tauri::command]
pub async fn get_source_status(
    state: State<'_, AppState>,
) -> Result<SourceStatusInfo, AppError> {
    let mut jsonl_info = state.jsonl_status().get();
    // Use actual DB session count instead of last-import delta
    jsonl_info.total_sessions = state.database().count_sessions().unwrap_or(0) as u64;
    let has_jsonl = state.database().has_jsonl_data().unwrap_or(false);
    let sources = state.database().list_source_files().unwrap_or_default();
    let total_jsonl_sessions = sources.iter().map(|s| s.record_count).sum::<i64>();

    Ok(SourceStatusInfo {
        jsonl: jsonl_info,
        has_jsonl_data: has_jsonl,
        source_file_count: sources.len() as i64,
        total_jsonl_sessions,
    })
}

#[tauri::command]
pub async fn set_jsonl_directory_override(
    state: State<'_, AppState>,
    path: Option<String>,
) -> Result<(), AppError> {
    match path {
        Some(p) => state.database().set_app_setting("jsonl_directory_override", &p),
        None => {
            // Clear override — set to empty
            state.database().set_app_setting("jsonl_directory_override", "")
        }
    }
}

#[tauri::command]
pub async fn rescan_sources(
    state: State<'_, AppState>,
) -> Result<Vec<SourceFileRecord>, AppError> {
    let override_dir = state
        .database()
        .get_app_setting("jsonl_directory_override")
        .ok()
        .flatten();

    let discovered = discover_jsonl_paths(override_dir.as_deref());
    let now = chrono::Utc::now().to_rfc3339();

    let mut result = Vec::new();
    for d in discovered {
        let sf = SourceFileRecord {
            id: None,
            file_path: d.path,
            file_type: d.file_type,
            file_size: d.size as i64,
            last_modified_at: d.modified_at,
            last_scanned_at: Some(now.clone()),
            last_offset: 0,
            record_count: 0,
            created_at: now.clone(),
        };
        let _ = state.database().upsert_source_file(&sf);
        result.push(sf);
    }

    Ok(result)
}
