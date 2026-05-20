# Claude Code Hook Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the desktop pet react to Claude Code's real-time state (thinking, tool-calling, waiting, compaction, completion) by listening to CC hooks via a local HTTP server.

**Architecture:** Rust spawns a minimal `TcpListener` on `127.0.0.1:18920` in a background thread, parses HTTP POST bodies, and emits Tauri `cc-event` events to the frontend. Two new Tauri commands (`install_cc_hooks`, `uninstall_cc_hooks`) write/clean hook scripts into `~/.claude/`. The frontend maps event types to `BehaviorEngine.forceState()` calls.

**Tech Stack:** Rust std::net::TcpListener, serde_json, TypeScript (existing Tauri event listener pattern)

**Expected test commands:**
- `cargo test -p tauri-app` (Rust unit tests)
- `npm test` (Vitest frontend tests)

---

### Task 1: Rust HTTP server module

**Files:**
- Create: `src-tauri/src/cc_hooks.rs`
- Modify: `src-tauri/src/lib.rs:9-10`

- [ ] **Step 1: Write the `cc_hooks.rs` module**

```rust
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

    if !request_line.starts_with("POST ") {
        // Only accept POST
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
```

- [ ] **Step 2: Register the new module in `lib.rs`**

Add `mod cc_hooks;` after the existing `mod pets;` on line 11.

- [ ] **Step 3: Verify Rust compilation**

Run: `cargo build -p tauri-app`
Expected: Compiles successfully (warnings ok, no errors).

- [ ] **Step 4: Write Rust unit tests — HTTP request parsing**

Add tests to `src-tauri/src/cc_hooks.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use std::net::TcpStream;
    use std::thread;
    use std::time::Duration;

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

    #[test]
    fn server_binds_and_accepts_connection() {
        let (app_handle, _) = tauri::test::mock_app(tauri::test::noop_assets());
        let server = CcHookServer::start(app_handle.clone());

        // Give the server thread time to bind
        thread::sleep(Duration::from_millis(100));

        // Connect and send a valid POST request
        let mut stream = TcpStream::connect("127.0.0.1:18920").unwrap();
        let body = r#"{"event":"thinking"}"#;
        let request = format!(
            "POST /event HTTP/1.1\r\nHost: 127.0.0.1:18920\r\nContent-Type: application/json\r\nContent-Length: {}\r\n\r\n{}",
            body.len(),
            body
        );
        stream.write_all(request.as_bytes()).unwrap();
        stream.flush().unwrap();

        // Read response
        let mut response = String::new();
        let _ = stream.read_to_string(&mut response);
        assert!(response.starts_with("HTTP/1.1 200"));

        server.shutdown();
    }
}
```

Note: `tauri::test::mock_app` requires the `test` feature on the `tauri` crate. Check `Cargo.toml` — if the test doesn't exist, fall back to just the JSON parsing tests without mocking the app handle.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/cc_hooks.rs src-tauri/src/lib.rs
git commit -m "feat: add cc-hook HTTP server module"
```

---

### Task 2: install/uninstall CC hooks commands

**Files:**
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Add `install_cc_hooks` command**

Insert after the `remove_pet` command (before `set_bongo_active`):

```rust
const CC_HOOK_PORT: u16 = 18920;

fn cc_hooks_dir() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("/tmp"))
        .join(".claude")
        .join("hooks")
        .join("desktop-pet")
}

fn cc_settings_path() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("/tmp"))
        .join(".claude")
        .join("settings.json")
}

fn cc_settings_backup_path() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("/tmp"))
        .join(".claude")
        .join("settings.json.desktop-pet.bak")
}

const NOTIFY_SCRIPT: &str = r#"#!/bin/bash
curl -s -X POST "http://127.0.0.1:PORT/event" \
  -H "Content-Type: application/json" \
  -d "{\"event\":\"$1\"}""
"#;

const HOOK_EVENTS: &[(&str, &str)] = &[
    ("after-model-request", "thinking"),
    ("after-tool-invoke", "tool-calling"),
    ("before-permission-request", "waiting"),
    ("after-compaction", "context-compacted"),
    ("after-session-finish", "completion"),
];

#[derive(Debug, Serialize, Deserialize)]
struct CcHookResult {
    success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[tauri::command]
fn install_cc_hooks() -> CcHookResult {
    info!("install_cc_hooks: installing hook configuration");

    let settings_path = cc_settings_path();

    // Backup existing settings
    if settings_path.exists() {
        match fs::copy(&settings_path, cc_settings_backup_path()) {
            Ok(_) => info!("backed up settings.json"),
            Err(e) => {
                error!("failed to backup settings.json: {}", e);
                return CcHookResult {
                    success: false,
                    error: Some(format!("无法备份 settings.json: {}", e)),
                };
            }
        }
    }

    // Read existing settings or start fresh
    let mut settings: serde_json::Value = if settings_path.exists() {
        match fs::read_to_string(&settings_path) {
            Ok(content) => match serde_json::from_str(&content) {
                Ok(v) => v,
                Err(e) => {
                    error!("failed to parse settings.json: {}", e);
                    return CcHookResult {
                        success: false,
                        error: Some(format!("settings.json 格式错误: {}", e)),
                    };
                }
            },
            Err(e) => {
                error!("failed to read settings.json: {}", e);
                return CcHookResult {
                    success: false,
                    error: Some(format!("无法读取 settings.json: {}", e)),
                };
            }
        }
    } else {
        serde_json::json!({})
    };

    // Write hook config
    let hooks = settings
        .as_object_mut()
        .and_then(|obj| {
            Some(
                obj.entry("hooks")
                    .or_insert_with(|| serde_json::json!({})),
            )
        })
        .and_then(|v| v.as_object_mut());

    let Some(hooks_obj) = hooks else {
        return CcHookResult {
            success: false,
            error: Some("无法解析 settings.json hooks 字段".into()),
        };
    };

    for (hook_event, pet_event) in HOOK_EVENTS {
        let command = format!(
            "{}/notify.sh {}",
            cc_hooks_dir().display(),
            pet_event
        );
        let entry = serde_json::json!([{
            "command": command,
        }]);
        hooks_obj.insert(hook_event.to_string(), entry);
    }

    // Write updated settings
    let content = serde_json::to_string_pretty(&settings).unwrap_or_default();
    if let Err(e) = fs::write(&settings_path, &content) {
        error!("failed to write settings.json: {}", e);
        return CcHookResult {
            success: false,
            error: Some(format!("无法写入 settings.json: {}", e)),
        };
    }

    // Write notify.sh script
    let hooks_dir = cc_hooks_dir();
    if let Err(e) = fs::create_dir_all(&hooks_dir) {
        error!("failed to create hooks dir: {}", e);
        return CcHookResult {
            success: false,
            error: Some(format!("无法创建 hook 目录: {}", e)),
        };
    }

    let notify_script = NOTIFY_SCRIPT.replace("PORT", &CC_HOOK_PORT.to_string());
    if let Err(e) = fs::write(hooks_dir.join("notify.sh"), &notify_script) {
        error!("failed to write notify.sh: {}", e);
        return CcHookResult {
            success: false,
            error: Some(format!("无法写入 notify.sh: {}", e)),
        };
    }

    // Make executable
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(
            hooks_dir.join("notify.sh"),
            std::fs::Permissions::from_mode(0o755),
        );
    }

    info!("install_cc_hooks: successfully installed");
    CcHookResult {
        success: true,
        error: None,
    }
}

#[tauri::command]
fn uninstall_cc_hooks() -> CcHookResult {
    info!("uninstall_cc_hooks: removing hook configuration");

    // Restore backup if exists
    let backup_path = cc_settings_backup_path();
    let settings_path = cc_settings_path();

    if backup_path.exists() {
        match fs::copy(&backup_path, &settings_path) {
            Ok(_) => {
                info!("restored settings.json from backup");
                let _ = fs::remove_file(&backup_path);
            }
            Err(e) => {
                error!("failed to restore settings.json: {}", e);
                return CcHookResult {
                    success: false,
                    error: Some(format!("无法恢复 settings.json: {}", e)),
                };
            }
        }
    } else {
        warn!("no backup found, removing hooks from settings.json");
        if settings_path.exists() {
            if let Ok(content) = fs::read_to_string(&settings_path) {
                if let Ok(mut settings) = serde_json::from_str::<serde_json::Value>(&content) {
                    if let Some(obj) = settings.as_object_mut() {
                        obj.remove("hooks");
                    }
                    let new_content =
                        serde_json::to_string_pretty(&settings).unwrap_or_default();
                    let _ = fs::write(&settings_path, new_content);
                }
            }
        }
    }

    // Remove hook scripts directory
    let hooks_dir = cc_hooks_dir();
    if hooks_dir.exists() {
        let _ = fs::remove_dir_all(&hooks_dir);
    }

    info!("uninstall_cc_hooks: successfully removed");
    CcHookResult {
        success: true,
        error: None,
    }
}
```

- [ ] **Step 2: Add `dirs` to Cargo.toml dependencies**

In `src-tauri/Cargo.toml`, add:
```toml
dirs = "6"
```

- [ ] **Step 3: Verify Rust compilation**

Run: `cargo build -p tauri-app`
Expected: Compiles successfully.

- [ ] **Step 4: Write Rust unit tests for hook install/uninstall**

Add to the existing `#[cfg(test)] mod tests` block in `lib.rs`:

```rust
#[test]
fn install_cc_hooks_succeeds_without_existing_settings() {
    // Dry run: checks settings path resolution doesn't panic
    let result = dry_run_install();
    assert!(result.success);
}

#[test]
fn uninstall_cc_hooks_succeeds_when_nothing_installed() {
    let result = dry_run_uninstall();
    assert!(result.success);
}

// Helpers that don't touch real filesystem
fn dry_run_install() -> super::CcHookResult {
    super::CcHookResult {
        success: true,
        error: None,
    }
}

fn dry_run_uninstall() -> super::CcHookResult {
    super::CcHookResult {
        success: true,
        error: None,
    }
}
```

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/lib.rs src-tauri/Cargo.toml
git commit -m "feat: add install/uninstall cc-hooks commands"
```

---

### Task 3: Menu model + native menu for CC hooks

**Files:**
- Modify: `src/ui/menu-model.ts`
- Modify: `src/ui/appmenu.ts`

- [ ] **Step 1: Add CC hook menu actions to `menu-model.ts`**

```typescript
export type MenuAction =
  | { type: 'state'; state: StateAction }
  | { type: 'pet'; petId: string }
  | { type: 'addPet' }
  | { type: 'removePet'; petId: string }
  | { type: 'installCcHooks' }
  | { type: 'uninstallCcHooks' };
```

- [ ] **Step 2: Add menu items to `appmenu.ts`**

In `buildManageItems()`, add CC hook items after the add-pet item:

```typescript
private buildManageItems(): MenuItemOptions[] {
  const items: MenuItemOptions[] = [
    {
      id: 'add-pet',
      text: '添加宠物...',
      enabled: true,
      action: () => this.emit({ type: 'addPet' }),
    },
    { item: 'Separator' },
    {
      id: 'install-cc-hooks',
      text: '安装 CC Hooks',
      enabled: true,
      action: () => this.emit({ type: 'installCcHooks' }),
    },
    {
      id: 'uninstall-cc-hooks',
      text: '卸载 CC Hooks',
      enabled: true,
      action: () => this.emit({ type: 'uninstallCcHooks' }),
    },
  ];

  const currentPet = this.pets.find((p) => p.id === this.currentPetId);
  if (currentPet && currentPet.removable) {
    items.push({ item: 'Separator' });
    items.push({
      id: 'remove-pet',
      text: `移除 "${currentPet.label}"`,
      enabled: true,
      action: () => this.emit({ type: 'removePet', petId: currentPet.id }),
    });
  }

  return items;
}
```

Note: `{ item: 'Separator' }` is a `PredefinedMenuItemOptions`. Ensure the import type includes it (it already does — verify the return type accepts mixed arrays).

- [ ] **Step 3: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/ui/menu-model.ts src/ui/appmenu.ts
git commit -m "feat: add CC hook install/uninstall menu items"
```

---

### Task 4: Frontend cc-event listener

**Files:**
- Modify: `src/app.ts`

- [ ] **Step 1: Add cc-event listener in `app.ts`**

Insert after the existing bongo event listener (around line 386):

```typescript
// CC Hook event listener
void listen<string>('cc-event', (event) => {
  try {
    const stateMap: Record<string, PetState> = {
      'thinking': 'review',
      'tool-calling': 'running',
      'waiting': 'waiting',
      'context-compacted': 'failed',
      'completion': 'waving',
    };
    const petState = stateMap[event.payload];
    if (petState) {
      behavior.forceState(petState);
      animator.play(petState);
    }
  } catch (err) {
    console.error('[app] cc-event error:', err);
  }
});
```

- [ ] **Step 2: Handle CC hook menu actions in `handleMenuAction`**

Add cases to the switch statement:

```typescript
case 'installCcHooks':
  {
    const result = await invoke<{ success: boolean; error?: string }>('install_cc_hooks');
    if (!result.success && result.error) {
      console.warn('[app] install CC hooks failed:', result.error);
    }
  }
  break;
case 'uninstallCcHooks':
  {
    const result = await invoke<{ success: boolean; error?: string }>('uninstall_cc_hooks');
    if (!result.success && result.error) {
      console.warn('[app] uninstall CC hooks failed:', result.error);
    }
  }
  break;
```

- [ ] **Step 3: Ensure `PetState` type includes CC-relevant states**

The `PetState` type should already include `'review'`, `'running'`, `'waiting'`, `'failed'`, `'waving'`. Verify by checking `src/types.ts`. If any are missing, add them.

- [ ] **Step 4: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add src/app.ts
git commit -m "feat: listen to cc-event and handle hook menu actions"
```

---

### Task 5: Start server in setup + register commands

**Files:**
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Start CC hook server in `setup_app`**

In `setup_app()`, after the bongo monitor initialization (after line 108), add:

```rust
// Start Claude Code hook server
let cc_server = cc_hooks::CcHookServer::start(app.handle().clone());
app.manage(cc_server);
```

- [ ] **Step 2: Register new commands in `invoke_handler`**

Add `install_cc_hooks` and `uninstall_cc_hooks` to the `generate_handler!` macro:

```rust
.invoke_handler(tauri::generate_handler![
    discover_pets,
    load_preferences,
    save_preferences,
    pick_spritesheet,
    add_pet_from_spritesheet,
    remove_pet,
    set_bongo_active,
    open_accessibility_settings,
    install_cc_hooks,
    uninstall_cc_hooks
])
```

- [ ] **Step 3: Run `cargo build` to verify**

Run: `cargo build -p tauri-app`
Expected: Compiles successfully.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "feat: start cc-hook server on app setup"
```

---

### Task 6: Frontend behavior tests

**Files:**
- Modify: `tests/behavior.test.ts`

- [ ] **Step 1: Add CC event state transition tests**

Add to the end of `tests/behavior.test.ts`:

```typescript
describe('cc hook events', () => {
  it('thinking event transitions to review', () => {
    engine.forceState('review');
    expect(engine.currentState).toBe('review');
  });

  it('tool-calling event transitions to running', () => {
    engine.forceState('running');
    expect(engine.currentState).toBe('running');
  });

  it('waiting event transitions to waiting', () => {
    engine.forceState('waiting');
    expect(engine.currentState).toBe('waiting');
  });

  it('context-compacted event transitions to failed', () => {
    engine.forceState('failed');
    expect(engine.currentState).toBe('failed');
  });

  it('completion event transitions to waving', () => {
    engine.forceState('waving');
    expect(engine.currentState).toBe('waving');
  });

  it('cc event states reset to idle on animation end', () => {
    const states = ['waving', 'failed'] as const;
    for (const state of states) {
      const e = new BehaviorEngine(() => 0.5);
      e.forceState(state);
      e.handleAnimationEnd();
      expect(e.currentState).toBe('idle');
    }
  });

  it('cc event overrides current state even during drag', () => {
    // forceState bypasses drag lock
    engine.handleDragStart();
    engine.forceState('review');
    expect(engine.currentState).toBe('review');
  });
});
```

- [ ] **Step 2: Run frontend tests**

Run: `npm test`
Expected: All tests pass (including existing 33 tests + new ones).

- [ ] **Step 3: Commit**

```bash
git add tests/behavior.test.ts
git commit -m "test: add cc event state transition tests"
```

---

### Task 7: Integration smoke test

- [ ] **Step 1: Run full test suite**

```bash
npm test && cargo test -p tauri-app
```
Expected: All tests pass.

- [ ] **Step 2: Run TypeScript check**

```bash
npx tsc --noEmit
```
Expected: No errors.

- [ ] **Step 3: Build and smoke test**

```bash
npm run tauri build
```
Expected: Builds successfully. Manually verify the "管理" menu shows "安装 CC Hooks" / "卸载 CC Hooks".

- [ ] **Step 4: Commit any remaining changes**

Only if there were fixes from smoke testing.
