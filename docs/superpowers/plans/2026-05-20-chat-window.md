# Pet Chat Window Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用独立 Tauri 窗口替代 `prompt()` 实现点击宠物聊天，支持紧凑/完整双模式、流式输出、SQLite 历史持久化。

**Architecture:** 新建 `chat.html` + `src/chat-main.ts` 作为聊天窗口前端，Rust 端新增 `open_chat_window` 和 `chat_with_pet_stream` 命令，`ai.rs` 增加 SSE 流式 HTTP 请求。点击宠物触发 `invoke('open_chat_window')`，消息通过 SQLite `chat_history` 表持久化。

**Tech Stack:** Tauri v2, TypeScript, Rust, rusqlite, reqwest (SSE streaming), Catppuccin 深色主题

---

### Task 1: 添加构建入口和权限

**Files:**
- Modify: `vite.config.ts:14-21`
- Modify: `src-tauri/capabilities/default.json:5`

- [ ] **Step 1: 添加 chat.html 到 Vite 构建入口**

```typescript
// vite.config.ts, rollupOptions.input:
input: {
  main: 'index.html',
  'ai-settings': 'ai-settings.html',
  'pet-import': 'pet-import.html',
  bubble: 'bubble.html',
  chat: 'chat.html',
},
```

- [ ] **Step 2: 添加 chat 窗口权限**

```json
// capabilities/default.json:
"windows": ["main", "ai-settings", "pet-import", "chat"],
```

- [ ] **Step 3: 验证构建**

```bash
npx tsc --noEmit
```

---

### Task 2: 新建 chat.html — 聊天窗口 HTML+CSS

**Files:**
- Create: `chat.html`

- [ ] **Step 1: 编写 chat.html**

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body {
        width: 100%; height: 100%;
        background: #1e1e2e;
        overflow: hidden;
        font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif;
      }
      .chat-container {
        width: 100%; height: 100%;
        display: flex; flex-direction: column;
        color: #cdd6f4;
      }
      .chat-header {
        display: flex; align-items: center;
        padding: 12px 16px;
        border-bottom: 1px solid #313244;
        flex-shrink: 0;
      }
      .chat-header-emoji { font-size: 22px; margin-right: 8px; }
      .chat-header-name { font-size: 14px; font-weight: 600; color: #fff; flex: 1; }
      .chat-header-btn {
        width: 28px; height: 28px;
        border: none; background: transparent;
        color: #a6adc8; font-size: 16px;
        cursor: pointer; border-radius: 6px;
        display: flex; align-items: center; justify-content: center;
      }
      .chat-header-btn:hover { background: #313244; color: #fff; }
      .chat-messages {
        flex: 1; overflow-y: auto;
        padding: 16px;
        display: flex; flex-direction: column;
        gap: 12px;
      }
      .chat-messages::-webkit-scrollbar { width: 4px; }
      .chat-messages::-webkit-scrollbar-thumb { background: #45475a; border-radius: 2px; }
      .chat-msg {
        max-width: 85%;
        padding: 10px 14px;
        border-radius: 12px;
        font-size: 13px;
        line-height: 1.5;
        word-break: break-word;
      }
      .chat-msg.user {
        align-self: flex-end;
        background: linear-gradient(135deg, #4fc3f7, #7c4dff);
        color: #fff;
        border-bottom-right-radius: 4px;
      }
      .chat-msg.assistant {
        align-self: flex-start;
        background: #313244;
        color: #cdd6f4;
        border-bottom-left-radius: 4px;
      }
      .chat-msg.error {
        align-self: flex-start;
        background: rgba(243,139,168,0.15);
        border: 1px solid rgba(243,139,168,0.3);
        color: #f38ba8;
      }
      .chat-msg.loading {
        align-self: flex-start;
        background: #313244;
        color: #a6adc8;
        padding: 10px 20px;
      }
      .chat-msg.loading .dot-pulse {
        display: inline-block; width: 6px; height: 6px;
        border-radius: 50%; background: #a6adc8;
        animation: pulse 1.2s infinite;
        margin: 0 2px;
      }
      .chat-msg.loading .dot-pulse:nth-child(2) { animation-delay: 0.2s; }
      .chat-msg.loading .dot-pulse:nth-child(3) { animation-delay: 0.4s; }
      @keyframes pulse {
        0%, 80%, 100% { opacity: 0.3; }
        40% { opacity: 1; }
      }
      .chat-empty {
        flex: 1; display: flex; flex-direction: column;
        align-items: center; justify-content: center;
        color: #585b70; font-size: 13px; gap: 12px;
      }
      .chat-empty button {
        padding: 8px 20px; border: none; border-radius: 8px;
        background: linear-gradient(135deg, #4fc3f7, #7c4dff);
        color: #fff; font-size: 13px; font-weight: 600; cursor: pointer;
      }
      .chat-input-area {
        padding: 12px 16px;
        border-top: 1px solid #313244;
        display: flex; gap: 8px;
        flex-shrink: 0;
      }
      .chat-input-area textarea {
        flex: 1;
        padding: 10px 12px;
        background: #313244;
        border: 1px solid #45475a;
        border-radius: 10px;
        color: #cdd6f4;
        font-size: 13px;
        font-family: inherit;
        resize: none;
        outline: none;
        line-height: 1.4;
      }
      .chat-input-area textarea:focus { border-color: #7c4dff; }
      .chat-send-btn {
        width: 40px; height: 40px;
        border: none; border-radius: 10px;
        background: linear-gradient(135deg, #4fc3f7, #7c4dff);
        color: #fff; font-size: 16px; cursor: pointer;
        flex-shrink: 0;
        display: flex; align-items: center; justify-content: center;
      }
      .chat-send-btn:disabled { opacity: 0.4; cursor: not-allowed; }
    </style>
    <title>Chat</title>
  </head>
  <body>
    <div class="chat-container">
      <div class="chat-header">
        <span class="chat-header-emoji" id="chat-header-emoji">🐱</span>
        <span class="chat-header-name" id="chat-header-name">小橘</span>
        <button class="chat-header-btn" id="chat-expand-btn" title="展开">⤡</button>
        <button class="chat-header-btn" id="chat-close-btn" title="关闭">✕</button>
      </div>
      <div class="chat-messages" id="chat-messages"></div>
      <div class="chat-empty" id="chat-empty" style="display:none">
        <div>💬</div>
        <span>跟我聊聊吧~</span>
      </div>
      <div class="chat-input-area">
        <textarea id="chat-input" rows="1" placeholder="输入消息..."></textarea>
        <button class="chat-send-btn" id="chat-send-btn">↑</button>
      </div>
    </div>
    <script type="module" src="/src/chat-main.ts"></script>
  </body>
</html>
```

- [ ] **Step 2: 验证文件存在**

```bash
ls -la chat.html
```

---

### Task 3: 新建 src/chat-main.ts — 聊天窗口逻辑

**Files:**
- Create: `src/chat-main.ts`

- [ ] **Step 1: 编写 chat-main.ts**

```typescript
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { PhysicalSize } from '@tauri-apps/api/dpi';

interface HistoryEntry { role: 'user' | 'assistant'; content: string; }

const messagesEl = document.getElementById('chat-messages')!;
const emptyEl = document.getElementById('chat-empty')!;
const inputEl = document.getElementById('chat-input')! as HTMLTextAreaElement;
const sendBtn = document.getElementById('chat-send-btn')! as HTMLButtonElement;
const expandBtn = document.getElementById('chat-expand-btn')!;
const closeBtn = document.getElementById('chat-close-btn')!;

let sending = false;
let isFullMode = false;
let historyLoaded = false;

function scrollToBottom(): void {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function renderMessages(entries: HistoryEntry[]): void {
  messagesEl.innerHTML = '';
  if (entries.length === 0) {
    emptyEl.style.display = '';
    return;
  }
  emptyEl.style.display = 'none';
  for (const e of entries) {
    const div = document.createElement('div');
    div.className = `chat-msg ${e.role}`;
    div.textContent = e.content;
    messagesEl.appendChild(div);
  }
  scrollToBottom();
}

function appendMessage(role: 'user' | 'assistant' | 'error' | 'loading', content: string): HTMLElement {
  emptyEl.style.display = 'none';
  const div = document.createElement('div');
  div.className = `chat-msg ${role}`;
  if (role === 'loading') {
    div.innerHTML = '<span class="dot-pulse"></span><span class="dot-pulse"></span><span class="dot-pulse"></span>';
  } else {
    div.textContent = content;
  }
  messagesEl.appendChild(div);
  scrollToBottom();
  return div;
}

async function loadHistory(): Promise<void> {
  try {
    const entries = await invoke<HistoryEntry[]>('load_chat_history');
    renderMessages(entries);
  } catch {
    renderMessages([]);
  }
  historyLoaded = true;
}

async function sendMessage(): Promise<void> {
  const msg = inputEl.value.trim();
  if (!msg || sending) return;

  try {
    const config = await invoke<{ apiKey: string } | null>('get_ai_config');
    if (!config || !config.apiKey) {
      emptyEl.style.display = '';
      emptyEl.innerHTML = '<div>⚠️ 请先在 AI 设置中配置 API Key</div><button id="chat-open-settings">打开设置</button>';
      document.getElementById('chat-open-settings')?.addEventListener('click', () => {
        void invoke('open_ai_settings_window');
      });
      return;
    }
  } catch { /* proceed */ }

  sending = true;
  sendBtn.disabled = true;
  inputEl.value = '';

  appendMessage('user', msg);

  if (isFullMode) {
    // Streaming mode for full window
    const loadingEl = appendMessage('loading', '');
    loadingEl.className = 'chat-msg assistant';
    loadingEl.textContent = '';

    // Listen for streaming tokens
    const unlisten = await listen<string>('chat-stream-token', (event) => {
      loadingEl.textContent += event.payload;
      scrollToBottom();
    });

    try {
      const reply = await invoke<string>('chat_with_pet_stream', {
        messages: [{ role: 'system', content: '' }, { role: 'user', content: msg }],
      });
      if (!reply) loadingEl.textContent = loadingEl.textContent || '(empty)';
    } catch (e) {
      loadingEl.textContent = String(e);
      loadingEl.className = 'chat-msg error';
    }
    unlisten();
  } else {
    // Non-streaming for compact mode
    const loadingEl = appendMessage('loading', '');
    try {
      const reply = await invoke<string>('chat_with_pet', {
        messages: [{ role: 'system', content: '' }, { role: 'user', content: msg }],
      });
      loadingEl.remove();
      appendMessage('assistant', reply);
    } catch (e) {
      loadingEl.remove();
      appendMessage('error', String(e));
    }
  }

  sending = false;
  sendBtn.disabled = false;
  inputEl.focus();
}

// Event listeners
inputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    void sendMessage();
  }
});

sendBtn.addEventListener('click', () => void sendMessage());

closeBtn.addEventListener('click', () => void getCurrentWindow().close());

expandBtn.addEventListener('click', async () => {
  const win = getCurrentWindow();
  if (!isFullMode) {
    isFullMode = true;
    await win.setSize(new PhysicalSize(480, 600));
    await win.setResizable(true);
    expandBtn.textContent = '⤢';
    expandBtn.title = '收缩';
  } else {
    isFullMode = false;
    await win.setSize(new PhysicalSize(340, 440));
    await win.setResizable(false);
    expandBtn.textContent = '⤡';
    expandBtn.title = '展开';
  }
});

void loadHistory();
```

- [ ] **Step 2: 验证 TypeScript 编译**

```bash
npx tsc --noEmit
```

---

### Task 4: Rust — 新增 open_chat_window 命令

**Files:**
- Modify: `src-tauri/src/lib.rs` (new command + register)

- [ ] **Step 1: 在 open_ai_settings_window 附近添加 open_chat_window**

```rust
#[tauri::command]
fn open_chat_window(app_handle: tauri::AppHandle) {
    // If already open, just focus it
    if let Some(win) = app_handle.get_webview_window("chat") {
        let _ = win.show();
        let _ = win.set_focus();
        return;
    }

    // Position near the pet (main) window
    let mut x = 100.0;
    let mut y = 100.0;
    if let Some(main_win) = app_handle.get_webview_window("main") {
        if let Ok(pos) = main_win.outer_position() {
            if let Ok(size) = main_win.outer_size() {
                let scale = main_win.scale_factor().unwrap_or(1.0);
                let main_right = pos.x as f64 / scale + size.width as f64 / scale;
                x = main_right + 8.0;
                y = pos.y as f64 / scale;
                // Flip to left if too close to right edge
                if x + 340.0 > 1920.0 {
                    x = pos.x as f64 / scale - 348.0;
                }
                if x < 0.0 { x = 100.0; }
            }
        }
    }

    let _ = tauri::WebviewWindowBuilder::new(
        &app_handle,
        "chat",
        tauri::WebviewUrl::App("chat.html".into()),
    )
    .title("聊天")
    .inner_size(340.0, 440.0)
    .position(x, y)
    .resizable(false)
    .skip_taskbar(true)
    .build();
}
```

- [ ] **Step 2: 在 invoke_handler 中注册**

```rust
.invoke_handler(tauri::generate_handler![
    // ... existing commands ...
    open_chat_window,
])
```

---

### Task 5: Rust — 新增 chat_with_pet_stream 流式命令 + ai::chat_stream 函数

**Files:**
- Modify: `src-tauri/src/ai.rs` (add `chat_stream` function)
- Modify: `src-tauri/src/lib.rs` (add `chat_with_pet_stream` command + register)

- [ ] **Step 1: 在 ai.rs 中添加 chat_stream 函数**

```rust
// Add to ai.rs after existing chat() function

pub async fn chat_stream(
    config: &AiConfig,
    messages: &[ChatMessage],
    timeout_secs: u64,
    app_handle: &tauri::AppHandle,
) -> Result<String, AiError> {
    let url = format!("{}/v1/chat/completions", config.base_url.trim_end_matches('/'));

    let request_body = serde_json::json!({
        "model": config.model,
        "messages": messages.iter().map(|m| serde_json::json!({
            "role": m.role,
            "content": m.content,
        })).collect::<Vec<_>>(),
        "stream": true,
        "max_tokens": 1024,
    });

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(timeout_secs + 10))
        .build()
        .map_err(|e| AiError::Network(e.to_string()))?;

    let response = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", config.api_key))
        .header("Content-Type", "application/json")
        .json(&request_body)
        .send()
        .await
        .map_err(|e| {
            if e.is_timeout() { AiError::Timeout }
            else if e.is_connect() { AiError::Network(e.to_string()) }
            else { AiError::Network(e.to_string()) }
        })?;

    let status = response.status();
    if status == reqwest::StatusCode::UNAUTHORIZED || status == reqwest::StatusCode::FORBIDDEN {
        return Err(AiError::Unauthorized);
    }

    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        return Err(AiError::Api(format!("HTTP {}: {}", status.as_u16(), body)));
    }

    // Read SSE stream
    let mut full_text = String::new();
    let mut stream = response.bytes_stream();
    use futures_util::StreamExt;

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| AiError::Network(e.to_string()))?;
        let text = String::from_utf8_lossy(&chunk);
        for line in text.lines() {
            if let Some(data) = line.strip_prefix("data: ") {
                if data == "[DONE]" { continue; }
                if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(data) {
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
```

- [ ] **Step 2: 添加 futures-util 依赖到 Cargo.toml**

```toml
// src-tauri/Cargo.toml, add to [dependencies]:
futures-util = "0.3"
```

- [ ] **Step 3: 在 lib.rs 中添加 chat_with_pet_stream 命令**

```rust
#[tauri::command]
async fn chat_with_pet_stream(
    app_handle: tauri::AppHandle,
    messages: Vec<ChatMessage>,
) -> Result<String, String> {
    let config = {
        let state = app_handle.state::<Mutex<Connection>>();
        let db = state.lock().unwrap();
        read_ai_config(&db).ok_or("AI 未配置，请在 AI 设置中输入 API Key".to_string())?
    };
    ai::chat_stream(&config, &messages, 60, &app_handle).await.map_err(|e| e.to_string())
}
```

- [ ] **Step 4: 注册新命令**

```rust
.invoke_handler(tauri::generate_handler![
    // ... existing ...
    open_chat_window,
    chat_with_pet_stream,
])
```

---

### Task 6: 修改 app.ts — 点击宠物打开聊天窗口

**Files:**
- Modify: `src/app.ts:427-451`

- [ ] **Step 1: 替换 prompt() 聊天为 open_chat_window**

找到 canvas click 事件监听器（包含 `prompt('对宠物说话:')` 的部分），替换为：

```typescript
canvas.addEventListener('click', () => {
  if (!getConfig()) return;
  if (behavior.isDragging) return;
  const now = performance.now();
  if (now - chatClickTimer < 300) return;
  chatClickTimer = now;
  void invoke('open_chat_window');
});
```

- [ ] **Step 2: 移除不再使用的 chat 相关代码**

移除 `chatClickTimer` 后的旧 msg/prompt/addToHistory/showBubble/invoke('chat_with_pet') 代码块（整个 .then/.catch 链）。

---

### Task 7: 构建验证 + 测试

- [ ] **Step 1: Rust 编译检查**

```bash
cd src-tauri && cargo check
```
Expected: zero errors

- [ ] **Step 2: TypeScript 类型检查**

```bash
npx tsc --noEmit
```
Expected: zero errors

- [ ] **Step 3: 运行全部测试**

```bash
cargo test && npm test -- --run
```
Expected: 14 Rust tests pass, 79 frontend tests pass

- [ ] **Step 4: 手动验证**

```bash
npm run tauri dev
```
- 配置 AI 设置 → 点击宠物 → 聊天窗口出现
- 输入消息发送 → AI 回复出现
- 展开/收缩窗口
- 关闭再打开 → 历史保留
