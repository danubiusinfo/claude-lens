use tauri::menu::{Menu, MenuItemBuilder, PredefinedMenuItem, Submenu};
use tauri::{AppHandle, Manager, Runtime, WebviewUrl, WebviewWindowBuilder};

/// Id of our custom "About <app>" menu item.
pub const ABOUT_MENU_ID: &str = "about-app";

const ABOUT_WINDOW_LABEL: &str = "about";

/// Mirrors Tauri's default menu, except the predefined native About item is
/// swapped for a custom one. The native macOS about panel renders its credits
/// as a plain string, so it cannot host the clickable danubius.io link.
pub fn build_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let app_name = app.package_info().name.clone();
    let about_item =
        MenuItemBuilder::with_id(ABOUT_MENU_ID, format!("About {app_name}")).build(app)?;

    let window_menu = Submenu::with_items(
        app,
        "Window",
        true,
        &[
            &PredefinedMenuItem::minimize(app, None)?,
            &PredefinedMenuItem::maximize(app, None)?,
            #[cfg(target_os = "macos")]
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::close_window(app, None)?,
        ],
    )?;

    let help_menu = Submenu::with_items(
        app,
        "Help",
        true,
        &[
            #[cfg(not(target_os = "macos"))]
            &about_item,
        ],
    )?;

    Menu::with_items(
        app,
        &[
            #[cfg(target_os = "macos")]
            &Submenu::with_items(
                app,
                app_name.clone(),
                true,
                &[
                    &about_item,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::services(app, None)?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::hide(app, None)?,
                    &PredefinedMenuItem::hide_others(app, None)?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::quit(app, None)?,
                ],
            )?,
            #[cfg(not(any(
                target_os = "linux",
                target_os = "dragonfly",
                target_os = "freebsd",
                target_os = "netbsd",
                target_os = "openbsd"
            )))]
            &Submenu::with_items(
                app,
                "File",
                true,
                &[
                    &PredefinedMenuItem::close_window(app, None)?,
                    #[cfg(not(target_os = "macos"))]
                    &PredefinedMenuItem::quit(app, None)?,
                ],
            )?,
            &Submenu::with_items(
                app,
                "Edit",
                true,
                &[
                    &PredefinedMenuItem::undo(app, None)?,
                    &PredefinedMenuItem::redo(app, None)?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::cut(app, None)?,
                    &PredefinedMenuItem::copy(app, None)?,
                    &PredefinedMenuItem::paste(app, None)?,
                    &PredefinedMenuItem::select_all(app, None)?,
                ],
            )?,
            #[cfg(target_os = "macos")]
            &Submenu::with_items(
                app,
                "View",
                true,
                &[&PredefinedMenuItem::fullscreen(app, None)?],
            )?,
            &window_menu,
            &help_menu,
        ],
    )
}

/// Opens (or refocuses) the custom About window.
pub fn show_about_window<R: Runtime>(app: &AppHandle<R>) {
    if let Some(existing) = app.get_webview_window(ABOUT_WINDOW_LABEL) {
        let _ = existing.show();
        let _ = existing.set_focus();
        return;
    }

    let app_name = app.package_info().name.clone();
    let version = app.package_info().version.to_string();

    let result = WebviewWindowBuilder::new(
        app,
        ABOUT_WINDOW_LABEL,
        WebviewUrl::App("about.html".into()),
    )
    .title(format!("About {app_name}"))
    .inner_size(340.0, 340.0)
    .resizable(false)
    .maximizable(false)
    .minimizable(false)
    .center()
    .initialization_script(format!(
        "window.__ABOUT__ = {{ version: {} }};",
        serde_json::json!(version)
    ))
    .build();

    if let Err(e) = result {
        tracing::error!("Failed to open About window: {}", e);
    }
}
