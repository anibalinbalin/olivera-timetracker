use crate::capture::CaptureResult;
use reqwest::blocking::multipart;

pub struct UploaderConfig {
    pub server_url: String,
    pub api_key: String,
    pub user_id: u32,
}

pub fn upload_capture(config: &UploaderConfig, capture: &CaptureResult, image_hash: &str) -> Result<(), String> {
    let form = multipart::Form::new()
        .text("app_name", capture.app_name.clone())
        .text("window_title", capture.window_title.clone())
        .text("user_id", config.user_id.to_string())
        .text("timestamp", capture.timestamp.clone())
        .text("image_hash", image_hash.to_string())
        .part(
            "image",
            multipart::Part::bytes(capture.image_data.clone())
                .file_name("screenshot.jpg")
                .mime_str("image/jpeg")
                .map_err(|e| e.to_string())?,
        );

    let client = reqwest::blocking::Client::new();
    let response = client
        .post(format!("{}/api/captures", config.server_url))
        .header("X-API-Key", &config.api_key)
        .multipart(form)
        .timeout(std::time::Duration::from_secs(30))
        .send()
        .map_err(|e| e.to_string())?;

    if response.status().is_success() {
        Ok(())
    } else {
        Err(format!("Server returned {}", response.status()))
    }
}
