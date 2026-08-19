use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::State;

use crate::claude_roots::ClaudeRoot;
use crate::error::AppError;
use crate::state::AppState;

#[derive(Debug, Serialize)]
pub struct PlanEntry {
    pub filename: String,
    pub name: String,
    pub title: String,
    pub modified_at: String,
    pub size_bytes: u64,
}

/// Collect `<root>/plans/*.md` across every root, newest first.
///
/// A filename seen in an earlier root wins, so the plan list matches what
/// `read_plan` will open.
pub fn collect_plans(roots: &[ClaudeRoot]) -> Vec<PlanEntry> {
    let mut entries: Vec<PlanEntry> = Vec::new();

    for root in roots {
        let plans_dir = root.path.join("plans");
        let dir_entries = match std::fs::read_dir(&plans_dir) {
            Ok(e) => e,
            Err(_) => continue,
        };

        for entry in dir_entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) != Some("md") {
                continue;
            }

            let filename = entry.file_name().to_string_lossy().to_string();
            if entries.iter().any(|e| e.filename == filename) {
                continue;
            }
            let name = filename.trim_end_matches(".md").to_string();

            let metadata = match entry.metadata() {
                Ok(m) => m,
                Err(_) => continue,
            };

            entries.push(PlanEntry {
                filename,
                title: plan_title(&path).unwrap_or_else(|| name.clone()),
                name,
                modified_at: modified_rfc3339(&metadata),
                size_bytes: metadata.len(),
            });
        }
    }

    // Sort by modified time, newest first
    entries.sort_by(|a, b| b.modified_at.cmp(&a.modified_at));

    entries
}

/// Extract the title from the first "# " heading in the file.
fn plan_title(path: &Path) -> Option<String> {
    std::fs::read_to_string(path).ok().and_then(|content| {
        content
            .lines()
            .find(|line| line.starts_with("# "))
            .map(|line| line.trim_start_matches("# ").trim().to_string())
    })
}

fn modified_rfc3339(metadata: &std::fs::Metadata) -> String {
    metadata
        .modified()
        .ok()
        .and_then(|t| {
            let duration = t.duration_since(std::time::UNIX_EPOCH).ok()?;
            let dt = chrono::DateTime::from_timestamp(
                duration.as_secs() as i64,
                duration.subsec_nanos(),
            )?;
            Some(dt.to_rfc3339())
        })
        .unwrap_or_default()
}

/// Locate a plan by filename in the first root that holds it.
pub fn find_plan_file(roots: &[ClaudeRoot], filename: &str) -> Option<PathBuf> {
    roots
        .iter()
        .map(|root| root.path.join("plans").join(filename))
        .find(|path| path.exists())
}

/// Reject anything that could escape the plans directory.
fn validate_filename(filename: &str) -> Result<(), AppError> {
    if filename.contains('/') || filename.contains('\\') || filename.contains("..") {
        return Err(AppError::Internal("Invalid filename".into()));
    }
    Ok(())
}

fn resolve_plan(state: &State<'_, AppState>, filename: &str) -> Result<PathBuf, AppError> {
    validate_filename(filename)?;

    let roots = crate::claude_roots::roots(state.database());
    find_plan_file(&roots, filename)
        .ok_or_else(|| AppError::Internal(format!("Plan not found: {}", filename)))
}

#[tauri::command]
pub async fn list_plans(state: State<'_, AppState>) -> Result<Vec<PlanEntry>, AppError> {
    let roots = crate::claude_roots::roots(state.database());
    Ok(collect_plans(&roots))
}

#[tauri::command]
pub async fn reveal_plan_in_finder(
    state: State<'_, AppState>,
    filename: String,
) -> Result<(), AppError> {
    let path = resolve_plan(&state, &filename)?;
    crate::commands::system::reveal_in_file_manager(&path)
}

#[tauri::command]
pub async fn read_plan(
    state: State<'_, AppState>,
    filename: String,
) -> Result<String, AppError> {
    let path = resolve_plan(&state, &filename)?;
    Ok(std::fs::read_to_string(&path)?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::claude_roots::RootKind;

    fn write(path: &Path, content: &str) {
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, content).unwrap();
    }

    fn root(path: PathBuf) -> ClaudeRoot {
        ClaudeRoot {
            path,
            label: "test".to_string(),
            kind: RootKind::Wsl,
        }
    }

    #[test]
    fn lists_plans_from_every_root() {
        let tmp = tempfile::tempdir().unwrap();
        let native = tmp.path().join("windows/.claude");
        let wsl = tmp.path().join("wsl/.claude");
        write(&native.join("plans/native-plan.md"), "# Native plan\n");
        write(&wsl.join("plans/wsl-plan.md"), "# WSL plan\n");

        let plans = collect_plans(&[root(native), root(wsl)]);

        let mut titles: Vec<String> = plans.iter().map(|p| p.title.clone()).collect();
        titles.sort();
        assert_eq!(titles, vec!["Native plan", "WSL plan"]);
    }

    #[test]
    fn falls_back_to_filename_when_plan_has_no_heading() {
        let tmp = tempfile::tempdir().unwrap();
        let native = tmp.path().join("windows/.claude");
        write(&native.join("plans/untitled.md"), "no heading here\n");

        let plans = collect_plans(&[root(native)]);

        assert_eq!(plans[0].title, "untitled");
    }

    #[test]
    fn same_plan_filename_in_two_roots_is_listed_once() {
        let tmp = tempfile::tempdir().unwrap();
        let first = tmp.path().join("windows/.claude");
        let second = tmp.path().join("wsl/.claude");
        write(&first.join("plans/dup.md"), "# First\n");
        write(&second.join("plans/dup.md"), "# Second\n");

        let plans = collect_plans(&[root(first), root(second)]);

        assert_eq!(plans.len(), 1);
        assert_eq!(plans[0].title, "First");
    }

    #[test]
    fn ignores_roots_without_a_plans_directory() {
        let tmp = tempfile::tempdir().unwrap();
        let with_plans = tmp.path().join("wsl/.claude");
        write(&with_plans.join("plans/only.md"), "# Only\n");

        let plans = collect_plans(&[root(tmp.path().join("windows/.claude")), root(with_plans)]);

        assert_eq!(plans.len(), 1);
    }

    #[test]
    fn finds_plan_file_in_a_later_root() {
        let tmp = tempfile::tempdir().unwrap();
        let native = tmp.path().join("windows/.claude");
        let wsl = tmp.path().join("wsl/.claude");
        write(&native.join("plans/other.md"), "# Other\n");
        write(&wsl.join("plans/wanted.md"), "# Wanted\n");

        let found = find_plan_file(&[root(native), root(wsl.clone())], "wanted.md");

        assert_eq!(found, Some(wsl.join("plans/wanted.md")));
    }

    #[test]
    fn rejects_filenames_that_escape_the_plans_directory() {
        assert!(validate_filename("../../.ssh/id_rsa").is_err());
        assert!(validate_filename("plan.md").is_ok());
    }
}
