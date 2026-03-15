use chrono::Utc;
use image::ImageEncoder;
use image::codecs::jpeg::JpegEncoder;
use std::io::Cursor;

pub struct CaptureResult {
    pub image_data: Vec<u8>,
    pub app_name: String,
    pub window_title: String,
    pub timestamp: String,
}

fn encode_jpeg(rgb: &[u8], width: u32, height: u32) -> Option<Vec<u8>> {
    let mut jpeg_buf = Cursor::new(Vec::new());
    let encoder = JpegEncoder::new_with_quality(&mut jpeg_buf, 50);
    encoder
        .write_image(rgb, width, height, image::ExtendedColorType::Rgb8)
        .ok()?;
    Some(jpeg_buf.into_inner())
}

#[cfg(target_os = "macos")]
pub fn capture() -> Option<CaptureResult> {
    use core_graphics::display::*;

    let (app_name, window_title) = get_active_window_macos();

    let display = CGDisplay::main();
    let cg_image = display.image()?;

    let width = cg_image.width();
    let height = cg_image.height();
    let bytes_per_row = cg_image.bytes_per_row();
    let data = cg_image.data();
    let raw_bytes = data.bytes();

    let mut rgb = Vec::with_capacity(width * height * 3);
    for y in 0..height {
        for x in 0..width {
            let offset = y * bytes_per_row + x * 4;
            if offset + 2 < raw_bytes.len() {
                rgb.push(raw_bytes[offset + 2]);
                rgb.push(raw_bytes[offset + 1]);
                rgb.push(raw_bytes[offset]);
            }
        }
    }

    let image_data = encode_jpeg(&rgb, width as u32, height as u32)?;

    Some(CaptureResult {
        image_data,
        app_name,
        window_title,
        timestamp: Utc::now().to_rfc3339(),
    })
}

#[cfg(target_os = "macos")]
fn get_active_window_macos() -> (String, String) {
    use objc2_app_kit::NSWorkspace;

    let workspace = NSWorkspace::sharedWorkspace();
    let app = workspace.frontmostApplication();

    let app_name = app
        .as_ref()
        .and_then(|a| a.localizedName())
        .map(|n| n.to_string())
        .unwrap_or_else(|| "Unknown".to_string());

    (app_name.clone(), app_name)
}

#[cfg(target_os = "windows")]
pub fn capture() -> Option<CaptureResult> {
    use windows::Win32::Foundation::*;
    use windows::Win32::Graphics::Gdi::*;
    use windows::Win32::UI::WindowsAndMessaging::*;

    unsafe {
        let hwnd = GetForegroundWindow();
        let mut title_buf = [0u16; 256];
        let title_len = GetWindowTextW(hwnd, &mut title_buf);
        let window_title = String::from_utf16_lossy(&title_buf[..title_len as usize]);

        let mut pid: u32 = 0;
        GetWindowThreadProcessId(hwnd, Some(&mut pid));
        let app_name = get_process_name(pid);

        let screen_dc = GetDC(None);
        let width = GetSystemMetrics(SM_CXSCREEN);
        let height = GetSystemMetrics(SM_CYSCREEN);

        let mem_dc = CreateCompatibleDC(screen_dc);
        let bitmap = CreateCompatibleBitmap(screen_dc, width, height);
        let old_bitmap = SelectObject(mem_dc, bitmap);

        BitBlt(mem_dc, 0, 0, width, height, screen_dc, 0, 0, SRCCOPY).ok()?;

        let mut bmi = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: width,
                biHeight: -height,
                biPlanes: 1,
                biBitCount: 32,
                biCompression: 0,
                ..Default::default()
            },
            ..Default::default()
        };

        let mut pixels = vec![0u8; (width * height * 4) as usize];
        GetDIBits(
            mem_dc,
            bitmap,
            0,
            height as u32,
            Some(pixels.as_mut_ptr() as *mut _),
            &mut bmi,
            DIB_RGB_COLORS,
        );

        SelectObject(mem_dc, old_bitmap);
        DeleteObject(bitmap);
        DeleteDC(mem_dc);
        ReleaseDC(None, screen_dc);

        let mut rgb = Vec::with_capacity((width * height * 3) as usize);
        for chunk in pixels.chunks(4) {
            if chunk.len() >= 3 {
                rgb.push(chunk[2]);
                rgb.push(chunk[1]);
                rgb.push(chunk[0]);
            }
        }

        let image_data = encode_jpeg(&rgb, width as u32, height as u32)?;

        Some(CaptureResult {
            image_data,
            app_name,
            window_title,
            timestamp: Utc::now().to_rfc3339(),
        })
    }
}

#[cfg(target_os = "windows")]
fn get_process_name(pid: u32) -> String {
    use windows::Win32::System::Threading::*;

    unsafe {
        let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid);
        if let Ok(handle) = handle {
            let mut buf = [0u16; 260];
            let mut size = buf.len() as u32;
            if QueryFullProcessImageNameW(handle, PROCESS_NAME_WIN32, &mut buf, &mut size).is_ok() {
                let path = String::from_utf16_lossy(&buf[..size as usize]);
                let _ = windows::Win32::Foundation::CloseHandle(handle);
                return path
                    .rsplit('\\')
                    .next()
                    .unwrap_or("Unknown")
                    .replace(".exe", "")
                    .to_string();
            }
            let _ = windows::Win32::Foundation::CloseHandle(handle);
        }
    }
    "Unknown".to_string()
}
