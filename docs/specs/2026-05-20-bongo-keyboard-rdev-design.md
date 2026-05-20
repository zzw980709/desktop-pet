# Spec: rdev 键盘监听替代 CGEventTap

## 目标

用 `rdev` 库替换 macOS 专属的 CGEventTap 三线程键盘监听架构，实现跨平台（macOS + Windows + Linux）键盘输入 → bongo 动画的完整链路。保留 QWERTY 左右分区分类器，保留所有现有功能（CC hooks、多宠物、精灵图渲染、交互系统）。

## 架构

### 之前（CGEventTap）

```
CGEventTap thread (C callback, atomic stores)
      ↓
Key poller thread (500µs poll, classify_keycode)
      ↓
Forwarder thread (emit "bongo-tap")
```

- 3 个线程，265 行，仅 macOS
- C 回调只能做 atomic store，分类和 emit 必须在 Rust 线程

### 之后（rdev）

```
rdev::listen thread (KeyPress → classify_key → emit "bongo-tap")
```

- 1 个线程，43 行，跨平台
- rdev 内部封装了 CGEventTap(macOS) / Windows hooks / evdev(Linux)

### 数据流

```
物理键盘 → rdev::listen → Event::KeyPress(key)
  → classifier::classify_key(&key) → Option<BongoSide>
  → emit("bongo-tap", { side: Left|Right })
  → frontend app.ts → animator.play(bongo-left|bongo-right)
```

## 变更清单

| 操作 | 文件 | 说明 |
|------|------|------|
| 新增 | `src-tauri/src/bongo/keyboard.rs` | rdev 键盘监听器，对标 BongoCat `device.rs` 模式 |
| 重写 | `src-tauri/src/bongo/classifier.rs` | CGKeyCode → rdev::Key，返回 `Option<BongoSide>` |
| 删除 | `src-tauri/src/bongo/monitor.rs` | 旧 CGEventTap 三线程代码 |
| 更新 | `src-tauri/src/bongo/mod.rs` | 暴露 keyboard 模块 |
| 更新 | `src-tauri/src/lib.rs` | 移除 BongoMonitor/set_bongo_active/open_accessibility_settings，新增 retry_keyboard_listening 命令，修复 HOOK_EVENTS 事件名 |
| 更新 | `src-tauri/Cargo.toml` | 新增 `rdev = "0.5"` |
| 新增 | `src-tauri/tauri.windows.conf.json` | Windows NSIS 安装器配置 |
| 新增 | `src-tauri/tauri.linux.conf.json` | Linux deb/rpm 打包配置 |
| 更新 | `src-tauri/tauri.conf.json` | 跨平台 bundle targets，窗口配置对齐 |
| 更新 | `src-tauri/capabilities/default.json` | 跨平台窗口权限 |
| 更新 | `src/app.ts` | retryBongo 调用 retry_keyboard_listening |

## keyboard.rs 设计

```rust
static IS_LISTENING: AtomicBool; // 防重入

pub fn start_keyboard_listening(app_handle: AppHandle) -> Result<(), String> {
    // 检查 IS_LISTENING，已启动则直接返回 Ok
    // 设 IS_LISTENING = true
    // 直接调用 rdev::listen(callback)  // 阻塞直到出错
    // callback: KeyPress → classify_key() → emit("bongo-tap")
    // 出错时设 IS_LISTENING = false
}
```

**注意：** 必须使用原版 `rdev = "0.5"`（crates.io），不能使用 kunkunsh 等 fork。原版用 `CFRunLoopGetCurrent()` 在当前线程 run loop 上添加事件源并阻塞，fork 改用 `CFRunLoopGetMain()` 会导致事件源和 run loop 在不同线程，`CFRunLoopRun()` 立即返回。

**调用方式：** `start_keyboard_listening` 会阻塞调用线程。`setup_app` 通过 `std::thread::spawn` 在后台线程中调用；`retry_keyboard_listening` 同理。不能直接在 UI 线程调用。

启动方式：
- `setup_app` 中通过 `std::thread::spawn` 自动启动
- 前端 `retryBongo` 菜单调用 `retry_keyboard_listening` 命令（重试）

## classifier.rs 设计

```rust
pub fn classify_key(key: &Key) -> Option<BongoSide>
```

- 左区：Q/W/E/R/T, A/S/D/F/G, Z/X/C/V/B + Left modifiers
- 右区：Y, H, U/I/O/P, J/K/L, N/M + Right modifiers
- 未分类按键（数字、空格、功能键等）：返回 `None`，前端忽略
- `Key::Alt`（Option 键）归入左区（rdev 在 macOS 上不区分左右 Alt）

## CC Hook 事件名修复

`lib.rs` 中 `HOOK_EVENTS` 常量之前使用无效的事件名。修复为：

| 之前（无效） | 之后（有效） | pet 事件 |
|-------------|-------------|----------|
| `after-tool-invoke` | `PostToolUse` | tool-calling |
| `before-permission-request` | `PermissionRequest` | waiting |
| `after-compaction` | `PostCompact` | context-compacted |
| `after-session-finish` | `SessionEnd` | completion |
| `after-model-request` | *(移除)* | - |

## 边界

- **Always**: rdev 权限不足时静默失败（`tracing::warn!`），不影响应用正常运行
- **Ask first**: 无
- **Never**: 在前端执行按键分类（保持在 Rust 侧，保证性能）
- 旧 `monitor.rs` 代码完全删除，不保留兼容层
