# Claude Code Hook Integration Design

## Objective

让桌面宠物通过 Claude Code hooks 实时感知 CC 的状态变化（思考、调用工具、等待授权、上下文压缩、任务完成），并同步切换对应动画。

## Architecture

```
Claude Code hooks    curl POST       Rust HTTP Server    Tauri event     Frontend
─────────────── →  127.0.0.1:18920 →  (cc_hooks.rs)    → "cc-event" → BehaviorEngine
                                                                        → animator.play()
```

- Rust 后端在 `127.0.0.1:18920` 起一个阻塞式 TCP listener（std::net，零外部依赖）
- CC hook 配置和脚本由菜单操作自动写入/清理 `~/.claude/`
- 前端监听 `cc-event` Tauri event，映射到 BehaviorEngine 状态切换

## Event → Animation Mapping

| CC Hook Event | CC 触发时机 | 宠物动画 |
|--------------|-----------|---------|
| `after-model-request` | 模型开始思考 | `review` |
| `after-tool-invoke` | 工具调用完成 | `running` |
| `before-permission-request` | 等待用户授权 | `waiting` |
| `after-compaction` | 上下文压缩 | `failed` |
| `after-session-finish` | 会话结束 | `waving` |

动画播完后自动回到 `idle`（复用现有 `RESET_TO_IDLE_ON_END` 机制，超时 4s 兜底）。

## Hook 脚本

```bash
# ~/.claude/hooks/desktop-pet/notify.sh
#!/bin/bash
curl -s -X POST "http://127.0.0.1:18920/event" \
  -H "Content-Type: application/json" \
  -d "{\"event\":\"$1\"}"
```

## settings.json 配置

在 `~/.claude/settings.json` 的 `hooks` 字段下注册每个事件。安装前备份原文件到 `settings.json.desktop-pet.bak`，卸载时恢复。

## HTTP Server

- **文件**: `src-tauri/src/cc_hooks.rs`
- **端口**: `18920`（硬编码），仅 bind `127.0.0.1`
- **依赖**: `std::net::TcpListener` + `serde_json`，零外部 crate
- **JSON**: `{"event": "thinking"}`
- **生命周期**: `setup()` 中启动，app 退出时线程自动终止
- **安全**: 仅本地回环，外部不可达

## Menu

Native macOS menu 新增两项：
- **安装 CC Hooks** — 备份 settings.json，写入 hook 配置和 notify.sh
- **卸载 CC Hooks** — 恢复备份，清理 hook 目录

对应两个 Tauri command: `install_cc_hooks` / `uninstall_cc_hooks`。

## Frontend Changes

`app.ts` 中新增 `cc-event` 监听器，收到事件后调用 `behavior.forceState()` 切换到对应动画。

## Files

| 操作 | 文件 |
|------|------|
| 新增 | `src-tauri/src/cc_hooks.rs` |
| 修改 | `src-tauri/src/lib.rs` — 注册 commands、启动 server |
| 修改 | `src/app.ts` — 监听 `cc-event`、映射状态 |
| 修改 | `src/ui/menu-model.ts` — 新增安装/卸载菜单项 |
| 修改 | `tests/behavior.test.ts` — CC 事件状态切换测试 |
