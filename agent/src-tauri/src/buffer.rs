use rusqlite::{params, Connection};
use std::path::PathBuf;

pub struct OfflineBuffer {
    db: Connection,
}

impl OfflineBuffer {
    pub fn new() -> Result<Self, String> {
        let db_path = Self::db_path();
        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let db = Connection::open(&db_path).map_err(|e| e.to_string())?;
        db.execute_batch(
            "CREATE TABLE IF NOT EXISTS pending_captures (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                image_data BLOB NOT NULL,
                app_name TEXT NOT NULL,
                window_title TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );",
        )
        .map_err(|e| e.to_string())?;
        Ok(Self { db })
    }

    fn db_path() -> PathBuf {
        dirs::data_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("olivera-timetracker")
            .join("buffer.db")
    }

    pub fn enqueue(
        &self,
        image_data: &[u8],
        app_name: &str,
        window_title: &str,
        timestamp: &str,
    ) -> Result<(), String> {
        self.db
            .execute(
                "INSERT INTO pending_captures (image_data, app_name, window_title, timestamp) VALUES (?1, ?2, ?3, ?4)",
                params![image_data, app_name, window_title, timestamp],
            )
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn peek(&self) -> Option<(i64, Vec<u8>, String, String, String)> {
        self.db
            .query_row(
                "SELECT id, image_data, app_name, window_title, timestamp FROM pending_captures ORDER BY id LIMIT 1",
                [],
                |row| {
                    Ok((
                        row.get(0)?,
                        row.get(1)?,
                        row.get(2)?,
                        row.get(3)?,
                        row.get(4)?,
                    ))
                },
            )
            .ok()
    }

    pub fn dequeue(&self, id: i64) -> Result<(), String> {
        self.db
            .execute("DELETE FROM pending_captures WHERE id = ?1", params![id])
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn count(&self) -> usize {
        self.db
            .query_row("SELECT COUNT(*) FROM pending_captures", [], |row| row.get(0))
            .unwrap_or(0)
    }
}
