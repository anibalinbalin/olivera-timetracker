use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub server_url: String,
    pub api_key: String,
    pub user_id: u32,
    pub capture_interval_secs: u64,
    pub dashboard_url: String,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            server_url: "http://192.168.1.15:8080".to_string(),
            api_key: "test".to_string(),
            user_id: 1,
            capture_interval_secs: 60,
            dashboard_url: "http://192.168.1.15:8080".to_string(),
        }
    }
}

impl AppConfig {
    pub fn load() -> Self {
        let path = Self::config_path();
        if let Ok(contents) = fs::read_to_string(&path) {
            if let Ok(config) = serde_json::from_str(&contents) {
                return config;
            }
        }
        // Create default config on first run
        let config = Self::default();
        config.save();
        config
    }

    pub fn save(&self) {
        let path = Self::config_path();
        if let Some(parent) = path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        if let Ok(json) = serde_json::to_string_pretty(self) {
            let _ = fs::write(&path, json);
        }
    }

    fn config_path() -> PathBuf {
        dirs::config_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("olivera-timetracker")
            .join("config.json")
    }
}
