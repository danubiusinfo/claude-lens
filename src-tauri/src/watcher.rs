use std::time::Duration;

use notify::RecursiveMode;
use notify_debouncer_mini::new_debouncer;

use crate::events::frontend::emit_db_updated;
use crate::jsonl::import::run_import;
use crate::state::AppState;

/// Start watching ~/.claude/ for JSONL file changes.
/// Triggers incremental import on change with 10-second debounce.
/// Returns the debouncer handle — dropping it stops the watcher.
pub fn start_file_watcher(
    app_handle: tauri::AppHandle,
    state: AppState,
) -> Result<(), String> {
    let claude_dir = dirs::home_dir()
        .ok_or_else(|| "Cannot resolve home directory".to_string())?
        .join(".claude");

    if !claude_dir.exists() {
        return Err(format!("Claude directory not found: {}", claude_dir.display()));
    }

    let handle = app_handle.clone();
    let db = state.database().clone();
    let jsonl_status = state.jsonl_status().clone();

    let mut debouncer = new_debouncer(
        Duration::from_secs(10),
        move |events: Result<Vec<notify_debouncer_mini::DebouncedEvent>, notify::Error>| {
            let events = match events {
                Ok(e) => e,
                Err(e) => {
                    tracing::warn!("File watcher error: {:?}", e);
                    return;
                }
            };

            let has_jsonl_change = events.iter().any(|e| {
                e.path
                    .extension()
                    .map_or(false, |ext| ext == "jsonl")
            });

            if !has_jsonl_change {
                return;
            }

            // Skip if already importing
            if jsonl_status.get().is_importing {
                tracing::debug!("Skipping file-watcher import: already importing");
                return;
            }

            tracing::info!("File watcher detected JSONL changes, running incremental import...");
            jsonl_status.set_importing(true);

            match run_import(&db, false) {
                Ok(result) => {
                    jsonl_status.update_completed(
                        result.files_scanned as u64,
                        result.records_imported as u64,
                        (result.sessions_created + result.sessions_updated) as u64,
                    );
                    tracing::info!(
                        "File watcher import done: {} files, {} imported ({}ms)",
                        result.files_scanned,
                        result.records_imported,
                        result.duration_ms
                    );
                }
                Err(e) => {
                    jsonl_status.update_error(e.clone());
                    tracing::error!("File watcher import failed: {}", e);
                }
            }

            emit_db_updated(&handle);
        },
    )
    .map_err(|e| format!("Failed to create file watcher: {}", e))?;

    debouncer
        .watcher()
        .watch(&claude_dir, RecursiveMode::Recursive)
        .map_err(|e| format!("Failed to watch {}: {}", claude_dir.display(), e))?;

    tracing::info!("File watcher started on {}", claude_dir.display());

    // Leak the debouncer to keep it alive for the app's lifetime.
    // This is intentional — the watcher must not be dropped.
    Box::leak(Box::new(debouncer));

    Ok(())
}
