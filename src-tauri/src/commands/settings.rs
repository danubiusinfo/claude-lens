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
    context_limit: i64,
) -> Result<(), AppError> {
    state.database().update_model_pricing(
        &model_key,
        input_per_million,
        output_per_million,
        cache_read_per_million,
        cache_write_per_million,
        context_limit,
    )
}

#[tauri::command]
pub async fn reset_model_pricing(
    state: State<'_, AppState>,
) -> Result<Vec<ModelPricing>, AppError> {
    state.database().reset_model_pricing()
}
