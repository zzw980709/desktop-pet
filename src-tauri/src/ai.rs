use serde::{Deserialize, Serialize};
use tauri::Emitter;
use tracing::info;

use crate::ChatMessage;

pub struct AiConnection {
    pub api_key: String,
    pub base_url: String,
    pub model: String,
}

#[derive(Debug)]
pub enum AiError {
    Unauthorized(String),
    Timeout(String),
    Network(String),
    Api(String),
}

impl std::fmt::Display for AiError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AiError::Unauthorized(m) => write!(f, "API Key 无效，请在 AI 设置中检查: {}", m),
            AiError::Timeout(m) => write!(f, "AI 响应超时，请稍后重试: {}", m),
            AiError::Network(m) => write!(f, "无法连接 AI 服务，请检查网络: {}", m),
            AiError::Api(m) => write!(f, "{}", m),
        }
    }
}

#[derive(Serialize)]
struct ChatRequest {
    model: String,
    messages: Vec<ChatMessage>,
    stream: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    max_tokens: Option<u32>,
}

#[derive(Deserialize)]
struct ChatResponse {
    choices: Vec<Choice>,
}

#[derive(Deserialize)]
struct Choice {
    message: ChoiceMessage,
}

#[derive(Deserialize)]
struct ChoiceMessage {
    content: String,
}

#[derive(Deserialize)]
struct ErrorResponse {
    error: ErrorDetail,
}

#[derive(Deserialize)]
struct ErrorDetail {
    message: String,
}

pub async fn chat(
    conn: &AiConnection,
    messages: &[ChatMessage],
    timeout_secs: u64,
) -> Result<String, AiError> {
    let url = format!("{}/v1/chat/completions", conn.base_url.trim_end_matches('/'));

    let request_body = ChatRequest {
        model: conn.model.clone(),
        messages: messages.to_vec(),
        stream: false,
        max_tokens: Some(256),
    };

    info!("ai::chat to {} model {}", url, conn.model);

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(timeout_secs))
        .build()
        .map_err(|e| AiError::Network(e.to_string()))?;

    let response = client
        .post(&url)
        .header("Content-Type", "application/json")
        .header("Authorization", format!("Bearer {}", conn.api_key))
        .json(&request_body)
        .send()
        .await
        .map_err(|e| {
            if e.is_timeout() { AiError::Timeout(e.to_string()) }
            else { AiError::Network(e.to_string()) }
        })?;

    let status = response.status();
    if status == 401 || status == 403 {
        let body = response.text().await.unwrap_or_default();
        return Err(AiError::Unauthorized(body));
    }

    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        if let Ok(err) = serde_json::from_str::<ErrorResponse>(&body) {
            return Err(AiError::Api(err.error.message));
        }
        return Err(AiError::Api(format!("HTTP {}: {}", status.as_u16(), body)));
    }

    let chat_response: ChatResponse = response
        .json()
        .await
        .map_err(|e| AiError::Api(format!("parse error: {}", e)))?;

    let content = chat_response.choices.into_iter()
        .next()
        .map(|c| c.message.content)
        .unwrap_or_default();

    info!("ai::chat got {} chars", content.len());
    Ok(content)
}

pub async fn chat_stream(
    conn: &AiConnection,
    messages: &[ChatMessage],
    timeout_secs: u64,
    app_handle: &tauri::AppHandle,
) -> Result<String, AiError> {
    let url = format!("{}/v1/chat/completions", conn.base_url.trim_end_matches('/'));

    let request_body = ChatRequest {
        model: conn.model.clone(),
        messages: messages.to_vec(),
        stream: true,
        max_tokens: Some(1024),
    };

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(timeout_secs + 10))
        .build()
        .map_err(|e| AiError::Network(e.to_string()))?;

    let response = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", conn.api_key))
        .header("Content-Type", "application/json")
        .json(&request_body)
        .send()
        .await
        .map_err(|e| {
            if e.is_timeout() {
                AiError::Timeout(e.to_string())
            } else if e.is_connect() {
                AiError::Network(e.to_string())
            } else {
                AiError::Network(e.to_string())
            }
        })?;

    let status = response.status();
    if status == reqwest::StatusCode::UNAUTHORIZED || status == reqwest::StatusCode::FORBIDDEN {
        let body = response.text().await.unwrap_or_default();
        return Err(AiError::Unauthorized(body));
    }

    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        return Err(AiError::Api(format!("HTTP {}: {}", status.as_u16(), body)));
    }

    let mut full_text = String::new();
    let mut stream = response.bytes_stream();
    let mut line_buf = String::new();
    use futures_util::StreamExt;

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| AiError::Network(e.to_string()))?;
        let text = String::from_utf8_lossy(&chunk);
        line_buf.push_str(&text);
        // Process complete lines; keep the trailing partial line in line_buf
        let mut data_text = String::new();
        while let Some(pos) = line_buf.find('\n') {
            let line = line_buf[..pos].trim_end_matches('\r').to_string();
            line_buf = line_buf[pos + 1..].to_string();

            if line.is_empty() {
                // Empty line = event boundary, flush accumulated data
                if !data_text.is_empty() {
                    if data_text != "[DONE]" {
                        if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&data_text) {
                            if let Some(content) = parsed["choices"][0]["delta"]["content"].as_str() {
                                full_text.push_str(content);
                                let _ = app_handle.emit_to("chat", "chat-stream-token", content);
                            }
                        }
                    }
                    data_text.clear();
                }
                continue;
            }

            if let Some(data) = line.strip_prefix("data: ") {
                if !data_text.is_empty() {
                    data_text.push('\n');
                }
                data_text.push_str(data);
            }
        }
        // Flush any remaining data at end of stream (no trailing empty line)
        if line_buf.is_empty() && !data_text.is_empty() {
            if data_text != "[DONE]" {
                if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&data_text) {
                    if let Some(content) = parsed["choices"][0]["delta"]["content"].as_str() {
                        full_text.push_str(content);
                        let _ = app_handle.emit_to("chat", "chat-stream-token", content);
                    }
                }
            }
        }
    }

    if full_text.is_empty() {
        return Err(AiError::Api("empty response".into()));
    }
    Ok(full_text)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_valid_response() {
        let json = r#"{"choices":[{"message":{"content":"hello"}}]}"#;
        let resp: ChatResponse = serde_json::from_str(json).unwrap();
        assert_eq!(resp.choices[0].message.content, "hello");
    }

    #[test]
    fn parse_error_response() {
        let json = r#"{"error":{"message":"Invalid Key"}}"#;
        let resp: ErrorResponse = serde_json::from_str(json).unwrap();
        assert_eq!(resp.error.message, "Invalid Key");
    }
}
