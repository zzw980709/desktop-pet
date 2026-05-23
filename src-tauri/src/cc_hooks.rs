use serde::Deserialize;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tauri::Emitter;
use tracing::{error, info, warn};

pub const CC_HOOK_PORT: u16 = 18920;

#[derive(Debug, Deserialize)]
struct CcEventPayload {
    event: String,
}

pub struct CcHookServer {
    running: Arc<AtomicBool>,
}

impl CcHookServer {
    pub fn start(app_handle: tauri::AppHandle) -> Self {
        let running = Arc::new(AtomicBool::new(true));
        let running_clone = running.clone();

        std::thread::spawn(move || {
            let addr = format!("127.0.0.1:{}", CC_HOOK_PORT);
            let listener = match TcpListener::bind(&addr) {
                Ok(l) => {
                    info!("cc-hook server listening on {}", addr);
                    l
                }
                Err(e) => {
                    warn!("cc-hook server failed to bind: {}", e);
                    return;
                }
            };

            for stream in listener.incoming() {
                if !running_clone.load(Ordering::Acquire) {
                    break;
                }

                match stream {
                    Ok(stream) => {
                        let handle = app_handle.clone();
                        std::thread::spawn(move || {
                            handle_connection(stream, handle);
                        });
                    }
                    Err(e) => {
                        error!("cc-hook accept error: {}", e);
                    }
                }
            }
        });

        CcHookServer { running }
    }

    pub fn shutdown(&self) {
        self.running.store(false, Ordering::Release);
        let addr: std::net::SocketAddr = format!("127.0.0.1:{}", CC_HOOK_PORT).parse().unwrap();
        let _ = TcpStream::connect_timeout(&addr, Duration::from_secs(1));
    }
}

impl Drop for CcHookServer {
    fn drop(&mut self) {
        self.shutdown();
    }
}

fn http_err_response() -> &'static [u8] {
    b"HTTP/1.1 400 Bad Request\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
}

fn handle_connection(mut stream: TcpStream, app_handle: tauri::AppHandle) {
    let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));

    // Use a scope so the BufReader borrow ends before we write the response
    let parse_result = {
        let mut reader = BufReader::new(&mut stream);

        let mut request_line = String::new();
        if reader.read_line(&mut request_line).is_err() {
            return;
        }

        if !request_line.starts_with("POST /event ") {
            let _ = stream.write_all(http_err_response());
            return;
        }

        let mut content_length: usize = 0;
        loop {
            let mut line = String::new();
            if reader.read_line(&mut line).is_err() {
                let _ = stream.write_all(http_err_response());
                return;
            }
            if line == "\r\n" || line == "\n" {
                break;
            }
            let lower = line.to_lowercase();
            if lower.starts_with("content-length:") {
                if let Some(val) = line.split(':').nth(1) {
                    content_length = val.trim().parse().unwrap_or(0);
                }
            }
        }

        const MAX_BODY_SIZE: usize = 64 * 1024;
        if content_length == 0 || content_length > MAX_BODY_SIZE {
            let _ = stream.write_all(http_err_response());
            return;
        }

        let mut body = vec![0u8; content_length];
        if reader.read_exact(&mut body).is_err() {
            let _ = stream.write_all(http_err_response());
            return;
        }

        match serde_json::from_slice::<CcEventPayload>(&body) {
            Ok(p) => Some(p),
            Err(e) => {
                warn!("cc-hook bad JSON: {}", e);
                let _ = stream.write_all(http_err_response());
                None
            }
        }
    };
    // BufReader borrow on &mut stream dropped here

    if let Some(payload) = parse_result {
        info!("cc-hook event: {}", payload.event);

        if let Err(e) = app_handle.emit("cc-event", payload.event) {
            error!("cc-hook emit error: {}", e);
        }
    }

    let response = "HTTP/1.1 200 OK\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
    let _ = stream.write_all(response.as_bytes());
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_valid_event_json() {
        let json = r#"{"event":"thinking"}"#;
        let payload: CcEventPayload = serde_json::from_str(json).unwrap();
        assert_eq!(payload.event, "thinking");
    }

    #[test]
    fn parse_all_event_types() {
        for event in &["thinking", "tool-calling", "waiting", "context-compacted", "completion"] {
            let json = format!(r#"{{"event":"{}"}}"#, event);
            let payload: CcEventPayload = serde_json::from_str(&json).unwrap();
            assert_eq!(payload.event, *event);
        }
    }

    #[test]
    fn reject_missing_event_field() {
        let json = r#"{"foo":"bar"}"#;
        let result: Result<CcEventPayload, _> = serde_json::from_str(json);
        assert!(result.is_err());
    }
}
