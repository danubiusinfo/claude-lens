use serde::{Deserialize, Serialize};
use tauri::State;

use crate::claude_roots::ClaudeRoot;
use crate::error::AppError;
use crate::state::AppState;

#[derive(Debug, Default, PartialEq, Eq, Serialize)]
pub struct UserProfile {
    pub display_name: Option<String>,
    pub email: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ClaudeConfig {
    #[serde(rename = "oauthAccount")]
    oauth_account: Option<OAuthAccount>,
}

#[derive(Debug, Deserialize)]
struct OAuthAccount {
    #[serde(rename = "displayName")]
    display_name: Option<String>,
    #[serde(rename = "emailAddress")]
    email_address: Option<String>,
}

/// Read the signed-in account from the first root that has a usable
/// `.claude.json` next to it.
///
/// Claude Code stores it in the home directory, i.e. as a sibling of `.claude`
/// — for a WSL root that is inside the distro, not on the Windows profile.
pub fn read_profile(roots: &[ClaudeRoot]) -> UserProfile {
    roots
        .iter()
        .filter_map(|root| root.path.parent().map(|home| home.join(".claude.json")))
        .filter_map(|config_path| std::fs::read_to_string(&config_path).ok())
        .filter_map(|content| serde_json::from_str::<ClaudeConfig>(&content).ok())
        .find_map(|config| config.oauth_account)
        .map(|account| UserProfile {
            display_name: account.display_name,
            email: account.email_address,
        })
        .unwrap_or_default()
}

#[tauri::command]
pub async fn get_user_profile(state: State<'_, AppState>) -> Result<UserProfile, AppError> {
    let roots = crate::claude_roots::roots(state.database());
    Ok(read_profile(&roots))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::claude_roots::RootKind;
    use std::path::Path;

    fn write(path: &Path, content: &str) {
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, content).unwrap();
    }

    /// Builds a home directory with a `.claude` root inside it.
    fn home_root(home: &Path) -> ClaudeRoot {
        std::fs::create_dir_all(home.join(".claude")).unwrap();
        ClaudeRoot {
            path: home.join(".claude"),
            label: "test".to_string(),
            kind: RootKind::Wsl,
        }
    }

    const CONFIG: &str = r#"{"oauthAccount":{"displayName":"Bence","emailAddress":"b@example.com"}}"#;

    #[test]
    fn reads_the_account_next_to_the_root() {
        let tmp = tempfile::tempdir().unwrap();
        let home = tmp.path().join("home/beno");
        let root = home_root(&home);
        write(&home.join(".claude.json"), CONFIG);

        let profile = read_profile(&[root]);

        assert_eq!(profile.display_name.as_deref(), Some("Bence"));
        assert_eq!(profile.email.as_deref(), Some("b@example.com"));
    }

    #[test]
    fn falls_back_to_a_later_root() {
        let tmp = tempfile::tempdir().unwrap();
        let windows_home = tmp.path().join("Users/beno");
        let wsl_home = tmp.path().join("wsl/home/beno");
        let windows_root = home_root(&windows_home);
        let wsl_root = home_root(&wsl_home);
        write(&wsl_home.join(".claude.json"), CONFIG);

        let profile = read_profile(&[windows_root, wsl_root]);

        assert_eq!(profile.display_name.as_deref(), Some("Bence"));
    }

    #[test]
    fn empty_profile_when_no_root_has_a_config() {
        let tmp = tempfile::tempdir().unwrap();
        let root = home_root(&tmp.path().join("home/beno"));

        assert_eq!(read_profile(&[root]), UserProfile::default());
    }

    #[test]
    fn malformed_config_yields_an_empty_profile() {
        let tmp = tempfile::tempdir().unwrap();
        let home = tmp.path().join("home/beno");
        let root = home_root(&home);
        write(&home.join(".claude.json"), "{ not json");

        assert_eq!(read_profile(&[root]), UserProfile::default());
    }

    #[test]
    fn config_without_an_oauth_account_yields_an_empty_profile() {
        let tmp = tempfile::tempdir().unwrap();
        let home = tmp.path().join("home/beno");
        let root = home_root(&home);
        write(&home.join(".claude.json"), r#"{"numStartups":3}"#);

        assert_eq!(read_profile(&[root]), UserProfile::default());
    }
}
