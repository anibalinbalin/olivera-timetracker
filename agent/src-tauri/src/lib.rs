mod buffer;
mod capture;
mod config;
mod uploader;

use buffer::OfflineBuffer;
use config::AppConfig;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::TrayIconBuilder,
};

static PAUSED: AtomicBool = AtomicBool::new(false);
static BACKEND_CHILD: Mutex<Option<std::process::Child>> = Mutex::new(None);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let config = AppConfig::load();
    println!("TimeTracker agent starting...");
    println!("Server: {}", config.server_url);
    println!("Interval: {}s", config.capture_interval_secs);

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(move |app| {
            // Check for updates on startup (silent, non-blocking)
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let updater = match tauri_plugin_updater::UpdaterExt::updater(&handle) {
                    Ok(u) => u,
                    Err(e) => { println!("Updater init failed: {}", e); return; }
                };
                match updater.check().await {
                    Ok(Some(update)) => {
                        println!("Update available: v{}", update.version);
                        if let Err(e) = update.download_and_install(|_, _| {}, || {}).await {
                            println!("Update install failed: {}", e);
                        } else {
                            println!("Update installed, relaunching...");
                            // Relaunch by spawning ourselves then exiting
                            let current_exe = std::env::current_exe().unwrap();
                            let _ = std::process::Command::new(current_exe).spawn();
                            std::process::exit(0);
                        }
                    }
                    Ok(None) => println!("App is up to date"),
                    Err(e) => println!("Update check failed: {}", e),
                }
            });
            let config = AppConfig::load();
            let dashboard_url = config.dashboard_url.clone();

            // Start backend server automatically
            start_backend();

            // Build tray menu
            let pause_item = MenuItemBuilder::with_id("pause", "Pause Capture").build(app)?;
            let dashboard_item = MenuItemBuilder::with_id("dashboard", "Open Dashboard").build(app)?;
            let backend_item = MenuItemBuilder::with_id("restart_backend", "Restart Server").build(app)?;
            let quit_item = MenuItemBuilder::with_id("quit", "Quit").build(app)?;

            let menu = MenuBuilder::new(app)
                .item(&pause_item)
                .separator()
                .item(&dashboard_item)
                .item(&backend_item)
                .separator()
                .item(&quit_item)
                .build()?;

            let dashboard_url_clone = dashboard_url.clone();

            let _tray = TrayIconBuilder::new()
                .tooltip("Olivera TimeTracker — Capturing")
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
                        "restart_backend" => {
                            println!("Restarting backend server...");
                            stop_backend();
                            start_backend();
                        }
                        "quit" => {
                            stop_backend();
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

fn full_hash(data: &[u8]) -> u64 {
    let mut h: u64 = 0xcbf29ce484222325;
    for &b in data.iter() {
        h ^= b as u64;
        h = h.wrapping_mul(0x100000001b3);
    }
    h
}

fn simple_hash(data: &[u8]) -> u64 {
    // Fast non-crypto hash — just need to detect identical images
    let mut h: u64 = 0xcbf29ce484222325;
    for &b in data.iter().step_by(64) {
        // Sample every 64th byte for speed
        h = h.wrapping_mul(0x100000001b3);
        h ^= b as u64;
    }
    h
}

fn capture_loop(config: AppConfig) {
    let buffer = OfflineBuffer::new().expect("Failed to initialize offline buffer");
    let uploader_config = uploader::UploaderConfig {
        server_url: config.server_url.clone(),
        api_key: config.api_key.clone(),
        user_id: config.user_id,
    };

    let interval = std::time::Duration::from_secs(config.capture_interval_secs);
    let mut last_hash: u64 = 0;
    let mut skip_count: u32 = 0;

    loop {
        std::thread::sleep(interval);

        if PAUSED.load(Ordering::Relaxed) {
            continue;
        }

        flush_buffer(&buffer, &uploader_config);

        match capture::capture() {
            Some(result) => {
                // Skip if screenshot is identical to previous
                let hash = simple_hash(&result.image_data);
                if hash == last_hash {
                    skip_count += 1;
                    if skip_count % 5 == 1 {
                        println!("  → Skipped (same screen, {} consecutive)", skip_count);
                    }
                    continue;
                }
                last_hash = hash;
                if skip_count > 0 {
                    println!("  → Resumed after {} identical captures", skip_count);
                    skip_count = 0;
                }

                println!(
                    "Captured: {} - {}",
                    result.app_name,
                    &result.window_title[..result.window_title.len().min(50)]
                );
                let image_hash = format!("{:x}", full_hash(&result.image_data));
                match uploader::upload_capture(&uploader_config, &result, &image_hash) {
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

fn backend_dir() -> std::path::PathBuf {
    // Look for server.exe next to the agent, or in C:\olivera-timetracker
    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.to_path_buf()))
        .unwrap_or_default();
    let candidates = [
        exe_dir.join("server.exe"),
        std::path::PathBuf::from(r"C:\olivera-timetracker\server.exe"),
    ];
    for c in &candidates {
        if c.exists() {
            return c.parent().unwrap().to_path_buf();
        }
    }
    std::path::PathBuf::from(r"C:\olivera-timetracker")
}

fn start_backend() {
    let dir = backend_dir();
    let server_exe = dir.join("server.exe");
    let start_bat = dir.join("start.bat");

    if !server_exe.exists() {
        println!("Backend server.exe not found at {:?}", server_exe);
        return;
    }

    // Use start.bat if it exists (has env vars), otherwise run server.exe directly
    let child = if start_bat.exists() {
        std::process::Command::new("cmd")
            .args(["/C", start_bat.to_str().unwrap()])
            .current_dir(&dir)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .spawn()
    } else {
        std::process::Command::new(&server_exe)
            .current_dir(&dir)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .spawn()
    };

    match child {
        Ok(c) => {
            println!("Backend started (PID: {})", c.id());
            *BACKEND_CHILD.lock().unwrap() = Some(c);
        }
        Err(e) => println!("Failed to start backend: {}", e),
    }
}

fn stop_backend() {
    if let Some(mut child) = BACKEND_CHILD.lock().unwrap().take() {
        let _ = child.kill();
        let _ = child.wait();
        println!("Backend stopped");
    }
    // Also kill any orphaned server.exe
    #[cfg(target_os = "windows")]
    {
        let _ = std::process::Command::new("taskkill")
            .args(["/f", "/im", "server.exe"])
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status();
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
        let image_hash = format!("{:x}", full_hash(&result.image_data));
        match uploader::upload_capture(config, &result, &image_hash) {
            Ok(()) => {
                let _ = buffer.dequeue(id);
            }
            Err(_) => break,
        }
    }
}
