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
    _state: State<'_, AppState>,
    _session_id: String,
) -> Result<Vec<TurnWorklog>, AppError> {
    // v1: per-turn breakdown is computed on demand from the JSONL file.
    // For the initial release we return an empty list — the detail panel
    // gracefully hides the per-turn list when empty (the summary card still works).
    // Follow-up task: implement per-session message re-extraction here.
    Ok(Vec::new())
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
    let result: Result<(), String> = tauri::async_runtime::spawn_blocking(move || {
        // Full re-import — re-derives worklogs for every session with the new threshold.
        // Each session's worklog rows are replaced inside the import loop, so we don't
        // pre-delete (which would leave the DB empty if the import then fails).
        crate::jsonl::import::run_import(&db, true).map(|_| ())
    })
    .await
    .map_err(|e| AppError::Database(e.to_string()))?;

    result.map_err(AppError::Database)?;
    events::frontend::emit_db_updated(&app);
    Ok(())
}
