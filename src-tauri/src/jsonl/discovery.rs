use std::path::{Path, PathBuf};

use super::types::DiscoveredFile;

/// Discover all Claude Code JSONL files on this system.
pub fn discover_jsonl_paths(override_dir: Option<&str>) -> Vec<DiscoveredFile> {
    let mut files = Vec::new();

    let claude_dir = if let Some(dir) = override_dir {
        PathBuf::from(dir)
    } else {
        match dirs::home_dir() {
            Some(home) => home.join(".claude"),
            None => {
                tracing::warn!("Could not determine home directory");
                return files;
            }
        }
    };

    if !claude_dir.exists() {
        tracing::info!("Claude directory not found: {:?}", claude_dir);
        return files;
    }

    // Check ~/.claude/history.jsonl
    let history_file = claude_dir.join("history.jsonl");
    if history_file.exists() {
        if let Some(df) = file_to_discovered(&history_file, "history") {
            files.push(df);
        }
    }

    // Check ~/.claude/projects/*/*.jsonl
    let projects_dir = claude_dir.join("projects");
    if projects_dir.exists() {
        if let Ok(entries) = std::fs::read_dir(&projects_dir) {
            for entry in entries.flatten() {
                let project_dir = entry.path();
                if !project_dir.is_dir() {
                    continue;
                }
                if let Ok(project_files) = std::fs::read_dir(&project_dir) {
                    for pf in project_files.flatten() {
                        let path = pf.path();
                        if path.extension().map_or(false, |ext| ext == "jsonl") {
                            if let Some(df) = file_to_discovered(&path, "project") {
                                files.push(df);
                            }
                        }
                    }
                }
            }
        }
    }

    tracing::info!("Discovered {} JSONL files", files.len());
    files
}

fn file_to_discovered(path: &Path, file_type: &str) -> Option<DiscoveredFile> {
    let metadata = std::fs::metadata(path).ok()?;
    let modified_at = metadata
        .modified()
        .ok()
        .map(|t| {
            let dt: chrono::DateTime<chrono::Utc> = t.into();
            dt.to_rfc3339()
        });

    Some(DiscoveredFile {
        path: path.to_string_lossy().to_string(),
        file_type: file_type.to_string(),
        size: metadata.len(),
        modified_at,
    })
}
