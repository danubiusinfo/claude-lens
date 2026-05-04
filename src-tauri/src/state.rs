use crate::db::Database;
use crate::jsonl::status::JsonlImportStatus;

#[derive(Clone)]
pub struct AppState {
    database: Database,
    jsonl_status: JsonlImportStatus,
}

impl AppState {
    pub fn new(
        database: Database,
        jsonl_status: JsonlImportStatus,
    ) -> Self {
        Self {
            database,
            jsonl_status,
        }
    }

    pub fn database(&self) -> &Database {
        &self.database
    }

    pub fn jsonl_status(&self) -> &JsonlImportStatus {
        &self.jsonl_status
    }
}
