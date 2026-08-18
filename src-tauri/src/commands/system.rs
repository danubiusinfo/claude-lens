use std::path::Path;

use crate::error::AppError;

/// Opens an http(s) URL in the user's default browser.
#[tauri::command]
pub async fn open_external_url(url: String) -> Result<(), AppError> {
    if !(url.starts_with("http://") || url.starts_with("https://")) {
        return Err(AppError::Internal(format!("Refusing to open URL: {url}")));
    }

    #[cfg(target_os = "macos")]
    let mut command = std::process::Command::new("open");
    #[cfg(target_os = "linux")]
    let mut command = std::process::Command::new("xdg-open");
    #[cfg(target_os = "windows")]
    let mut command = {
        let mut c = std::process::Command::new("cmd");
        c.args(["/C", "start", ""]);
        c
    };

    command
        .arg(&url)
        .spawn()
        .map_err(|e| AppError::Internal(e.to_string()))?;

    Ok(())
}

/// Opens the platform's file manager with `path` selected.
///
/// macOS and Windows both have a first-class "reveal" flag. On Linux there is
/// no portable one, so we ask the freedesktop FileManager1 D-Bus interface
/// first (GNOME Files, Dolphin, Nemo, Thunar all implement it) and fall back to
/// simply opening the containing directory.
pub fn reveal_in_file_manager(path: &Path) -> Result<(), AppError> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg("-R")
            .arg(path)
            .spawn()
            .map_err(|e| AppError::Internal(e.to_string()))?;
    }

    #[cfg(target_os = "windows")]
    {
        // `explorer /select,<path>` exits with code 1 even when it succeeds, so
        // only the spawn itself is worth checking.
        std::process::Command::new("explorer")
            .arg(format!("/select,{}", path.display()))
            .spawn()
            .map_err(|e| AppError::Internal(e.to_string()))?;
    }

    #[cfg(target_os = "linux")]
    {
        let uri = format!("file://{}", path.display());
        let dbus_ok = std::process::Command::new("dbus-send")
            .args([
                "--session",
                "--dest=org.freedesktop.FileManager1",
                "--type=method_call",
                "/org/freedesktop/FileManager1",
                "org.freedesktop.FileManager1.ShowItems",
                &format!("array:string:{uri}"),
                "string:",
            ])
            .status()
            .map(|s| s.success())
            .unwrap_or(false);

        if !dbus_ok {
            let parent = path
                .parent()
                .ok_or_else(|| AppError::Internal("Path has no parent directory".into()))?;
            std::process::Command::new("xdg-open")
                .arg(parent)
                .spawn()
                .map_err(|e| AppError::Internal(e.to_string()))?;
        }
    }

    Ok(())
}
