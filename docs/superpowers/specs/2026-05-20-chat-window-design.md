# Pet Chat Window — 点击宠物触发聊天窗口

## 概述

替代当前 `prompt()` 点击聊天方式，改为独立 Tauri 窗口实现双模聊天 UI：
- **紧凑模式**（默认）：340×440，宠物旁边，显示最近对话 + 输入框
- **完整模式**（可切换）：480×600，resizable，流式输出，完整对话历史

## 交互设计

### 触发
- 点击宠物 → 打开紧凑模式聊天窗口，定位在宠物右侧
- 如 AI 未配置 → 窗口显示"请先在 AI 设置中配置 API Key" + 打开设置按钮

### 模式切换
- 紧凑模式标题栏 `⤡` 按钮 → 切换到完整模式（480×600，resizable，居中）
- 完整模式 `⤢` 按钮 → 收缩回紧凑模式（340×440，non-resizable，回到宠物旁）
- 关闭窗口 → 下次打开恢复默认紧凑模式

### 输入
- Enter 发送，Shift+Enter 换行
- 发送中禁用输入框
- 发送后输入框清空，列表追加用户消息 + AI 占位消息

### 流式输出（完整模式）
- Rust `chat_with_pet_stream` 命令使用 SSE streaming
- 通过 `emit_to("chat", "chat-stream-token", token)` 推送每个 token
- 前端逐 token 拼接，更新 AI 消息占位符内容
- 紧凑模式：非流式，loading 动画后一次性显示

### 错误处理
- 网络/API 错误 → 占位符替换为红色错误消息
- 未配置 AI → 显示引导提示

## 数据流

```
点击宠物 → open_chat_window(Rust) → 创建/定位窗口 → chat窗口显示
  → invoke load_chat_history → 渲染对话列表

用户输入发送 → addToHistory(user)→SQLite
  → invoke chat_with_pet(紧凑) / chat_with_pet_stream(完整)
  → DeepSeek API
  → 紧凑: 一次性返回 / 完整: emit chat-stream-token 逐token
  → addToHistory(assistant)→SQLite
```

## 窗口定位

- 紧凑模式：宠物右侧。获取 main 窗口位置，chat 窗口 x = 宠物 x + 宠物宽 + 8px 间隙
- 贴近屏幕边缘时自动翻转到左侧
- 宠物拖拽时聊天窗口不跟随

## UI 风格

- 深色主题（Catppuccin 色系），与 AI 设置窗口一致
- 消息气泡：用户蓝色/宠物绿色
- 输入区：圆角输入框 + 渐变色发送按钮
- 标题栏：宠物名 + 展开/关闭按钮

## 文件清单

| 文件 | 动作 |
|------|------|
| `chat.html` | 新建 — 聊天窗口 HTML+CSS |
| `src/chat-main.ts` | 新建 — 聊天窗口逻辑 |
| `src-tauri/src/lib.rs` | 新增 `open_chat_window`、`chat_with_pet_stream` 命令 |
| `src-tauri/src/ai.rs` | 新增 `chat_stream` 流式请求函数 |
| `src/app.ts` | 点击宠物改为 `invoke('open_chat_window')` |
| `vite.config.ts` | 添加 `chat.html` 构建入口 |
| `src-tauri/capabilities/default.json` | 添加 `chat` 窗口权限 |

## 数据库

复用现有 SQLite 表 `chat_history`，无需新增表。
