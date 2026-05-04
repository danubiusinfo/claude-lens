use serde::{Deserialize, Serialize};

use crate::error::AppError;

#[derive(Debug, Serialize)]
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

#[tauri::command]
pub async fn get_user_profile() -> Result<UserProfile, AppError> {
    let home = dirs::home_dir().ok_or_else(|| {
        AppError::Internal("Cannot resolve home directory".into())
    })?;
    let config_path = home.join(".claude.json");

    let content = match std::fs::read_to_string(&config_path) {
        Ok(c) => c,
        Err(_) => {
            return Ok(UserProfile {
                display_name: None,
                email: None,
            });
        }
    };

    let config: ClaudeConfig = match serde_json::from_str(&content) {
        Ok(c) => c,
        Err(_) => {
            return Ok(UserProfile {
                display_name: None,
                email: None,
            });
        }
    };

    match config.oauth_account {
        Some(account) => Ok(UserProfile {
            display_name: account.display_name,
            email: account.email_address,
        }),
        None => Ok(UserProfile {
            display_name: None,
            email: None,
        }),
    }
}
