mod commands;
mod db;
mod error;
mod events;
mod jsonl;
mod models;
mod pricing;
mod state;
mod watcher;

use state::AppState;
use tauri::Manager;
use tauri_plugin_liquid_glass::LiquidGlassExt;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_liquid_glass::init())
        .setup(|app| {
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("failed to resolve app data dir");
            std::fs::create_dir_all(&app_data_dir).ok();

            let db_path = app_data_dir.join("claudelens.db");
            let database = db::Database::new(&db_path)?;
            database.run_migrations()?;

            let jsonl_status = jsonl::status::JsonlImportStatus::new();
            let app_state = AppState::new(database, jsonl_status.clone());

            app.manage(app_state.clone());

            // Apply liquid glass effect to the main window
            if let Some(window) = app.get_webview_window("main") {
                let supported = app.liquid_glass().is_supported();
                tracing::info!("Liquid glass supported: {}", supported);
                match app.liquid_glass().set_effect(
                    &window,
                    tauri_plugin_liquid_glass::LiquidGlassConfig::default(),
                ) {
                    Ok(_) => tracing::info!("Liquid glass effect applied successfully"),
                    Err(e) => tracing::error!("Failed to apply liquid glass effect: {}", e),
                }
            } else {
                tracing::error!("Could not find main window for liquid glass");
            }

            // Auto-import JSONL on startup
            let handle_for_jsonl = app.handle().clone();
            let db_for_jsonl = app_state.database().clone();
            let jsonl_status_for_import = jsonl_status.clone();
            tauri::async_runtime::spawn(async move {
                // Small delay to let the app fully initialize
                tokio::time::sleep(std::time::Duration::from_millis(500)).await;

                tracing::info!("Starting auto-import of JSONL history...");
                jsonl_status_for_import.set_importing(true);

                match jsonl::import::run_import(&db_for_jsonl, false) {
                    Ok(result) => {
                        jsonl_status_for_import.update_completed(
                            result.files_scanned as u64,
                            result.records_imported as u64,
                            (result.sessions_created + result.sessions_updated) as u64,
                        );
                        tracing::info!(
                            "JSONL auto-import done: {} sessions created, {} updated",
                            result.sessions_created,
                            result.sessions_updated
                        );
                    }
                    Err(e) => {
                        jsonl_status_for_import.update_error(e.clone());
                        tracing::error!("JSONL auto-import failed: {}", e);
                    }
                }

                // Backfill search_content for sessions missing it
                jsonl::import::backfill_search_content(&db_for_jsonl);

                // Notify frontend that data changed
                events::frontend::emit_db_updated(&handle_for_jsonl);
            });

            // Start file watcher for live JSONL updates
            let handle_for_watcher = app.handle().clone();
            let state_for_watcher = app_state.clone();
            std::thread::spawn(move || {
                if let Err(e) = watcher::start_file_watcher(handle_for_watcher, state_for_watcher) {
                    tracing::error!("Failed to start file watcher: {}", e);
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::status::get_app_status,
            commands::settings::clear_local_data,
            commands::settings::get_model_pricing,
            commands::settings::update_model_pricing,
            commands::settings::reset_model_pricing,
            commands::dashboard::get_dashboard_summary,
            commands::dashboard::get_token_timeseries,
            commands::dashboard::get_project_stats,
            commands::dashboard::get_input_output_breakdown,
            commands::dashboard::get_daily_heatmap,
            commands::dashboard::list_sessions,
            commands::dashboard::list_distinct_projects,
            commands::dashboard::get_session_detail,
            commands::dashboard::get_session_messages,
            commands::dashboard::toggle_session_bookmark,
            commands::dashboard::list_bookmarked_sessions,
            commands::dashboard::rename_session,
            commands::dashboard::search_sessions,
            commands::jsonl::discover_jsonl_sources,
            commands::jsonl::list_jsonl_sources,
            commands::jsonl::run_jsonl_import,
            commands::jsonl::get_import_history,
            commands::jsonl::get_source_status,
            commands::jsonl::set_jsonl_directory_override,
            commands::jsonl::rescan_sources,
            commands::user::get_user_profile,
            commands::plans::list_plans,
            commands::plans::read_plan,
            commands::plans::reveal_plan_in_finder,
            commands::worklog::get_session_worklog,
            commands::worklog::get_session_worklog_turns,
            commands::worklog::get_dashboard_worklog,
            commands::worklog::get_day_worklog_by_project,
            commands::worklog::list_session_worklogs,
            commands::worklog::recompute_worklogs,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
