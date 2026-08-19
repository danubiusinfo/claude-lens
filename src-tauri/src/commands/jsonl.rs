use serde::Serialize;
use tauri::State;

use crate::claude_roots::{self, ClaudeRoot, RootKind};
use crate::error::AppError;
use crate::jsonl::discovery::discover_jsonl_paths;
use crate::jsonl::import::run_import;
use crate::jsonl::status::JsonlStatusInfo;
use crate::jsonl::types::ImportResult;
use crate::models::{ImportRecord, SourceFileRecord};
use crate::state::AppState;

/// One `.claude` directory as shown in Settings.
#[derive(Debug, Serialize, PartialEq, Eq)]
pub struct ClaudeRootInfo {
    pub path: String,
    pub label: String,
    pub kind: RootKind,
    pub exists: bool,
    pub jsonl_file_count: usize,
}

/// Current source configuration, for the Settings screen.
#[derive(Debug, Serialize)]
pub struct SourceSettings {
    pub override_dir: Option<String>,
    pub wsl_scan_enabled: bool,
    pub is_windows: bool,
}

/// Describe each root for the UI, including how many JSONL files it holds.
pub fn describe_roots(roots: &[ClaudeRoot]) -> Vec<ClaudeRootInfo> {
    roots
        .iter()
        .map(|root| ClaudeRootInfo {
            path: root.path.to_string_lossy().to_string(),
            label: root.label.clone(),
            kind: root.kind,
            exists: root.path.exists(),
            jsonl_file_count: discover_jsonl_paths(std::slice::from_ref(root)).len(),
        })
        .collect()
}

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
    let roots = claude_roots::roots(state.database());
    let discovered = discover_jsonl_paths(&roots);
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
    let value = path.unwrap_or_default();
    state
        .database()
        .set_app_setting(claude_roots::OVERRIDE_SETTING, value.trim())?;
    // The roots are cached, so the new setting only takes effect after a reset.
    claude_roots::invalidate_cache();
    Ok(())
}

#[tauri::command]
pub async fn rescan_sources(
    state: State<'_, AppState>,
) -> Result<Vec<SourceFileRecord>, AppError> {
    // A rescan is the user asking us to look again — re-detect the roots too.
    claude_roots::invalidate_cache();
    let roots = claude_roots::roots(state.database());
    let discovered = discover_jsonl_paths(&roots);
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

#[tauri::command]
pub async fn list_claude_roots(
    state: State<'_, AppState>,
) -> Result<Vec<ClaudeRootInfo>, AppError> {
    let roots = claude_roots::roots(state.database());
    Ok(describe_roots(&roots))
}

#[tauri::command]
pub async fn get_source_settings(
    state: State<'_, AppState>,
) -> Result<SourceSettings, AppError> {
    let override_dir = state
        .database()
        .get_app_setting(claude_roots::OVERRIDE_SETTING)
        .ok()
        .flatten()
        .filter(|v| !v.trim().is_empty());

    let wsl_scan_enabled = state
        .database()
        .get_app_setting(claude_roots::WSL_SCAN_SETTING)
        .ok()
        .flatten()
        .map_or(true, |v| v != "0");

    Ok(SourceSettings {
        override_dir,
        wsl_scan_enabled,
        is_windows: cfg!(target_os = "windows"),
    })
}

#[tauri::command]
pub async fn set_wsl_scan_enabled(
    state: State<'_, AppState>,
    enabled: bool,
) -> Result<(), AppError> {
    state
        .database()
        .set_app_setting(claude_roots::WSL_SCAN_SETTING, if enabled { "1" } else { "0" })?;
    claude_roots::invalidate_cache();
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::{Path, PathBuf};

    fn write(path: &Path) {
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, b"{}\n").unwrap();
    }

    fn root(path: PathBuf, kind: RootKind) -> ClaudeRoot {
        ClaudeRoot { path, label: "test".to_string(), kind }
    }

    #[test]
    fn counts_jsonl_files_per_root() {
        let tmp = tempfile::tempdir().unwrap();
        let native = tmp.path().join("windows/.claude");
        let wsl = tmp.path().join("wsl/.claude");
        write(&native.join("projects/proj/aaa.jsonl"));
        write(&wsl.join("projects/proj/bbb.jsonl"));
        write(&wsl.join("projects/proj/ccc.jsonl"));

        let infos = describe_roots(&[root(native, RootKind::Native), root(wsl, RootKind::Wsl)]);

        assert_eq!(
            infos.iter().map(|i| i.jsonl_file_count).collect::<Vec<_>>(),
            vec![1, 2]
        );
        assert!(infos.iter().all(|i| i.exists));
    }

    #[test]
    fn reports_a_missing_root_as_absent() {
        let tmp = tempfile::tempdir().unwrap();

        let infos = describe_roots(&[root(tmp.path().join("gone/.claude"), RootKind::Manual)]);

        assert_eq!(infos.len(), 1);
        assert!(!infos[0].exists);
        assert_eq!(infos[0].jsonl_file_count, 0);
    }

    #[test]
    fn keeps_path_and_label_for_display() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().join("wsl/.claude");
        write(&path.join("history.jsonl"));

        let infos = describe_roots(&[ClaudeRoot {
            path: path.clone(),
            label: "WSL: Ubuntu/beno".to_string(),
            kind: RootKind::Wsl,
        }]);

        assert_eq!(infos[0].path, path.to_string_lossy().to_string());
        assert_eq!(infos[0].label, "WSL: Ubuntu/beno");
        assert_eq!(infos[0].kind, RootKind::Wsl);
    }
}
