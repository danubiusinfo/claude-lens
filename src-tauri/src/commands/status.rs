use serde::Serialize;
use tauri::State;

use crate::error::AppError;
use crate::state::AppState;

#[derive(Debug, Serialize)]
pub struct AppStatusResponse {
    pub db_initialized: bool,
    pub has_jsonl_data: bool,
    pub jsonl_importing: bool,
}

#[tauri::command]
pub async fn get_app_status(state: State<'_, AppState>) -> Result<AppStatusResponse, AppError> {
    let jsonl_info = state.jsonl_status().get();
    let has_jsonl = state.database().has_jsonl_data().unwrap_or(false);

    Ok(AppStatusResponse {
        db_initialized: true,
        has_jsonl_data: has_jsonl,
        jsonl_importing: jsonl_info.is_importing,
    })
}
