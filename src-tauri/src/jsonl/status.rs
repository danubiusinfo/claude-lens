use std::sync::{Arc, Mutex};

use serde::Serialize;

#[derive(Debug)]
struct JsonlStatusInner {
    is_importing: bool,
    last_import_at: Option<String>,
    files_discovered: u64,
    total_records: u64,
    total_sessions: u64,
    error: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
pub struct JsonlStatusInfo {
    pub is_importing: bool,
    pub last_import_at: Option<String>,
    pub files_discovered: u64,
    pub total_records: u64,
    pub total_sessions: u64,
    pub error: Option<String>,
}

#[derive(Clone, Debug)]
pub struct JsonlImportStatus {
    inner: Arc<Mutex<JsonlStatusInner>>,
}

impl JsonlImportStatus {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new(JsonlStatusInner {
                is_importing: false,
                last_import_at: None,
                files_discovered: 0,
                total_records: 0,
                total_sessions: 0,
                error: None,
            })),
        }
    }

    pub fn get(&self) -> JsonlStatusInfo {
        let inner = self.inner.lock().unwrap();
        JsonlStatusInfo {
            is_importing: inner.is_importing,
            last_import_at: inner.last_import_at.clone(),
            files_discovered: inner.files_discovered,
            total_records: inner.total_records,
            total_sessions: inner.total_sessions,
            error: inner.error.clone(),
        }
    }

    pub fn set_importing(&self, importing: bool) {
        let mut inner = self.inner.lock().unwrap();
        inner.is_importing = importing;
    }

    pub fn update_completed(
        &self,
        files: u64,
        records: u64,
        sessions: u64,
    ) {
        let mut inner = self.inner.lock().unwrap();
        inner.is_importing = false;
        inner.last_import_at = Some(chrono::Utc::now().to_rfc3339());
        inner.files_discovered = files;
        inner.total_records = records;
        inner.total_sessions = sessions;
        inner.error = None;
    }

    pub fn update_error(&self, msg: String) {
        let mut inner = self.inner.lock().unwrap();
        inner.is_importing = false;
        inner.error = Some(msg);
    }
}
