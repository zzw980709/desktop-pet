# Bongo Keyboard rdev 迁移 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用 rdev 库替换 macOS 专属的 CGEventTap 三线程键盘监听架构，实现跨平台键盘输入 → bongo 动画链路。

**Architecture:** 单个 rdev::listen 后台线程替代原有的三线程架构。KeyPress 事件 → classify_key() 分类 → emit("bongo-tap")。新增 Windows/Linux Tauri 配置，修复 CC hook 事件名。

**Tech Stack:** Rust (rdev 0.5), Tauri v2, TypeScript

---

## 文件结构

| 文件 | 职责 |
|------|------|
| `src-tauri/src/bongo/keyboard.rs` (新增) | rdev 键盘监听器，start_keyboard_listening() + 防重入标志位 |
| `src-tauri/src/bongo/classifier.rs` (重写) | QWERTY 左右分区，rdev::Key → Option<BongoSide> |
| `src-tauri/src/bongo/mod.rs` (更新) | 模块导出 |
| `src-tauri/src/bongo/monitor.rs` (删除) | 旧 CGEventTap 三线程代码 |
| `src-tauri/src/lib.rs` (更新) | 命令注册、setup、HOOK_EVENTS 修复 |
| `src-tauri/Cargo.toml` (更新) | 新增 rdev 依赖 |
| `src-tauri/tauri.conf.json` (更新) | 跨平台 bundle targets |
| `src-tauri/tauri.windows.conf.json` (新增) | Windows NSIS 配置 |
| `src-tauri/tauri.linux.conf.json` (新增) | Linux deb/rpm 配置 |
| `src-tauri/capabilities/default.json` (更新) | 跨平台权限 |
| `src/app.ts` (更新) | retryBongo 命令调用 |

---

### Task 1: 新增 rdev 依赖

**Files:**
- Modify: `src-tauri/Cargo.toml`

- [ ] **Step 1: 添加 rdev 依赖**

在 `[dependencies]` 末尾添加：

```toml
rdev = "0.5"
```

- [ ] **Step 2: 验证依赖解析**

```bash
cd src-tauri && cargo check
```

Expected: 下载 rdev 及其依赖，编译通过。

- [ ] **Step 3: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "chore: add rdev 0.5 dependency for cross-platform keyboard monitoring"
```

---

### Task 2: 重写 classifier.rs（rdev::Key 分类器）

**Files:**
- Modify: `src-tauri/src/bongo/classifier.rs`

- [ ] **Step 1: 重写 classifier.rs**

用 rdev::Key 枚举替换 macOS CGKeyCode：

```rust
use rdev::Key;

/// Left or right hand zone based on QWERTY touch-typing finger assignment.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
pub enum BongoSide {
    Left,
    Right,
}

/// Classify an rdev Key as left-hand or right-hand zone.
/// Unrecognised keys return None (frontend ignores them).
pub fn classify_key(key: &Key) -> Option<BongoSide> {
    Some(match key {
        // Left hand zone
        Key::KeyQ
        | Key::KeyW
        | Key::KeyE
        | Key::KeyR
        | Key::KeyT
        | Key::KeyA
        | Key::KeyS
        | Key::KeyD
        | Key::KeyF
        | Key::KeyG
        | Key::KeyZ
        | Key::KeyX
        | Key::KeyC
        | Key::KeyV
        | Key::KeyB
        | Key::ShiftLeft
        | Key::ControlLeft
        | Key::Alt
        | Key::MetaLeft => BongoSide::Left,

        // Right hand zone
        Key::KeyY
        | Key::KeyH
        | Key::KeyU
        | Key::KeyI
        | Key::KeyO
        | Key::KeyP
        | Key::KeyJ
        | Key::KeyK
        | Key::KeyL
        | Key::KeyN
        | Key::KeyM
        | Key::ShiftRight
        | Key::ControlRight
        | Key::MetaRight => BongoSide::Right,

        // Numbers, symbols, space, function keys — not classified
        _ => return None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn left_keys() {
        assert_eq!(classify_key(&Key::KeyA), Some(BongoSide::Left));
        assert_eq!(classify_key(&Key::KeyQ), Some(BongoSide::Left));
        assert_eq!(classify_key(&Key::KeyB), Some(BongoSide::Left));
    }

    #[test]
    fn right_keys() {
        assert_eq!(classify_key(&Key::KeyJ), Some(BongoSide::Right));
        assert_eq!(classify_key(&Key::KeyY), Some(BongoSide::Right));
        assert_eq!(classify_key(&Key::KeyM), Some(BongoSide::Right));
    }

    #[test]
    fn left_modifiers() {
        assert_eq!(classify_key(&Key::ShiftLeft), Some(BongoSide::Left));
        assert_eq!(classify_key(&Key::MetaLeft), Some(BongoSide::Left));
        assert_eq!(classify_key(&Key::Alt), Some(BongoSide::Left));
    }

    #[test]
    fn right_modifiers() {
        assert_eq!(classify_key(&Key::ShiftRight), Some(BongoSide::Right));
        assert_eq!(classify_key(&Key::MetaRight), Some(BongoSide::Right));
    }

    #[test]
    fn unclassified_returns_none() {
        assert_eq!(classify_key(&Key::Space), None);
        assert_eq!(classify_key(&Key::Escape), None);
        assert_eq!(classify_key(&Key::Num0), None);
    }
}
```

- [ ] **Step 2: 运行 classifier 测试**

```bash
cargo test bongo::classifier
```

Expected: 5 tests PASS.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/bongo/classifier.rs
git commit -m "refactor: rewrite classifier with rdev::Key for cross-platform key mapping"
```

---

### Task 3: 新增 keyboard.rs（rdev 键盘监听器）

**Files:**
- Create: `src-tauri/src/bongo/keyboard.rs`

- [ ] **Step 1: 创建 keyboard.rs**

```rust
use rdev::{listen, Event, EventType};
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Emitter};

use super::classifier::{classify_key, BongoSide};

static IS_LISTENING: AtomicBool = AtomicBool::new(false);

#[derive(Debug, Clone, serde::Serialize)]
struct BongoTapEvent {
    side: BongoSide,
}

/// Start global keyboard listening via rdev.
///
/// Idempotent — if already listening, returns Ok immediately.
/// Spawns a background thread that runs the rdev event loop and emits
/// "bongo-tap" events to the frontend for each classified key press.
pub fn start_keyboard_listening(app_handle: AppHandle) -> Result<(), String> {
    if IS_LISTENING.load(Ordering::SeqCst) {
        return Ok(());
    }

    IS_LISTENING.store(true, Ordering::SeqCst);

    std::thread::spawn(move || {
        let callback = move |event: Event| {
            if let EventType::KeyPress(key) = event.event_type {
                if let Some(side) = classify_key(&key) {
                    let _ = app_handle.emit("bongo-tap", BongoTapEvent { side });
                }
            }
        };

        if let Err(err) = listen(callback) {
            tracing::warn!("keyboard listening stopped: {:?}", err);
            IS_LISTENING.store(false, Ordering::SeqCst);
        }
    });

    Ok(())
}
```

- [ ] **Step 2: 验证编译**

```bash
cd src-tauri && cargo check
```

Expected: 编译通过。

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/bongo/keyboard.rs
git commit -m "feat: add rdev-based keyboard listener replacing CGEventTap"
```

---

### Task 4: 更新 bongo/mod.rs 并删除 monitor.rs

**Files:**
- Modify: `src-tauri/src/bongo/mod.rs`
- Delete: `src-tauri/src/bongo/monitor.rs`

- [ ] **Step 1: 更新 mod.rs**

```rust
pub mod classifier;
pub mod keyboard;

pub use keyboard::start_keyboard_listening;
```

- [ ] **Step 2: 删除旧 monitor.rs**

```bash
rm src-tauri/src/bongo/monitor.rs
```

- [ ] **Step 3: 验证编译**

```bash
cd src-tauri && cargo check
```

Expected: monitor.rs 的缺失不导致编译错误。

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/bongo/mod.rs
git rm src-tauri/src/bongo/monitor.rs
git commit -m "refactor: replace bongo monitor module with keyboard module"
```

---

### Task 5: 更新 lib.rs（集成、命令、HOOK_EVENTS）

**Files:**
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: 更新 import**

删除 `use bongo::BongoMonitor;`，新增 `use bongo::start_keyboard_listening;`：

```rust
use bongo::start_keyboard_listening;
```

- [ ] **Step 2: 更新 setup_app**

替换 BongoMonitor 初始化：

```rust
// 之前:
// let bongo_monitor = BongoMonitor::new(app.handle().clone());
// if let Err(e) = bongo_monitor.set_active(true) { ... }
// app.manage(bongo_monitor);

// 之后:
if let Err(e) = start_keyboard_listening(app.handle().clone()) {
    warn!("keyboard listening failed to start: {}", e);
}
```

- [ ] **Step 3: 修复 HOOK_EVENTS 事件名**

```rust
const HOOK_EVENTS: &[(&str, &str)] = &[
    ("PostToolUse", "tool-calling"),
    ("PermissionRequest", "waiting"),
    ("PostCompact", "context-compacted"),
    ("SessionEnd", "completion"),
];
```

注意：移除了 `("after-model-request", "thinking")` —— Claude Code 没有对应的有效事件。移除 `("after-tool-invoke", ...)`、`("before-permission-request", ...)`、`("after-compaction", ...)`、`("after-session-finish", ...)`，全部替换为有效事件名。

- [ ] **Step 4: 删除 set_bongo_active 和 open_accessibility_settings 命令**

删除这两个函数及其全部代码。

- [ ] **Step 5: 新增 retry_keyboard_listening 命令**

在 `uninstall_cc_hooks` 函数之后、`run()` 函数之前添加：

```rust
#[tauri::command]
fn retry_keyboard_listening(app_handle: tauri::AppHandle) -> Result<(), String> {
    start_keyboard_listening(app_handle)
}
```

- [ ] **Step 6: 更新 invoke_handler**

```rust
.invoke_handler(tauri::generate_handler![
    discover_pets,
    load_preferences,
    save_preferences,
    pick_spritesheet,
    add_pet_from_spritesheet,
    remove_pet,
    install_cc_hooks,
    uninstall_cc_hooks,
    retry_keyboard_listening
])
```

- [ ] **Step 7: 运行全部测试**

```bash
cargo test
```

Expected: 17 tests PASS（含 classifier 5 个、cc_hooks 3 个、pets 4 个、lib 4 个、legacy set_bongo_active 相关测试已随函数移除）。

- [ ] **Step 8: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "feat: integrate rdev keyboard listener, fix CC hook event names"
```

---

### Task 6: 更新 Tauri 配置（跨平台）

**Files:**
- Modify: `src-tauri/tauri.conf.json`
- Create: `src-tauri/tauri.windows.conf.json`
- Create: `src-tauri/tauri.linux.conf.json`
- Modify: `src-tauri/capabilities/default.json`

- [ ] **Step 1: 更新 tauri.conf.json**

window 配置增加 cross-platform 选项：

```json
"windows": [
  {
    "label": "main",
    "title": "Desktop Pet",
    "width": 64,
    "height": 64,
    "transparent": true,
    "shadow": false,
    "decorations": false,
    "alwaysOnTop": true,
    "resizable": false,
    "visible": true,
    "skipTaskbar": true,
    "acceptFirstMouse": true,
    "maximizable": false
  }
],
```

bundle 更新为跨平台 targets：

```json
"bundle": {
  "active": true,
  "category": "Entertainment",
  "targets": ["nsis", "dmg", "app", "appimage", "deb", "rpm"],
  "shortDescription": "Desktop Pet",
  "icon": [...]
}
```

- [ ] **Step 2: 创建 tauri.windows.conf.json**

```json
{
  "identifier": "com.desktop-pet.app",
  "bundle": {
    "windows": {
      "digestAlgorithm": "sha256",
      "nsis": {
        "languages": ["English", "SimpChinese"],
        "installMode": "both",
        "displayLanguageSelector": true
      }
    }
  }
}
```

- [ ] **Step 3: 创建 tauri.linux.conf.json**

```json
{
  "identifier": "com.desktop-pet.app",
  "bundle": {
    "linux": {
      "deb": { "depends": [] },
      "rpm": { "depends": [] }
    }
  }
}
```

- [ ] **Step 4: 更新 capabilities/default.json**

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Capability for the main window",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "opener:default",
    "dialog:default",
    "core:window:allow-set-position",
    "core:window:allow-cursor-position",
    "core:window:allow-start-dragging",
    "core:window:allow-set-size",
    "core:window:allow-set-always-on-top",
    "core:window:allow-set-ignore-cursor-events",
    "core:window:allow-set-decorations"
  ]
}
```

- [ ] **Step 5: Commit**

```bash
git add src-tauri/tauri.conf.json src-tauri/tauri.windows.conf.json src-tauri/tauri.linux.conf.json src-tauri/capabilities/default.json
git commit -m "feat: add cross-platform Tauri configs (Windows NSIS, Linux deb/rpm)"
```

---

### Task 7: 更新前端 app.ts

**Files:**
- Modify: `src/app.ts`

- [ ] **Step 1: 更新 retryBongo handler**

```typescript
case 'retryBongo':
  {
    try {
      await invoke('retry_keyboard_listening');
    } catch (err) {
      console.warn('[app] retry bongo failed:', err);
    }
  }
  break;
```

- [ ] **Step 2: 验证 TypeScript 编译**

```bash
npx tsc --noEmit
```

Expected: 零错误。

- [ ] **Step 3: 运行前端测试**

```bash
npm test
```

Expected: 79 tests PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app.ts
git commit -m "fix: update retryBongo to use retry_keyboard_listening command"
```

---

## 验证检查清单

- [ ] `cargo check` — Rust 编译通过
- [ ] `cargo test` — 17/17 Rust 测试通过
- [ ] `npx tsc --noEmit` — TypeScript 类型检查通过
- [ ] `npm test` — 79/79 前端测试通过
- [ ] 键盘监听在 macOS 上正常触发（需辅助功能权限）
- [ ] `retryBongo` 菜单项重新启动监听
- [ ] CC hooks 安装使用有效事件名
- [ ] 精灵图动画（bongo-left/bongo-right）正常播放
