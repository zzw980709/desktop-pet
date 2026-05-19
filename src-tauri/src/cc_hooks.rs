use serde::Deserialize;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::Emitter;
use tracing::{error, info, warn};

const CC_HOOK_PORT: u16 = 18920;

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

            listener
                .set_nonblocking(false)
                .expect("failed to set nonblocking");

            for stream in listener.incoming() {
                if !running_clone.load(Ordering::SeqCst) {
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
        self.running.store(false, Ordering::SeqCst);
        // Self-connect to unblock accept()
        let _ = TcpStream::connect(format!("127.0.0.1:{}", CC_HOOK_PORT));
    }
}

fn handle_connection(mut stream: TcpStream, app_handle: tauri::AppHandle) {
    let mut reader = BufReader::new(stream.try_clone().unwrap_or_else(|_| {
        unreachable!("BufReader clone should succeed for TCP stream")
    }));

    // Read request line
    let mut request_line = String::new();
    if reader.read_line(&mut request_line).is_err() {
        return;
    }

    if !request_line.starts_with("POST /event ") {
        return;
    }

    // Read headers to find Content-Length
    let mut content_length: usize = 0;
    loop {
        let mut line = String::new();
        if reader.read_line(&mut line).is_err() {
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

    if content_length == 0 {
        return;
    }

    // Read body
    let mut body = vec![0u8; content_length];
    if reader.read_exact(&mut body).is_err() {
        return;
    }

    let payload: CcEventPayload = match serde_json::from_slice(&body) {
        Ok(p) => p,
        Err(e) => {
            warn!("cc-hook bad JSON: {}", e);
            return;
        }
    };

    info!("cc-hook event: {}", payload.event);

    if let Err(e) = app_handle.emit("cc-event", payload.event) {
        error!("cc-hook emit error: {}", e);
    }

    // Send minimal HTTP response
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
