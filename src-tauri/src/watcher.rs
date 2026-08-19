use std::time::Duration;

use notify::{PollWatcher, RecursiveMode};
use notify_debouncer_mini::{new_debouncer, new_debouncer_opt, Config as DebouncerConfig, DebouncedEvent};

use crate::claude_roots::ClaudeRoot;
use crate::events::frontend::emit_db_updated;
use crate::jsonl::import::run_import;
use crate::state::AppState;

/// How long to wait after the last change before importing.
const DEBOUNCE: Duration = Duration::from_secs(10);

/// WSL roots are polled instead of watched; the interval is deliberately long
/// because every tick walks the whole tree over the distro's 9p share.
const WSL_POLL_INTERVAL: Duration = Duration::from_secs(60);

/// Start watching every Claude root for JSONL file changes.
/// Triggers an incremental import on change with a 10-second debounce.
pub fn start_file_watcher(
    app_handle: tauri::AppHandle,
    state: AppState,
) -> Result<(), String> {
    let roots = crate::claude_roots::roots(state.database());

    if roots.is_empty() {
        return Err("No Claude directory found to watch".to_string());
    }

    let mut watched = 0;
    for root in &roots {
        match watch_root(root, &app_handle, &state) {
            Ok(()) => {
                watched += 1;
                tracing::info!(
                    "File watcher started on {} ({}{})",
                    root.path.display(),
                    root.label,
                    if root.needs_polling() { ", polling" } else { "" }
                );
            }
            Err(e) => tracing::warn!("Not watching {}: {}", root.path.display(), e),
        }
    }

    if watched == 0 {
        return Err("Could not watch any Claude directory".to_string());
    }

    Ok(())
}

fn watch_root(
    root: &ClaudeRoot,
    app_handle: &tauri::AppHandle,
    state: &AppState,
) -> Result<(), String> {
    if !root.path.exists() {
        return Err(format!("directory not found: {}", root.path.display()));
    }

    let handler = import_on_change(app_handle.clone(), state.clone());

    // `ReadDirectoryChangesW` does not deliver events over the WSL share, so
    // those roots get a polling watcher instead.
    if root.needs_polling() {
        let config = DebouncerConfig::default()
            .with_timeout(DEBOUNCE)
            .with_notify_config(notify::Config::default().with_poll_interval(WSL_POLL_INTERVAL));
        let mut debouncer = new_debouncer_opt::<_, PollWatcher>(config, handler)
            .map_err(|e| format!("failed to create polling watcher: {}", e))?;
        debouncer
            .watcher()
            .watch(&root.path, RecursiveMode::Recursive)
            .map_err(|e| format!("failed to poll: {}", e))?;
        // Leak the debouncer to keep it alive for the app's lifetime.
        // This is intentional — the watcher must not be dropped.
        Box::leak(Box::new(debouncer));
    } else {
        let mut debouncer = new_debouncer(DEBOUNCE, handler)
            .map_err(|e| format!("failed to create watcher: {}", e))?;
        debouncer
            .watcher()
            .watch(&root.path, RecursiveMode::Recursive)
            .map_err(|e| format!("failed to watch: {}", e))?;
        Box::leak(Box::new(debouncer));
    }

    Ok(())
}

/// Build the change handler: import whatever changed, then tell the frontend.
fn import_on_change(
    app_handle: tauri::AppHandle,
    state: AppState,
) -> impl FnMut(Result<Vec<DebouncedEvent>, notify::Error>) + Send + 'static {
    let db = state.database().clone();
    let jsonl_status = state.jsonl_status().clone();

    move |events: Result<Vec<DebouncedEvent>, notify::Error>| {
        let events = match events {
            Ok(e) => e,
            Err(e) => {
                tracing::warn!("File watcher error: {:?}", e);
                return;
            }
        };

        let has_jsonl_change = events
            .iter()
            .any(|e| e.path.extension().map_or(false, |ext| ext == "jsonl"));

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

        emit_db_updated(&app_handle);
    }
}
