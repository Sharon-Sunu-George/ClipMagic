use serde::Serialize;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{Manager, RunEvent, State};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

struct BackendState {
    child: Mutex<Option<Child>>,
    url: Mutex<String>,
    error: Mutex<Option<String>>,
    ready: Mutex<bool>,
}

#[derive(Serialize)]
struct BackendStatus {
    ready: bool,
    url: String,
    error: Option<String>,
}

fn find_free_port() -> u16 {
    TcpListener::bind("127.0.0.1:0")
        .and_then(|l| l.local_addr())
        .map(|a| a.port())
        .unwrap_or(8765)
}

fn check_health(port: u16) -> bool {
    let addr = format!("127.0.0.1:{port}");
    if let Ok(mut stream) = TcpStream::connect_timeout(
        &addr.parse().unwrap(),
        Duration::from_millis(400),
    ) {
        let _ = stream.set_read_timeout(Some(Duration::from_millis(800)));
        let req = format!("GET /api/health HTTP/1.1\r\nHost: {addr}\r\nConnection: close\r\n\r\n");
        if stream.write_all(req.as_bytes()).is_ok() {
            let mut buf = [0u8; 256];
            if let Ok(n) = stream.read(&mut buf) {
                let text = String::from_utf8_lossy(&buf[..n]);
                return text.starts_with("HTTP/1.1 200") || text.starts_with("HTTP/1.0 200");
            }
        }
    }
    false
}

fn resolve_sidecar_path(app: &tauri::AppHandle) -> Option<PathBuf> {
    let exe_dir = std::env::current_exe().ok()?.parent()?.to_path_buf();
    let candidates = [
        exe_dir.join("clipmagic-backend.exe"),
        exe_dir.join("clipmagic-backend-x86_64-pc-windows-msvc.exe"),
        exe_dir.join("binaries").join("clipmagic-backend-x86_64-pc-windows-msvc.exe"),
    ];
    for c in candidates {
        if c.is_file() {
            return Some(c);
        }
    }
    if let Ok(res_dir) = app.path().resource_dir() {
        let rc = res_dir.join("binaries").join("clipmagic-backend-x86_64-pc-windows-msvc.exe");
        if rc.is_file() {
            return Some(rc);
        }
    }
    None
}

fn spawn_backend(app: &tauri::AppHandle) -> (Option<Child>, String, bool, Option<String>) {
    // In dev mode, reuse an already-running local FastAPI server on 127.0.0.1:8000 if healthy
    if cfg!(debug_assertions) && check_health(8000) {
        return (None, "http://127.0.0.1:8000".to_string(), true, None);
    }

    let port = find_free_port();
    let url = format!("http://127.0.0.1:{port}");

    let data_dir = app
        .path()
        .app_local_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."));
    let _ = std::fs::create_dir_all(&data_dir);

    let child_res = if let Some(sidecar) = resolve_sidecar_path(app) {
        let mut cmd = Command::new(sidecar);
        cmd.args([
            "--host",
            "127.0.0.1",
            "--port",
            &port.to_string(),
            "--data-dir",
            &data_dir.to_string_lossy(),
        ])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
        #[cfg(windows)]
        cmd.creation_flags(CREATE_NO_WINDOW);
        cmd.spawn()
    } else if cfg!(debug_assertions) {
        // Fallback for `tauri dev` using local backend/.venv
        let dev_backend = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .and_then(|p| p.parent())
            .map(|root| root.join("backend"))
            .unwrap_or_else(|| PathBuf::from("backend"));
        let py = dev_backend.join(".venv").join("Scripts").join("python.exe");
        let mut cmd = Command::new(py);
        cmd.current_dir(&dev_backend)
            .args([
                "-m",
                "uvicorn",
                "app.main:app",
                "--host",
                "127.0.0.1",
                "--port",
                &port.to_string(),
            ])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        #[cfg(windows)]
        cmd.creation_flags(CREATE_NO_WINDOW);
        cmd.spawn()
    } else {
        return (
            None,
            url,
            false,
            Some("Packaged backend executable (clipmagic-backend.exe) was not found.".to_string()),
        );
    };

    let mut child = match child_res {
        Ok(c) => c,
        Err(err) => {
            return (
                None,
                url,
                false,
                Some(format!("Failed to launch local backend process: {err}")),
            );
        }
    };

    // Wait up to 20s for /api/health
    let deadline = Instant::now() + Duration::from_secs(20);
    while Instant::now() < deadline {
        if let Ok(Some(status)) = child.try_wait() {
            return (
                None,
                url,
                false,
                Some(format!("Backend process exited unexpectedly with status: {status}")),
            );
        }
        if check_health(port) {
            return (Some(child), url, true, None);
        }
        std::thread::sleep(Duration::from_millis(250));
    }

    let _ = child.kill();
    (
        None,
        url,
        false,
        Some("Timed out waiting for local ClipMagic backend health check.".to_string()),
    )
}

#[tauri::command]
fn get_backend_status(state: State<BackendState>) -> BackendStatus {
    let ready = *state.ready.lock().unwrap();
    let url = state.url.lock().unwrap().clone();
    let error = state.error.lock().unwrap().clone();
    BackendStatus { ready, url, error }
}

#[tauri::command]
fn get_backend_url(state: State<BackendState>) -> String {
    state.url.lock().unwrap().clone()
}

fn stop_backend(state: &BackendState) {
    if let Ok(mut guard) = state.child.lock() {
        if let Some(mut child) = guard.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(BackendState {
            child: Mutex::new(None),
            url: Mutex::new("http://127.0.0.1:8000".to_string()),
            error: Mutex::new(None),
            ready: Mutex::new(false),
        })
        .setup(|app| {
            let handle = app.handle().clone();
            let (child, url, ready, error) = spawn_backend(&handle);
            let state = app.state::<BackendState>();
            *state.child.lock().unwrap() = child;
            *state.url.lock().unwrap() = url;
            *state.ready.lock().unwrap() = ready;
            *state.error.lock().unwrap() = error;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![get_backend_status, get_backend_url])
        .build(tauri::generate_context!())
        .expect("error while building ClipMagic");

    app.run(|app_handle, event| {
        if let RunEvent::Exit = event {
            let state = app_handle.state::<BackendState>();
            stop_backend(&state);
        }
    });
}
