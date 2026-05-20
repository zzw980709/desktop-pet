use serde::{Deserialize, Serialize};
use tracing::info;

use crate::{AiConfig, ChatMessage};

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
    config: &AiConfig,
    messages: &[ChatMessage],
    timeout_secs: u64,
) -> Result<String, AiError> {
    let url = format!("{}/v1/chat/completions", config.base_url.trim_end_matches('/'));

    let request_body = ChatRequest {
        model: config.model.clone(),
        messages: messages.to_vec(),
        stream: false,
        max_tokens: Some(256),
    };

    info!("ai::chat to {} model {}", url, config.model);

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(timeout_secs))
        .build()
        .map_err(|e| AiError::Network(e.to_string()))?;

    let response = client
        .post(&url)
        .header("Content-Type", "application/json")
        .header("Authorization", format!("Bearer {}", config.api_key))
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
