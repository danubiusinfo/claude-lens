use serde::Serialize;

use crate::error::AppError;

#[derive(Debug, Serialize)]
pub struct PlanEntry {
    pub filename: String,
    pub name: String,
    pub title: String,
    pub modified_at: String,
    pub size_bytes: u64,
}

#[tauri::command]
pub async fn list_plans() -> Result<Vec<PlanEntry>, AppError> {
    let home = dirs::home_dir()
        .ok_or_else(|| AppError::Internal("Cannot resolve home directory".into()))?;
    let plans_dir = home.join(".claude").join("plans");

    if !plans_dir.exists() {
        return Ok(Vec::new());
    }

    let mut entries: Vec<PlanEntry> = Vec::new();

    for entry in std::fs::read_dir(&plans_dir)? {
        let entry = entry?;
        let path = entry.path();

        if path.extension().and_then(|e| e.to_str()) != Some("md") {
            continue;
        }

        let filename = entry.file_name().to_string_lossy().to_string();
        let name = filename.trim_end_matches(".md").to_string();

        // Extract title from first "# " heading in the file
        let title = std::fs::read_to_string(&path)
            .ok()
            .and_then(|content| {
                content
                    .lines()
                    .find(|line| line.starts_with("# "))
                    .map(|line| line.trim_start_matches("# ").trim().to_string())
            })
            .unwrap_or_else(|| name.clone());

        let metadata = entry.metadata()?;
        let modified = metadata
            .modified()
            .ok()
            .and_then(|t| {
                let duration = t
                    .duration_since(std::time::UNIX_EPOCH)
                    .ok()?;
                let dt = chrono::DateTime::from_timestamp(
                    duration.as_secs() as i64,
                    duration.subsec_nanos(),
                )?;
                Some(dt.to_rfc3339())
            })
            .unwrap_or_default();

        entries.push(PlanEntry {
            filename,
            name,
            title,
            modified_at: modified,
            size_bytes: metadata.len(),
        });
    }

    // Sort by modified time, newest first
    entries.sort_by(|a, b| b.modified_at.cmp(&a.modified_at));

    Ok(entries)
}

#[tauri::command]
pub async fn reveal_plan_in_finder(filename: String) -> Result<(), AppError> {
    if filename.contains('/') || filename.contains('\\') || filename.contains("..") {
        return Err(AppError::Internal("Invalid filename".into()));
    }

    let home = dirs::home_dir()
        .ok_or_else(|| AppError::Internal("Cannot resolve home directory".into()))?;
    let path = home.join(".claude").join("plans").join(&filename);

    if !path.exists() {
        return Err(AppError::Internal(format!("Plan not found: {}", filename)));
    }

    crate::commands::system::reveal_in_file_manager(&path)
}

#[tauri::command]
pub async fn read_plan(filename: String) -> Result<String, AppError> {
    // Prevent path traversal
    if filename.contains('/') || filename.contains('\\') || filename.contains("..") {
        return Err(AppError::Internal("Invalid filename".into()));
    }

    let home = dirs::home_dir()
        .ok_or_else(|| AppError::Internal("Cannot resolve home directory".into()))?;
    let path = home.join(".claude").join("plans").join(&filename);

    if !path.exists() {
        return Err(AppError::Internal(format!("Plan not found: {}", filename)));
    }

    let content = std::fs::read_to_string(&path)?;
    Ok(content)
}
