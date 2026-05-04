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
