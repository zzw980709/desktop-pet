# AI Chat Integration — Design Spec

**Date:** 2026-05-20
**Status:** Approved

## Overview

Integrate AI chat into the desktop pet. Users provide a DeepSeek API key, the pet gains
three AI-powered interaction modes: user chat, event-driven reaction, and idle chatter.

Supported providers: DeepSeek first. Architecture is provider-agnostic (OpenAI-compatible API).

## Data Model

Extend `preferences.json` with optional `aiConfig` field:

```json
{
  "activePetId": "cat",
  "windowPosition": { "x": 100, "y": 200 },
  "aiConfig": {
    "apiKey": "sk-xxx",
    "baseUrl": "https://api.deepseek.com",
    "model": "DeepSeek-V3",
    "systemPrompt": "你是一只可爱的桌面宠物猫，名叫小橘...",
    "idleChatEnabled": true,
    "idleChatInterval": 300
  }
}
```

- `apiKey`: DeepSeek API key (required for AI features)
- `baseUrl`: API endpoint, defaults to `https://api.deepseek.com`
- `model`: Model name, defaults to `DeepSeek-V3`
- `systemPrompt`: Customizable pet personality prompt, built-in default provided
- `idleChatEnabled`: Whether pet proactively speaks when idle
- `idleChatInterval`: Seconds between idle chatter attempts (default 300)

Rust `Preferences` struct adds `Option<AiConfig>` for backward compatibility.

## Architecture

```
┌──────────────┐     invoke()      ┌──────────────┐    reqwest    ┌──────────────┐
│   Frontend   │ ──────────────────│   Rust Core  │ ────────────│  DeepSeek API│
│  (TypeScript)│                   │   (ai.rs)    │              │ /v1/chat/... │
└──────────────┘                   └──────────────┘              └──────────────┘
       │                                  │
       │  render bubble                   │  read/store
       ▼                                  ▼
┌──────────────┐                   ┌──────────────┐
│  Renderer    │                   │ preferences  │
│  (canvas)    │                   │   .json      │
└──────────────┘                   └──────────────┘
```

### New Files

| File | Purpose |
|---|---|
| `src-tauri/src/ai.rs` | DeepSeek API client, `chat()` function |
| `src/ui/ai-settings.ts` | Settings panel UI component |
| `src/ai/chat.ts` | Frontend chat orchestration, history management |

### Modified Files

| File | Change |
|---|---|
| `src-tauri/src/lib.rs` | `AiConfig` struct, Tauri commands, `setup_app` init |
| `src-tauri/Cargo.toml` | Add `reqwest` dependency |
| `src/types.ts` | `AiConfig` interface |
| `src/app.ts` | AI integration in cc-event + idle flow + click-to-chat |

## Rust Module: ai.rs

### API

```rust
pub async fn chat(
    config: &AiConfig,
    messages: &[ChatMessage],
) -> Result<String, AiError>
```

### ChatMessage

```rust
struct ChatMessage {
    role: "system" | "user",
    content: String,
}
```

### Error Handling

| Condition | User-facing Message |
|---|---|
| 401/403 | "API Key 无效，请在 AI 设置中检查" |
| Timeout (30s) | "AI 响应超时，请稍后重试" |
| Network error | "无法连接 AI 服务，请检查网络" |
| Other | Error message from API response |

### Tauri Commands

- `set_ai_config(config: AiConfig) -> Result<(), String>` — Save AI settings
- `get_ai_config() -> Option<AiConfig>` — Read current settings
- `chat_with_pet(message: String) -> Result<String, String>` — User chat (history managed frontend)
- `generate_event_reaction(event: String) -> Result<String, String>` — Event-driven reaction (no history)

## Frontend: Settings Panel

Modern dark-theme panel, opened from menu "AI 设置...".

**Layout:**
- Header: icon + title + status indicator (green dot = configured)
- API Key: password field with show/hide toggle
- Base URL + Model: side-by-side, model is a dropdown
- System Prompt: textarea with character count + reset-default link
- Idle chat: toggle switch + interval number input
- Buttons: "测试连接" + "保存设置"
- Status bar: connection test result

**Design:** Dark theme matching macOS aesthetic, no balance query feature.

### Validation

- "测试连接" sends a minimal chat request to verify API key works
- On success: green status "连接正常 — {model}"
- On failure: red status with error message
- "保存" only requires API key + base URL non-empty; validates URL format

## Three Interaction Modes

### 1. User Chat (Click Pet)

- Click pet → input box appears above bubble area
- Type message → Enter to send
- Chat history: last 10 messages kept in memory for context
- Bubble shows "..." while waiting, then AI reply
- AI timeout 30s; error shown in bubble if fails

### 2. Event Reaction (CC Hook)

- CC event fires → `generate_event_reaction(event)` called
- AI gets: `"你注意到主人正在：{event_description}"`
- Bubble shows AI-generated reply instead of static text
- Fallback: 1.5s timeout → use static mapping from existing `ccEventConfig`

### 3. Idle Chatter

- behavior.ts idle timer: after random pause, 10% probability triggers chat
- Only if `idleChatEnabled` and `apiKey` is set
- AI gets: `"你现在有点无聊，随口说一句话"` (no history)
- 2s timeout → give up silently if AI doesn't respond in time
- Fallback: built-in idle phrases if AI unavailable

## Event Description Mapping

| CC Event | AI prompt description |
|---|---|
| thinking | "主人正在认真思考" |
| tool-bash | "主人正在运行命令行" |
| tool-edit | "主人正在编辑代码" |
| tool-write | "主人正在写文件" |
| tool-web | "主人正在浏览网页" |
| waiting | "主人在等待授权操作" |
| context-compacted | "对话刚被压缩了" |
| completion | "主人刚完成了任务" |

## Dependencies

- `reqwest` (Rust crate) with `rustls-tls` feature — HTTP client for DeepSeek API
- Reuse existing `tokio` for async

## Testing

- `ai.rs`: unit test `parse_valid_response`, `parse_error_response`
- Frontend: `ai-settings` component renders, `chat_with_pet` mock response
- Integration: full flow — set config → send chat → verify response

## Out of Scope

- Balance/usage query
- Other AI providers (OpenAI, Anthropic, etc.) — architecture supports adding later
- Voice/audio
- Persistent chat history across sessions
