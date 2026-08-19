//! Resolution of the `.claude` directories this machine can read.
//!
//! On macOS and Linux there is exactly one: `~/.claude`. On Windows a user may
//! run Claude Code inside WSL, in which case the sessions live on the distro's
//! ext4 filesystem and are only reachable through the `\\wsl.localhost\<distro>`
//! share — so Windows can end up with several roots at once.

use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

use serde::Serialize;

use crate::db::Database;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum RootKind {
    /// `~/.claude` of the account running this app.
    Native,
    /// A `.claude` directory inside a WSL distribution.
    Wsl,
    /// A directory the user pointed us at by hand.
    Manual,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ClaudeRoot {
    pub path: PathBuf,
    pub label: String,
    pub kind: RootKind,
}

impl ClaudeRoot {
    /// WSL roots are reached over a 9p/UNC share, where `ReadDirectoryChangesW`
    /// does not reliably deliver events — those need a polling watcher.
    pub fn needs_polling(&self) -> bool {
        self.kind == RootKind::Wsl || is_unc_path(&self.path)
    }

    pub fn projects_dir(&self) -> PathBuf {
        self.path.join("projects")
    }
}

fn is_unc_path(path: &Path) -> bool {
    let s = path.to_string_lossy();
    s.starts_with("\\\\") || s.starts_with("//")
}

fn is_wsl_share_path(path: &Path) -> bool {
    let s = path.to_string_lossy().replace('/', "\\").to_lowercase();
    s.starts_with("\\\\wsl$\\") || s.starts_with("\\\\wsl.localhost\\")
}

/// Decode the output of `wsl.exe --list --quiet` into distribution names.
///
/// `wsl.exe` writes UTF-16LE with CRLF line endings. Docker Desktop's helper
/// distros are dropped: they hold no `.claude` directory and probing them over
/// the share would needlessly boot them.
#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
pub fn parse_wsl_distro_list(bytes: &[u8]) -> Vec<String> {
    let text = decode_wsl_output(bytes);

    text.lines()
        .map(|line| line.trim_matches(|c: char| c.is_whitespace() || c == '\u{0}' || c == '\u{feff}'))
        .filter(|line| !line.is_empty())
        .filter(|line| !line.to_lowercase().starts_with("docker-desktop"))
        .map(|line| line.to_string())
        .collect()
}

#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
fn decode_wsl_output(bytes: &[u8]) -> String {
    // UTF-16LE ASCII text is full of NUL bytes; anything without them is
    // already UTF-8 (some shells/wrappers re-encode the pipe).
    if !bytes.contains(&0) {
        return String::from_utf8_lossy(bytes).to_string();
    }

    let units: Vec<u16> = bytes
        .chunks_exact(2)
        .map(|c| u16::from_le_bytes([c[0], c[1]]))
        .collect();

    String::from_utf16_lossy(&units)
}

/// Collect the `.claude` directories of a mounted WSL distribution.
///
/// `fs_root` is the distro's filesystem root — `\\wsl.localhost\<distro>` in
/// production, a temp directory in tests.
#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
pub fn wsl_roots_under(distro: &str, fs_root: &Path) -> Vec<ClaudeRoot> {
    let mut homes: Vec<PathBuf> = Vec::new();

    if let Ok(entries) = std::fs::read_dir(fs_root.join("home")) {
        let mut users: Vec<PathBuf> = entries
            .flatten()
            .map(|e| e.path())
            .filter(|p| p.is_dir())
            .collect();
        users.sort();
        homes.extend(users);
    }

    homes.push(fs_root.join("root"));

    homes
        .into_iter()
        .filter_map(|home| {
            let claude_dir = home.join(".claude");
            if !holds_claude_data(&claude_dir) {
                return None;
            }
            let user = home
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| "?".to_string());
            Some(ClaudeRoot {
                path: claude_dir,
                label: format!("WSL: {}/{}", distro, user),
                kind: RootKind::Wsl,
            })
        })
        .collect()
}

/// A directory only counts as a root if Claude Code actually wrote there.
#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
fn holds_claude_data(claude_dir: &Path) -> bool {
    claude_dir.join("projects").is_dir() || claude_dir.join("history.jsonl").is_file()
}

/// Combine the manual override, the native home and any WSL roots into the
/// final, de-duplicated root list.
///
/// A manual override replaces everything else — it is the escape hatch for
/// layouts we fail to detect, so it must not be diluted by guesses.
pub fn build_roots(
    override_dir: Option<&str>,
    native_home: Option<&Path>,
    wsl_roots: Vec<ClaudeRoot>,
) -> Vec<ClaudeRoot> {
    if let Some(dir) = override_dir.map(str::trim).filter(|d| !d.is_empty()) {
        let path = PathBuf::from(dir);
        let kind = if is_wsl_share_path(&path) {
            RootKind::Wsl
        } else {
            RootKind::Manual
        };
        return vec![ClaudeRoot {
            path,
            label: "Custom folder".to_string(),
            kind,
        }];
    }

    let mut roots: Vec<ClaudeRoot> = Vec::new();

    if let Some(home) = native_home {
        let claude_dir = home.join(".claude");
        if claude_dir.is_dir() {
            roots.push(ClaudeRoot {
                path: claude_dir,
                label: native_label().to_string(),
                kind: RootKind::Native,
            });
        }
    }

    for root in wsl_roots {
        if !roots.iter().any(|r| same_path(&r.path, &root.path)) {
            roots.push(root);
        }
    }

    roots
}

fn native_label() -> &'static str {
    if cfg!(target_os = "windows") {
        "Windows"
    } else {
        "This Mac"
    }
}

fn same_path(a: &Path, b: &Path) -> bool {
    if cfg!(target_os = "windows") {
        a.to_string_lossy().to_lowercase().replace('/', "\\")
            == b.to_string_lossy().to_lowercase().replace('/', "\\")
    } else {
        a == b
    }
}

/// Setting key holding a user-picked `.claude` directory.
pub const OVERRIDE_SETTING: &str = "jsonl_directory_override";
/// Setting key for the Windows WSL scan; anything but "0" means enabled.
pub const WSL_SCAN_SETTING: &str = "wsl_scan_enabled";

static CACHE: OnceLock<Mutex<Option<Vec<ClaudeRoot>>>> = OnceLock::new();

fn cache() -> &'static Mutex<Option<Vec<ClaudeRoot>>> {
    CACHE.get_or_init(|| Mutex::new(None))
}

/// The roots to read, resolved from settings and cached.
///
/// Caching matters on Windows: resolving spawns `wsl.exe` and touches the
/// distro share, which is far too slow to redo on every import tick.
pub fn roots(db: &Database) -> Vec<ClaudeRoot> {
    let mut guard = cache().lock().unwrap_or_else(|e| e.into_inner());
    if let Some(cached) = guard.as_ref() {
        return cached.clone();
    }

    let override_dir = db.get_app_setting(OVERRIDE_SETTING).ok().flatten();
    let scan_wsl = db
        .get_app_setting(WSL_SCAN_SETTING)
        .ok()
        .flatten()
        .map_or(true, |v| v != "0");

    let resolved = resolve_roots(override_dir.as_deref(), scan_wsl);
    for root in &resolved {
        tracing::info!("Claude root: {} ({})", root.path.display(), root.label);
    }
    *guard = Some(resolved.clone());
    resolved
}

/// Drop the cached roots so the next `roots()` call re-detects them.
pub fn invalidate_cache() {
    *cache().lock().unwrap_or_else(|e| e.into_inner()) = None;
}

/// Resolve every `.claude` root to read on this machine.
pub fn resolve_roots(override_dir: Option<&str>, scan_wsl: bool) -> Vec<ClaudeRoot> {
    let wsl_roots = if scan_wsl { discover_wsl_roots() } else { Vec::new() };
    build_roots(override_dir, dirs::home_dir().as_deref(), wsl_roots)
}

/// Enumerate the WSL distributions of this machine and the `.claude`
/// directories inside them. Always empty off Windows.
#[cfg(not(target_os = "windows"))]
pub fn discover_wsl_roots() -> Vec<ClaudeRoot> {
    Vec::new()
}

#[cfg(target_os = "windows")]
pub fn discover_wsl_roots() -> Vec<ClaudeRoot> {
    let distros = list_wsl_distros();
    if distros.is_empty() {
        return Vec::new();
    }

    let mut roots = Vec::new();
    for distro in distros {
        match wsl_fs_root(&distro) {
            Some(fs_root) => roots.extend(wsl_roots_under(&distro, &fs_root)),
            None => tracing::debug!("WSL distro {} is not reachable over the share", distro),
        }
    }

    tracing::info!("Discovered {} WSL .claude root(s)", roots.len());
    roots
}

/// `\\wsl.localhost\<distro>` is the modern share name; older Windows 10 builds
/// only expose `\\wsl$\<distro>`.
#[cfg(target_os = "windows")]
fn wsl_fs_root(distro: &str) -> Option<PathBuf> {
    ["\\\\wsl.localhost\\", "\\\\wsl$\\"]
        .iter()
        .map(|prefix| PathBuf::from(format!("{}{}", prefix, distro)))
        .find(|root| root.join("home").is_dir() || root.join("root").is_dir())
}

#[cfg(target_os = "windows")]
fn list_wsl_distros() -> Vec<String> {
    use std::os::windows::process::CommandExt;

    /// Keeps `wsl.exe` from flashing a console window over the app.
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;

    let output = std::process::Command::new("wsl.exe")
        .args(["--list", "--quiet"])
        .creation_flags(CREATE_NO_WINDOW)
        .output();

    match output {
        Ok(out) if out.status.success() => parse_wsl_distro_list(&out.stdout),
        Ok(out) => {
            tracing::debug!("wsl.exe --list exited with {:?}", out.status.code());
            Vec::new()
        }
        Err(e) => {
            tracing::debug!("wsl.exe not available: {}", e);
            Vec::new()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn utf16le(text: &str) -> Vec<u8> {
        text.encode_utf16().flat_map(|u| u.to_le_bytes()).collect()
    }

    fn touch(path: &Path) {
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, b"").unwrap();
    }

    #[test]
    fn parses_utf16le_distro_names() {
        let bytes = utf16le("Ubuntu\r\nDebian\r\n");
        assert_eq!(parse_wsl_distro_list(&bytes), vec!["Ubuntu", "Debian"]);
    }

    #[test]
    fn skips_docker_desktop_distros() {
        let bytes = utf16le("Ubuntu\r\ndocker-desktop\r\ndocker-desktop-data\r\n");
        assert_eq!(parse_wsl_distro_list(&bytes), vec!["Ubuntu"]);
    }

    #[test]
    fn tolerates_bom_and_blank_lines() {
        let bytes = utf16le("\u{feff}Ubuntu-24.04\r\n\r\n");
        assert_eq!(parse_wsl_distro_list(&bytes), vec!["Ubuntu-24.04"]);
    }

    #[test]
    fn parses_utf8_distro_names() {
        assert_eq!(parse_wsl_distro_list(b"Ubuntu\n"), vec!["Ubuntu"]);
    }

    #[test]
    fn finds_claude_dirs_of_wsl_users() {
        let tmp = tempfile::tempdir().unwrap();
        let fs_root = tmp.path();
        std::fs::create_dir_all(fs_root.join("home/beno/.claude/projects")).unwrap();
        std::fs::create_dir_all(fs_root.join("home/nobody")).unwrap();
        touch(&fs_root.join("root/.claude/history.jsonl"));

        let roots = wsl_roots_under("Ubuntu", fs_root);

        assert_eq!(
            roots
                .iter()
                .map(|r| r.label.clone())
                .collect::<Vec<_>>(),
            vec!["WSL: Ubuntu/beno", "WSL: Ubuntu/root"]
        );
        assert_eq!(roots[0].path, fs_root.join("home/beno/.claude"));
        assert!(roots.iter().all(|r| r.kind == RootKind::Wsl));
    }

    #[test]
    fn ignores_wsl_users_without_claude_data() {
        let tmp = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(tmp.path().join("home/nobody/.claude")).unwrap();

        assert!(wsl_roots_under("Ubuntu", tmp.path()).is_empty());
    }

    #[test]
    fn keeps_native_and_wsl_roots_together() {
        let tmp = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(tmp.path().join(".claude/projects")).unwrap();
        let wsl = ClaudeRoot {
            path: PathBuf::from("/mnt/fake/home/beno/.claude"),
            label: "WSL: Ubuntu/beno".to_string(),
            kind: RootKind::Wsl,
        };

        let roots = build_roots(None, Some(tmp.path()), vec![wsl.clone()]);

        assert_eq!(roots.len(), 2);
        assert_eq!(roots[0].kind, RootKind::Native);
        assert_eq!(roots[1], wsl);
    }

    #[test]
    fn skips_native_root_when_absent() {
        let tmp = tempfile::tempdir().unwrap();

        assert!(build_roots(None, Some(tmp.path()), Vec::new()).is_empty());
    }

    #[test]
    fn override_replaces_detected_roots() {
        let tmp = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(tmp.path().join(".claude/projects")).unwrap();
        let wsl = ClaudeRoot {
            path: PathBuf::from("/mnt/fake/home/beno/.claude"),
            label: "WSL: Ubuntu/beno".to_string(),
            kind: RootKind::Wsl,
        };

        let roots = build_roots(Some("D:\\claude-backup"), Some(tmp.path()), vec![wsl]);

        assert_eq!(roots.len(), 1);
        assert_eq!(roots[0].path, PathBuf::from("D:\\claude-backup"));
        assert_eq!(roots[0].kind, RootKind::Manual);
    }

    #[test]
    fn blank_override_is_ignored() {
        let tmp = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(tmp.path().join(".claude/projects")).unwrap();

        let roots = build_roots(Some("   "), Some(tmp.path()), Vec::new());

        assert_eq!(roots.len(), 1);
        assert_eq!(roots[0].kind, RootKind::Native);
    }

    #[test]
    fn override_pointing_at_the_wsl_share_counts_as_wsl() {
        let roots = build_roots(
            Some("\\\\wsl.localhost\\Ubuntu\\home\\beno\\.claude"),
            None,
            Vec::new(),
        );

        assert_eq!(roots[0].kind, RootKind::Wsl);
        assert!(roots[0].needs_polling());
    }

    #[test]
    fn duplicate_wsl_root_is_dropped() {
        let tmp = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(tmp.path().join(".claude/projects")).unwrap();
        let duplicate = ClaudeRoot {
            path: tmp.path().join(".claude"),
            label: "WSL: Ubuntu/beno".to_string(),
            kind: RootKind::Wsl,
        };

        let roots = build_roots(None, Some(tmp.path()), vec![duplicate]);

        assert_eq!(roots.len(), 1);
        assert_eq!(roots[0].kind, RootKind::Native);
    }

    #[test]
    fn native_root_does_not_need_polling() {
        let root = ClaudeRoot {
            path: PathBuf::from("/Users/beno/.claude"),
            label: "This Mac".to_string(),
            kind: RootKind::Native,
        };

        assert!(!root.needs_polling());
    }
}
