use std::path::{Path, PathBuf};

use crate::claude_roots::ClaudeRoot;

use super::types::DiscoveredFile;

/// Discover all Claude Code JSONL files reachable through the given roots.
pub fn discover_jsonl_paths(roots: &[ClaudeRoot]) -> Vec<DiscoveredFile> {
    let mut files = Vec::new();

    for root in roots {
        collect_from_root(&root.path, &mut files);
    }

    tracing::info!(
        "Discovered {} JSONL files across {} root(s)",
        files.len(),
        roots.len()
    );
    files
}

fn collect_from_root(claude_dir: &Path, files: &mut Vec<DiscoveredFile>) {
    if !claude_dir.exists() {
        tracing::info!("Claude directory not found: {:?}", claude_dir);
        return;
    }

    // Check <root>/history.jsonl
    let history_file = claude_dir.join("history.jsonl");
    if history_file.exists() {
        if let Some(df) = file_to_discovered(&history_file, "history") {
            files.push(df);
        }
    }

    // Check <root>/projects/*/*.jsonl
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
}

/// Locate `<session_id>.jsonl` in the project directories of any root.
pub fn find_session_file(roots: &[ClaudeRoot], source_session_id: &str) -> Option<PathBuf> {
    let target_filename = format!("{}.jsonl", source_session_id);

    for root in roots {
        let projects_dir = root.projects_dir();
        if !projects_dir.exists() {
            continue;
        }
        if let Ok(entries) = std::fs::read_dir(&projects_dir) {
            for entry in entries.flatten() {
                let candidate = entry.path().join(&target_filename);
                if candidate.exists() {
                    return Some(candidate);
                }
            }
        }
    }

    None
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::claude_roots::RootKind;

    fn write(path: &Path) {
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, b"{}\n").unwrap();
    }

    fn root(path: PathBuf, kind: RootKind) -> ClaudeRoot {
        ClaudeRoot {
            path,
            label: "test".to_string(),
            kind,
        }
    }

    #[test]
    fn discovers_jsonl_files_from_every_root() {
        let tmp = tempfile::tempdir().unwrap();
        let native = tmp.path().join("windows/.claude");
        let wsl = tmp.path().join("wsl/.claude");
        write(&native.join("history.jsonl"));
        write(&native.join("projects/C--dev-foo/aaa.jsonl"));
        write(&wsl.join("projects/-home-beno-foo/bbb.jsonl"));

        let files = discover_jsonl_paths(&[
            root(native.clone(), RootKind::Native),
            root(wsl.clone(), RootKind::Wsl),
        ]);

        let paths: Vec<String> = files.iter().map(|f| f.path.clone()).collect();
        assert_eq!(paths.len(), 3, "got {:?}", paths);
        assert!(paths.contains(&wsl.join("projects/-home-beno-foo/bbb.jsonl").to_string_lossy().to_string()));
    }

    #[test]
    fn skips_roots_that_do_not_exist() {
        let tmp = tempfile::tempdir().unwrap();
        let present = tmp.path().join("present/.claude");
        write(&present.join("projects/proj/aaa.jsonl"));

        let files = discover_jsonl_paths(&[
            root(tmp.path().join("gone/.claude"), RootKind::Wsl),
            root(present, RootKind::Native),
        ]);

        assert_eq!(files.len(), 1);
    }

    #[test]
    fn finds_session_file_in_a_later_root() {
        let tmp = tempfile::tempdir().unwrap();
        let native = tmp.path().join("windows/.claude");
        let wsl = tmp.path().join("wsl/.claude");
        write(&native.join("projects/C--dev-foo/aaa.jsonl"));
        write(&wsl.join("projects/-home-beno-foo/bbb.jsonl"));

        let found = find_session_file(
            &[root(native, RootKind::Native), root(wsl.clone(), RootKind::Wsl)],
            "bbb",
        );

        assert_eq!(found, Some(wsl.join("projects/-home-beno-foo/bbb.jsonl")));
    }

    #[test]
    fn missing_session_file_returns_none() {
        let tmp = tempfile::tempdir().unwrap();
        let native = tmp.path().join("windows/.claude");
        write(&native.join("projects/C--dev-foo/aaa.jsonl"));

        assert_eq!(find_session_file(&[root(native, RootKind::Native)], "zzz"), None);
    }
}
