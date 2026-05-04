use tauri::Emitter;

use super::DB_UPDATED;

pub fn emit_db_updated(app: &tauri::AppHandle) {
    if let Err(e) = app.emit(DB_UPDATED, ()) {
        tracing::error!("Failed to emit {}: {}", DB_UPDATED, e);
    }
}
