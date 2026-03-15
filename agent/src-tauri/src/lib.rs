mod buffer;
mod capture;
mod config;
mod uploader;

use buffer::OfflineBuffer;
use config::AppConfig;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::TrayIconBuilder,
};

static PAUSED: AtomicBool = AtomicBool::new(false);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let config = AppConfig::load();
    println!("TimeTracker agent starting...");
    println!("Server: {}", config.server_url);
    println!("Interval: {}s", config.capture_interval_secs);

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(move |app| {
            let config = AppConfig::load();
            let dashboard_url = config.dashboard_url.clone();

            // Build tray menu
            let pause_item = MenuItemBuilder::with_id("pause", "Pausar captura").build(app)?;
            let dashboard_item = MenuItemBuilder::with_id("dashboard", "Abrir Dashboard").build(app)?;
            let quit_item = MenuItemBuilder::with_id("quit", "Salir").build(app)?;

            let menu = MenuBuilder::new(app)
                .item(&pause_item)
                .separator()
                .item(&dashboard_item)
                .separator()
                .item(&quit_item)
                .build()?;

            let dashboard_url_clone = dashboard_url.clone();

            let _tray = TrayIconBuilder::new()
                .tooltip("Olivera TimeTracker — Capturando")
                .menu(&menu)
                .on_menu_event(move |_app, event| {
                    match event.id().as_ref() {
                        "pause" => {
                            let was_paused = PAUSED.load(Ordering::Relaxed);
                            PAUSED.store(!was_paused, Ordering::Relaxed);
                            println!(
                                "Capture {}",
                                if was_paused { "resumed" } else { "paused" }
                            );
                        }
                        "dashboard" => {
                            let _ = open::that(&dashboard_url_clone);
                        }
                        "quit" => {
                            std::process::exit(0);
                        }
                        _ => {}
                    }
                })
                .icon(app.default_window_icon().unwrap().clone())
                .icon_as_template(true)
                .build(app)?;

            // Start capture loop in background thread
            let config_clone = config.clone();
            std::thread::spawn(move || {
                capture_loop(config_clone);
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error running TimeTracker agent");
}

fn capture_loop(config: AppConfig) {
    let buffer = OfflineBuffer::new().expect("Failed to initialize offline buffer");
    let uploader_config = uploader::UploaderConfig {
        server_url: config.server_url.clone(),
        api_key: config.api_key.clone(),
        user_id: config.user_id,
    };

    let interval = std::time::Duration::from_secs(config.capture_interval_secs);

    loop {
        std::thread::sleep(interval);

        if PAUSED.load(Ordering::Relaxed) {
            continue;
        }

        flush_buffer(&buffer, &uploader_config);

        match capture::capture() {
            Some(result) => {
                println!(
                    "Captured: {} - {}",
                    result.app_name,
                    &result.window_title[..result.window_title.len().min(50)]
                );
                match uploader::upload_capture(&uploader_config, &result) {
                    Ok(()) => println!("  → Uploaded"),
                    Err(e) => {
                        println!("  → Upload failed ({}), buffering", e);
                        let _ = buffer.enqueue(
                            &result.image_data,
                            &result.app_name,
                            &result.window_title,
                            &result.timestamp,
                        );
                    }
                }
            }
            None => {
                println!("Capture failed");
            }
        }
    }
}

fn flush_buffer(buffer: &OfflineBuffer, config: &uploader::UploaderConfig) {
    let pending = buffer.count();
    if pending == 0 {
        return;
    }
    println!("Flushing {} buffered captures...", pending);
    while let Some((id, image_data, app_name, window_title, timestamp)) = buffer.peek() {
        let result = capture::CaptureResult {
            image_data,
            app_name,
            window_title,
            timestamp,
        };
        match uploader::upload_capture(config, &result) {
            Ok(()) => {
                let _ = buffer.dequeue(id);
            }
            Err(_) => break,
        }
    }
}
