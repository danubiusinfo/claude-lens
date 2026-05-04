use tauri::State;

use crate::error::AppError;
use crate::models::ModelPricing;
use crate::state::AppState;

#[tauri::command]
pub async fn clear_local_data(state: State<'_, AppState>) -> Result<(), AppError> {
    state.database().clear_all_data()?;
    Ok(())
}

#[tauri::command]
pub async fn get_model_pricing(
    state: State<'_, AppState>,
) -> Result<Vec<ModelPricing>, AppError> {
    state.database().get_model_pricing()
}

#[tauri::command]
pub async fn update_model_pricing(
    state: State<'_, AppState>,
    model_key: String,
    input_per_million: f64,
    output_per_million: f64,
    cache_read_per_million: f64,
    cache_write_per_million: f64,
) -> Result<(), AppError> {
    state.database().update_model_pricing(
        &model_key,
        input_per_million,
        output_per_million,
        cache_read_per_million,
        cache_write_per_million,
    )
}

#[tauri::command]
pub async fn reset_model_pricing(
    state: State<'_, AppState>,
) -> Result<Vec<ModelPricing>, AppError> {
    state.database().reset_model_pricing()
}

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
