use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SourceFileRecord {
    pub id: Option<i64>,
    pub file_path: String,
    pub file_type: String,
    pub file_size: i64,
    pub last_modified_at: Option<String>,
    pub last_scanned_at: Option<String>,
    pub last_offset: i64,
    pub record_count: i64,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SourceRecordEntry {
    pub id: Option<i64>,
    pub source_file_id: i64,
    pub record_key: String,
    pub session_id: Option<String>,
    pub timestamp: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportRecord {
    pub id: Option<i64>,
    pub started_at: String,
    pub finished_at: Option<String>,
    pub status: String,
    pub files_scanned: i64,
    pub records_parsed: i64,
    pub records_imported: i64,
    pub records_skipped: i64,
    pub error_message: Option<String>,
}
