use chrono::Datelike;
use serde::Deserialize;
use tauri::State;

use crate::db::{DashboardSummary, ProjectStats, TimeseriesPoint};
use crate::error::AppError;
use crate::jsonl::normalize::extract_session_messages;
use crate::jsonl::parser::parse_session_line;
use crate::jsonl::types::SessionMessage;
use crate::models::{DailyUsageRecord, SessionRecord};
use crate::state::AppState;

/// Convert a range string (e.g. "Today", "WorkWeek", "Week", "Month", "All") into a
/// (start_day, end_day) pair formatted as YYYY-MM-DD.
pub fn range_to_days(
    range: &str,
    db: &crate::db::Database,
) -> Result<(String, String), AppError> {
    use chrono::{Datelike, Duration, Local, NaiveDate};
    let today: NaiveDate = Local::now().date_naive();
    let (start, end) = match range {
        "Today" => (today, today),
        "WorkWeek" => {
            let weekday = today.weekday().num_days_from_monday() as i64;
            (today - Duration::days(weekday), today)
        }
        "Week" => (today - Duration::days(6), today),
        "Month" => (today - Duration::days(29), today),
        "All" => {
            let earliest: Option<String> = db.get_earliest_session_day().ok().flatten();
            let start = earliest
                .and_then(|s| NaiveDate::parse_from_str(&s, "%Y-%m-%d").ok())
                .unwrap_or(today);
            (start, today)
        }
        _ => (today, today),
    };
    Ok((start.format("%Y-%m-%d").to_string(), end.format("%Y-%m-%d").to_string()))
}

#[derive(Debug, Deserialize)]
pub enum TimeRange {
    Today,
    WorkWeek,
    Week,
    Month,
    All,
}

impl TimeRange {
    pub fn to_date_range(&self) -> (String, String) {
        let now = chrono::Utc::now();
        let today = now.format("%Y-%m-%d").to_string();
        let from = match self {
            TimeRange::Today => today.clone(),
            TimeRange::WorkWeek => {
                // Current work week: Monday to Friday
                let weekday = now.weekday().num_days_from_monday(); // Mon=0 .. Sun=6
                let monday = now - chrono::Duration::days(weekday as i64);
                monday.format("%Y-%m-%d").to_string()
            }
            TimeRange::Week => {
                let d = now - chrono::Duration::days(7);
                d.format("%Y-%m-%d").to_string()
            }
            TimeRange::Month => {
                let d = now - chrono::Duration::days(30);
                d.format("%Y-%m-%d").to_string()
            }
            TimeRange::All => "2000-01-01".to_string(),
        };
        (from, today)
    }
}

#[tauri::command]
pub async fn get_dashboard_summary(
    state: State<'_, AppState>,
    range: TimeRange,
) -> Result<DashboardSummary, AppError> {
    let (from, to) = range.to_date_range();
    state.database().get_dashboard_summary(&from, &to)
}

#[tauri::command]
pub async fn get_token_timeseries(
    state: State<'_, AppState>,
    range: TimeRange,
) -> Result<Vec<TimeseriesPoint>, AppError> {
    let (from, to) = range.to_date_range();
    state.database().get_token_timeseries(&from, &to)
}

#[tauri::command]
pub async fn get_input_output_breakdown(
    state: State<'_, AppState>,
    range: TimeRange,
) -> Result<Vec<TimeseriesPoint>, AppError> {
    let (from, to) = range.to_date_range();
    state.database().get_input_output_breakdown(&from, &to)
}

#[tauri::command]
pub async fn get_daily_heatmap(
    state: State<'_, AppState>,
    range: TimeRange,
) -> Result<Vec<DailyUsageRecord>, AppError> {
    let (from, to) = range.to_date_range();
    state.database().get_daily_heatmap(&from, &to)
}

#[tauri::command]
pub async fn list_sessions(
    state: State<'_, AppState>,
    limit: Option<i64>,
    offset: Option<i64>,
    project: Option<String>,
) -> Result<Vec<SessionRecord>, AppError> {
    state
        .database()
        .list_sessions(limit.unwrap_or(50), offset.unwrap_or(0), project.as_deref())
}

#[tauri::command]
pub async fn list_distinct_projects(
    state: State<'_, AppState>,
) -> Result<Vec<String>, AppError> {
    state.database().list_distinct_projects()
}

#[tauri::command]
pub async fn get_session_detail(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<Option<SessionRecord>, AppError> {
    state.database().get_session_by_id(&session_id)
}

#[tauri::command]
pub async fn rename_session(
    state: State<'_, AppState>,
    session_id: String,
    custom_name: Option<String>,
) -> Result<(), AppError> {
    let name_ref = custom_name.as_deref().filter(|s| !s.trim().is_empty());
    state.database().rename_session(&session_id, name_ref)
}

#[tauri::command]
pub async fn search_sessions(
    state: State<'_, AppState>,
    query: String,
    limit: Option<i64>,
) -> Result<Vec<SessionRecord>, AppError> {
    if query.trim().is_empty() {
        return Ok(Vec::new());
    }
    state.database().search_sessions(query.trim(), limit.unwrap_or(50))
}

#[tauri::command]
pub async fn toggle_session_bookmark(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<bool, AppError> {
    state.database().toggle_bookmark(&session_id)
}

#[tauri::command]
pub async fn list_bookmarked_sessions(
    state: State<'_, AppState>,
) -> Result<Vec<SessionRecord>, AppError> {
    state.database().list_bookmarked_sessions()
}

#[tauri::command]
pub async fn get_session_messages(
    state: State<'_, AppState>,
    source_session_id: String,
) -> Result<Vec<SessionMessage>, AppError> {
    // Resolve the override directory if set
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
        return Ok(Vec::new());
    }

    // Search for <source_session_id>.jsonl in all project subdirectories
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
        None => return Ok(Vec::new()),
    };

    // Read and parse the file
    let content = std::fs::read_to_string(&path)
        .map_err(|e| AppError::Internal(format!("Cannot read session file: {}", e)))?;

    let entries: Vec<_> = content
        .lines()
        .filter_map(|line| parse_session_line(line))
        .collect();

    let pricing = state.database().get_model_pricing().unwrap_or_default();
    Ok(extract_session_messages(&entries, &pricing))
}

#[tauri::command]
pub async fn get_project_stats(
    state: State<'_, AppState>,
    limit: Option<i64>,
) -> Result<Vec<ProjectStats>, AppError> {
    state.database().get_project_stats(limit.unwrap_or(10))
}
