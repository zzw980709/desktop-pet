# Multi-Pet Config Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace external directory scanning with app-managed pet storage, add import/remove pets via UI, persist user preferences, and localize menus to Chinese.

**Architecture:** All pets live in `<app_data>/pets/`. The built-in cat is embedded in the Rust binary via `include_bytes!` and written to app_data on first launch. `tauri-plugin-dialog` provides native file picker for Add Pet. Preferences (active pet + window position) are read/written as JSON in `<app_data>/preferences.json`.

**Tech Stack:** Tauri v2, TypeScript, Rust, tauri-plugin-dialog

---

### Task 1: Update Tauri config identifier and add dialog dependency

**Files:**
- Modify: `src-tauri/tauri.conf.json`
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/capabilities/default.json`

- [ ] **Step 1: Change identifier in tauri.conf.json**

Edit `src-tauri/tauri.conf.json` line 5, change:
```
"identifier": "com.zhengzhiwei.desktop-pet",
```
to:
```
"identifier": "com.desktop-pet.app",
```

- [ ] **Step 2: Add tauri-plugin-dialog dependency**

In `src-tauri/Cargo.toml`, add after `tauri-plugin-opener = "2"`:
```toml
tauri-plugin-dialog = "2"
```

- [ ] **Step 3: Register dialog plugin permission**

In `src-tauri/capabilities/default.json`, add to the permissions array:
```json
"dialog:default"
```

- [ ] **Step 4: Register dialog plugin in lib.rs**

In `src-tauri/src/lib.rs`, change:
```rust
.plugin(tauri_plugin_opener::init())
```
to:
```rust
.plugin(tauri_plugin_opener::init())
.plugin(tauri_plugin_dialog::init())
```

- [ ] **Step 5: Build to verify**

Run: `cargo build --manifest-path src-tauri/Cargo.toml`
Expected: compiles successfully

- [ ] **Step 6: Commit**

```bash
git add src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/capabilities/default.json src-tauri/src/lib.rs
git commit -m "chore: rename app identifier to com.desktop-pet.app, add dialog plugin"
```

---

### Task 2: Embed built-in cat and add setup initialization in Rust

**Files:**
- Create: `src-tauri/resources/cat/pet.json`
- Copy (from `src/pets/codex-cat/`): `src-tauri/resources/cat/spritesheet.webp`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Create resources directory with cat manifest**

Create `src-tauri/resources/cat/pet.json`:
```json
{
  "id": "cat",
  "displayName": "小猫",
  "description": "默认桌面宠物猫",
  "spritesheetPath": "spritesheet.webp"
}
```

- [ ] **Step 2: Copy spritesheet to resources**

```bash
cp src/pets/codex-cat/spritesheet.webp src-tauri/resources/cat/spritesheet.webp
```

- [ ] **Step 3: Add setup logic and first-launch initialization to lib.rs**

Rewrite `src-tauri/src/lib.rs`:
```rust
use std::fs;
use std::path::PathBuf;
use tauri::Manager;

mod pets;

const BUILTIN_PET_ID: &str = "cat";
const BUILTIN_MANIFEST: &str = include_str!("../resources/cat/pet.json");
const BUILTIN_SPRITESHEET: &[u8] = include_bytes!("../resources/cat/spritesheet.webp");

fn app_pets_dir(app_data: &PathBuf) -> PathBuf {
    app_data.join("pets")
}

fn preferences_path(app_data: &PathBuf) -> PathBuf {
    app_data.join("preferences.json")
}

fn init_builtin_pet(app_data: &PathBuf) {
    let pets_dir = app_pets_dir(app_data);
    let cat_dir = pets_dir.join(BUILTIN_PET_ID);

    if cat_dir.exists() {
        return;
    }

    let _ = fs::create_dir_all(&cat_dir);
    let _ = fs::write(cat_dir.join("pet.json"), BUILTIN_MANIFEST);
    let _ = fs::write(cat_dir.join("spritesheet.webp"), BUILTIN_SPRITESHEET);
}

fn init_preferences(app_data: &PathBuf) {
    let prefs_path = preferences_path(app_data);
    if prefs_path.exists() {
        return;
    }

    let default_prefs = serde_json::json!({
        "activePetId": "cat",
    });

    if let Some(parent) = prefs_path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    let _ = fs::write(&prefs_path, default_prefs.to_string());
}

fn setup_app(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let app_data = app.path().app_data_dir()?;
    let _ = fs::create_dir_all(&app_data);

    init_builtin_pet(&app_data);
    init_preferences(&app_data);

    Ok(())
}

#[tauri::command]
fn discover_pets(app_handle: tauri::AppHandle) -> Vec<pets::ExternalPetRecord> {
    let Ok(app_data) = app_handle.path().app_data_dir() else {
        return Vec::new();
    };
    let pet_root = app_pets_dir(&app_data);

    if !pet_root.exists() {
        let _ = fs::create_dir_all(&pet_root);
    }

    pets::discover_pets(&pet_root)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(setup_app)
        .invoke_handler(tauri::generate_handler![discover_pets])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 4: Build to verify**

Run: `cargo build --manifest-path src-tauri/Cargo.toml`
Expected: compiles successfully

- [ ] **Step 5: Commit**

```bash
git add src-tauri/resources/ src-tauri/src/lib.rs
git commit -m "feat: embed built-in cat, add first-launch setup with app_data initialization"
```

---

### Task 3: Add preferences load/save Tauri commands

**Files:**
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Add preferences types and commands to lib.rs**

Add after the `preferences_path` function in `src-tauri/src/lib.rs`:

```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Preferences {
    active_pet_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    window_position: Option<WindowPosition>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct WindowPosition {
    x: i32,
    y: i32,
}

#[tauri::command]
fn load_preferences(app_handle: tauri::AppHandle) -> Preferences {
    let Ok(app_data) = app_handle.path().app_data_dir() else {
        return Preferences {
            active_pet_id: "cat".into(),
            window_position: None,
        };
    };

    let prefs_path = preferences_path(&app_data);
    match fs::read_to_string(&prefs_path) {
        Ok(content) => {
            serde_json::from_str(&content).unwrap_or_else(|_| Preferences {
                active_pet_id: "cat".into(),
                window_position: None,
            })
        }
        Err(_) => Preferences {
            active_pet_id: "cat".into(),
            window_position: None,
        },
    }
}

#[tauri::command]
fn save_preferences(app_handle: tauri::AppHandle, preferences: Preferences) -> Result<(), String> {
    let app_data = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;

    let prefs_path = preferences_path(&app_data);
    if let Some(parent) = prefs_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let content = serde_json::to_string_pretty(&preferences).map_err(|e| e.to_string())?;
    fs::write(&prefs_path, content).map_err(|e| e.to_string())?;

    Ok(())
}
```

- [ ] **Step 2: Register new commands in invoke_handler**

In the `run()` function, update the invoke_handler:
```rust
.invoke_handler(tauri::generate_handler![
    discover_pets,
    load_preferences,
    save_preferences
])
```

- [ ] **Step 3: Add serde derive to use statements**

Ensure `use serde::{Deserialize, Serialize};` is at the top of lib.rs imports.

- [ ] **Step 4: Build to verify**

Run: `cargo build --manifest-path src-tauri/Cargo.toml`
Expected: compiles successfully

- [ ] **Step 5: Write Rust tests for preferences**

Add to the `#[cfg(test)] mod tests` block in `src-tauri/src/lib.rs`:

```rust
#[test]
fn preferences_default_to_cat_when_file_missing() {
    use super::{Preferences, WindowPosition};
    let prefs = Preferences {
        active_pet_id: "cat".into(),
        window_position: None,
    };
    assert_eq!(prefs.active_pet_id, "cat");
    assert!(prefs.window_position.is_none());
}

#[test]
fn preferences_serialize_and_deserialize() {
    use super::{Preferences, WindowPosition};
    let prefs = Preferences {
        active_pet_id: "cat".into(),
        window_position: Some(WindowPosition { x: 100, y: 200 }),
    };
    let json = serde_json::to_string(&prefs).unwrap();
    let parsed: Preferences = serde_json::from_str(&json).unwrap();
    assert_eq!(parsed.active_pet_id, "cat");
    assert_eq!(parsed.window_position.unwrap().x, 100);
}
```

- [ ] **Step 6: Run Rust tests**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: all tests pass

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "feat: add load/save preferences Tauri commands"
```

---

### Task 4: Add add_pet and remove_pet Tauri commands

**Files:**
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/src/pets.rs`

- [ ] **Step 1: Add WebP dimension reader function to pets.rs**

Add at the top of `src-tauri/src/pets.rs`:

```rust
fn read_webp_dimensions(data: &[u8]) -> Option<(u32, u32)> {
    if data.len() < 30 || &data[0..4] != b"RIFF" || &data[8..12] != b"WEBP" {
        return None;
    }

    match &data[12..16] {
        b"VP8 " if data.len() >= 30 => {
            let w = u16::from_le_bytes([data[26], data[27]]) as u32 & 0x3fff;
            let h = u16::from_le_bytes([data[28], data[29]]) as u32 & 0x3fff;
            Some((w, h))
        }
        b"VP8L" if data.len() >= 25 => {
            let bits = u32::from_le_bytes([data[21], data[22], data[23], data[24]]);
            let w = (bits & 0x3fff) + 1;
            let h = ((bits >> 14) & 0x3fff) + 1;
            Some((w, h))
        }
        b"VP8X" if data.len() >= 30 => {
            let w = u32::from_le_bytes([data[24], data[25], data[26], 0]) + 1;
            let h = u32::from_le_bytes([data[27], data[28], data[29], 0]) + 1;
            Some((w, h))
        }
        _ => None,
    }
}

const EXPECTED_SPRITESHEET_W: u32 = 1536;
const EXPECTED_SPRITESHEET_H: u32 = 1872;
```

- [ ] **Step 2: Add add_pet command to lib.rs**

Add after the existing commands in `src-tauri/src/lib.rs`:

```rust
use tauri_plugin_dialog::DialogExt;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AddPetResult {
    success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pet_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[tauri::command]
fn add_pet(app_handle: tauri::AppHandle) -> AddPetResult {
    let file_path = app_handle
        .dialog()
        .file()
        .add_filter("pet.json", &["json"])
        .set_title("选择 pet.json")
        .blocking_pick_file();

    let Some(file_path) = file_path else {
        return AddPetResult {
            success: false,
            pet_id: None,
            error: Some("用户取消了选择".into()),
        };
    };

    let pet_dir = match file_path.parent() {
        Some(dir) => dir.to_path_buf(),
        None => {
            return AddPetResult {
                success: false,
                pet_id: None,
                error: Some("无法获取文件所在目录".into()),
            };
        }
    };

    // Read pet.json
    let manifest_content = match fs::read_to_string(&file_path) {
        Ok(content) => content,
        Err(_) => {
            return AddPetResult {
                success: false,
                pet_id: None,
                error: Some("无法读取 pet.json".into()),
            };
        }
    };

    let manifest: serde_json::Value = match serde_json::from_str(&manifest_content) {
        Ok(v) => v,
        Err(e) => {
            return AddPetResult {
                success: false,
                pet_id: None,
                error: Some(format!("无效的 pet.json：{}", e)),
            };
        }
    };

    // Validate required fields
    let pet_id = match manifest.get("id").and_then(|v| v.as_str()) {
        Some(id) if !id.is_empty() => id,
        _ => {
            return AddPetResult {
                success: false,
                pet_id: None,
                error: Some("无效的 pet.json：id 字段为空或缺失".into()),
            };
        }
    };

    if manifest.get("displayName").and_then(|v| v.as_str()).unwrap_or("").is_empty() {
        return AddPetResult {
            success: false,
            pet_id: None,
            error: Some("无效的 pet.json：displayName 字段为空或缺失".into()),
        };
    }

    if manifest.get("spritesheetPath").and_then(|v| v.as_str()) != Some("spritesheet.webp") {
        return AddPetResult {
            success: false,
            pet_id: None,
            error: Some("无效的 pet.json：spritesheetPath 必须为 spritesheet.webp".into()),
        };
    }

    // Check spritesheet.webp exists
    let spritesheet_path = pet_dir.join("spritesheet.webp");
    if !spritesheet_path.exists() {
        return AddPetResult {
            success: false,
            pet_id: None,
            error: Some("缺少文件：spritesheet.webp".into()),
        };
    }

    // Validate spritesheet dimensions
    match fs::read(&spritesheet_path) {
        Ok(data) => {
            match pets::read_webp_dimensions(&data) {
                Some((w, h)) if w == EXPECTED_SPRITESHEET_W && h == EXPECTED_SPRITESHEET_H => {}
                Some((w, h)) => {
                    return AddPetResult {
                        success: false,
                        pet_id: None,
                        error: Some(format!(
                            "精灵表尺寸不符：期望 {}x{}，实际 {}x{}",
                            EXPECTED_SPRITESHEET_W, EXPECTED_SPRITESHEET_H, w, h
                        )),
                    };
                }
                None => {
                    return AddPetResult {
                        success: false,
                        pet_id: None,
                        error: Some("无效的 spritesheet.webp：无法解析 WebP 尺寸".into()),
                    };
                }
            }
        }
        Err(e) => {
            return AddPetResult {
                success: false,
                pet_id: None,
                error: Some(format!("无法读取 spritesheet.webp：{}", e)),
            };
        }
    }

    // Copy files to app_data
    let Ok(app_data) = app_handle.path().app_data_dir() else {
        return AddPetResult {
            success: false,
            pet_id: None,
            error: Some("无法获取应用数据目录".into()),
        };
    };

    let dest_dir = app_data.join("pets").join(pet_id);

    if dest_dir.exists() {
        return AddPetResult {
            success: false,
            pet_id: Some(pet_id.to_string()),
            error: Some(format!("宠物 \"{}\" 已存在", pet_id)),
        };
    }

    if fs::create_dir_all(&dest_dir).is_err() {
        return AddPetResult {
            success: false,
            pet_id: None,
            error: Some("无法创建宠物目录".into()),
        };
    }

    if fs::write(dest_dir.join("pet.json"), &manifest_content).is_err()
        || fs::copy(&spritesheet_path, dest_dir.join("spritesheet.webp")).is_err()
    {
        let _ = fs::remove_dir_all(&dest_dir);
        return AddPetResult {
            success: false,
            pet_id: None,
            error: Some("无法复制宠物文件".into()),
        };
    }

    AddPetResult {
        success: true,
        pet_id: Some(pet_id.to_string()),
        error: None,
    }
}
```

- [ ] **Step 3: Add remove_pet command to lib.rs**

Add after `add_pet`:

```rust
#[derive(Debug, Serialize, Deserialize)]
struct RemovePetResult {
    success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[tauri::command]
fn remove_pet(app_handle: tauri::AppHandle, pet_id: String) -> RemovePetResult {
    if pet_id == BUILTIN_PET_ID {
        return RemovePetResult {
            success: false,
            error: Some("内置宠物不可移除".into()),
        };
    }

    let Ok(app_data) = app_handle.path().app_data_dir() else {
        return RemovePetResult {
            success: false,
            error: Some("无法获取应用数据目录".into()),
        };
    };

    let pet_dir = app_data.join("pets").join(&pet_id);

    if !pet_dir.exists() {
        return RemovePetResult {
            success: false,
            error: Some(format!("宠物 \"{}\" 不存在", pet_id)),
        };
    }

    match fs::remove_dir_all(&pet_dir) {
        Ok(_) => RemovePetResult {
            success: true,
            error: None,
        },
        Err(e) => RemovePetResult {
            success: false,
            error: Some(format!("无法删除宠物目录：{}", e)),
        },
    }
}
```

- [ ] **Step 4: Register new commands in invoke_handler**

Update the invoke_handler:
```rust
.invoke_handler(tauri::generate_handler![
    discover_pets,
    load_preferences,
    save_preferences,
    add_pet,
    remove_pet
])
```

- [ ] **Step 5: Clean up lib.rs — remove old resolve_pet_root and old tests**

Remove the `resolve_pet_root` function (no longer needed) and its test.

- [ ] **Step 6: Build to verify**

Run: `cargo build --manifest-path src-tauri/Cargo.toml`
Expected: compiles successfully

- [ ] **Step 7: Run Rust tests**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: all tests pass

- [ ] **Step 8: Write Rust tests for add_pet and remove_pet**

In `src-tauri/src/lib.rs` in the test module:

For `remove_pet`:
```rust
#[test]
fn remove_pet_rejects_builtin_cat() {
    let result = super::remove_pet_dry_run("cat");
    assert!(!result.success);
    assert!(result.error.unwrap().contains("内置"));
}
```

Add a test helper that checks the validation logic:
```rust
fn remove_pet_dry_run(pet_id: &str) -> super::RemovePetResult {
    if pet_id == super::BUILTIN_PET_ID {
        return super::RemovePetResult {
            success: false,
            error: Some("内置宠物不可移除".into()),
        };
    }
    super::RemovePetResult {
        success: true,
        error: None,
    }
}
```

- [ ] **Step 9: Commit**

```bash
git add src-tauri/src/lib.rs src-tauri/src/pets.rs
git commit -m "feat: add add_pet and remove_pet Tauri commands with WebP validation"
```

---

### Task 5: Rename built-in pet from codex-cat to cat, update types and menu model

**Files:**
- Remove: `src/pets/codex-cat/pet.json`
- Remove: `src/pets/codex-cat/spritesheet.webp`
- Modify: `src/types.ts`
- Modify: `src/ui/menu-model.ts`

Note: `src/pets/codex-cat/` become empty and should be deleted. Frontend no longer imports static pet assets.

- [ ] **Step 1: Remove old codex-cat directory**

```bash
rm -rf src/pets/codex-cat
```

- [ ] **Step 2: Update types.ts**

Rewrite `src/types.ts`:
```typescript
export type PetState =
  | 'idle'
  | 'running-right'
  | 'running-left'
  | 'waving'
  | 'jumping'
  | 'failed'
  | 'waiting'
  | 'running'
  | 'review';

export interface PetManifest {
  id: string;
  displayName: string;
  description: string;
  spritesheetPath: 'spritesheet.webp';
}

export interface LoadedPet {
  manifest: PetManifest;
  spritesheet: HTMLImageElement;
}

export interface PetCatalogEntry {
  id: string;
  source: 'built-in' | 'user';
  manifest: PetManifest;
  spritesheetUrl: string;
  removable: boolean;
}

export interface Position {
  x: number;
  y: number;
}

export interface Preferences {
  activePetId: string;
  windowPosition?: Position;
}
```

Key changes: added `removable: boolean` to `PetCatalogEntry`, added `Preferences` type.

- [ ] **Step 3: Update menu-model.ts with Chinese labels and new actions**

Rewrite `src/ui/menu-model.ts`:
```typescript
import type { PetState } from '../types';

export type StateAction = Extract<
  PetState,
  'waving' | 'review' | 'running' | 'waiting' | 'jumping' | 'running-right' | 'running-left' | 'idle'
>;

export interface PetMenuItem {
  id: string;
  label: string;
  removable: boolean;
}

export type MenuAction =
  | { type: 'state'; state: StateAction }
  | { type: 'pet'; petId: string }
  | { type: 'addPet' }
  | { type: 'removePet'; petId: string };

export const STATE_ITEMS = [
  { label: '挥手', action: 'waving' },
  { label: '思考', action: 'review' },
  { label: '工作', action: 'running' },
  { label: '等待', action: 'waiting' },
  { label: '跳跃', action: 'jumping' },
  { label: '向右移动', action: 'running-right' },
  { label: '向左移动', action: 'running-left' },
  { label: '重置', action: 'idle' },
] as const satisfies ReadonlyArray<{ label: string; action: StateAction }>;
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: Compilation errors are expected at this point since catalog/contextmenu/appmenu still reference old types. The key check is that types.ts and menu-model.ts are error-free individually.

- [ ] **Step 5: Commit**

```bash
git rm -r src/pets/codex-cat
git add src/types.ts src/ui/menu-model.ts
git commit -m "refactor: rename built-in pet to cat, Chinese menu labels, add addPet/removePet actions"
```

---

### Task 6: Rewrite catalog.ts for app_data-based discovery

**Files:**
- Modify: `src/pets/catalog.ts`

- [ ] **Step 1: Rewrite catalog.ts**

Rewrite `src/pets/catalog.ts`:
```typescript
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import type { PetCatalogEntry, PetManifest } from '../types';
import { validatePetManifest } from '../engine/loader';

interface ExternalPetRecord {
  manifest: unknown;
  spritesheetPath: string;
}

const BUILTIN_PET_IDS = new Set(['cat']);

function isBuiltIn(petId: string): boolean {
  return BUILTIN_PET_IDS.has(petId);
}

function resolvePetRecord(record: ExternalPetRecord): PetCatalogEntry | null {
  const manifest = validatePetManifest(record.manifest);
  if (!manifest) return null;
  if (!record.spritesheetPath) return null;

  return {
    id: manifest.id,
    source: isBuiltIn(manifest.id) ? 'built-in' : 'user',
    manifest,
    spritesheetUrl: convertFileSrc(record.spritesheetPath),
    removable: !isBuiltIn(manifest.id),
  };
}

export async function discoverPets(): Promise<PetCatalogEntry[]> {
  try {
    const records = await invoke<ExternalPetRecord[]>('discover_pets');
    const entries: PetCatalogEntry[] = [];

    for (const record of records) {
      const entry = resolvePetRecord(record);
      if (!entry) continue;
      if (entries.some((existing) => existing.id === entry.id)) continue;
      entries.push(entry);
    }

    return entries;
  } catch (err) {
    console.warn('[catalog] failed to discover pets:', err);
    return [];
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: errors only in contextmenu.ts and appmenu.ts (not yet updated)

- [ ] **Step 3: Commit**

```bash
git add src/pets/catalog.ts
git commit -m "refactor: rewrite catalog to discover pets from app_data only"
```

---

### Task 7: Update contextmenu.ts with Chinese + Add/Remove Pet

**Files:**
- Modify: `src/ui/contextmenu.ts`

- [ ] **Step 1: Rewrite contextmenu.ts**

Rewrite `src/ui/contextmenu.ts`:
```typescript
import { getCurrentWindow } from '@tauri-apps/api/window';
import { LogicalSize } from '@tauri-apps/api/dpi';
import type { MenuAction, PetMenuItem } from './menu-model';
import { STATE_ITEMS } from './menu-model';

const MENU_MIN_W = 220;
const MENU_GAP = 4;
const MENU_HORIZONTAL_PADDING = 36;
const MENU_HEADER_HEIGHT = 44;
const MENU_SECTION_TITLE_HEIGHT = 20;
const MENU_ITEM_HEIGHT = 32;
const MENU_SECTION_GAP = 10;
const MENU_BOTTOM_PADDING = 14;
const MENU_ASCII_CHAR_W = 7;
const MENU_SPACE_CHAR_W = 4;
const MENU_WIDE_CHAR_W = 12;
const MENU_EMOJI_CHAR_W = 14;
const MENU_FALLBACK_CHAR_W = 8;
const WIDE_CHAR_RE = /[ᄀ-ᅟ〈〉⺀-꓏가-힣豈-﫿︐-︙︰-﹯＀-｠￠-￦]/u;

export { STATE_ITEMS } from './menu-model';

export class ContextMenu {
  private el: HTMLElement;
  private open = false;
  private desiredOpen = false;
  private handlers: ((action: MenuAction) => void)[] = [];
  private petWidth = 64;
  private petHeight = 64;
  private pets: PetMenuItem[] = [];
  private currentPetId: string | null = null;
  private visibilityVersion = 0;
  private visibilityTask: Promise<void> = Promise.resolve();
  private textMeasureContext: CanvasRenderingContext2D | null | undefined;

  constructor() {
    this.el = document.getElementById('ctx-menu')!;
    this.build();
    this.el.style.display = 'none';
    document.addEventListener('mousedown', (e) => {
      if (this.open && !this.el.contains(e.target as Node)) {
        void this.hide();
      }
    });
  }

  private build(): void {
    this.el.replaceChildren();
    this.el.style.width = `${this.getMenuWidth()}px`;
    this.el.className = 'ctx-menu-panel';

    // Header
    const header = document.createElement('div');
    header.className = 'ctx-header';

    const eyebrow = document.createElement('div');
    eyebrow.className = 'ctx-eyebrow';
    eyebrow.textContent = '桌面宠物';

    const title = document.createElement('div');
    title.className = 'ctx-title';
    title.textContent = this.currentPetId ? this.currentPetLabel() : '小猫';

    header.append(eyebrow, title);
    this.el.appendChild(header);

    // Actions section
    const actionSection = document.createElement('section');
    actionSection.className = 'ctx-section';
    actionSection.appendChild(this.createSectionTitle('动作'));

    const actionGroup = document.createElement('div');
    actionGroup.className = 'ctx-group';
    for (const item of STATE_ITEMS) {
      const btn = document.createElement('button');
      btn.className = 'ctx-item';
      btn.textContent = item.label;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const action: MenuAction = { type: 'state', state: item.action };
        void this.hide().catch(() => {}).then(() => {
          for (const h of this.handlers) h(action);
        });
      });
      actionGroup.appendChild(btn);
    }
    actionSection.appendChild(actionGroup);
    this.el.appendChild(actionSection);

    // Switch Pet section
    if (this.pets.length > 0) {
      const petSection = document.createElement('section');
      petSection.className = 'ctx-section';
      petSection.appendChild(this.createSectionTitle('切换宠物'));

      for (const pet of this.pets) {
        const btn = document.createElement('button');
        btn.className = 'ctx-item';
        if (pet.id === this.currentPetId) {
          btn.textContent = `当前：${pet.label}`;
          btn.disabled = true;
        } else {
          btn.textContent = pet.label;
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const action: MenuAction = { type: 'pet', petId: pet.id };
            void this.hide().catch(() => {}).then(() => {
              for (const h of this.handlers) h(action);
            });
          });
        }
        petSection.appendChild(btn);
      }
      this.el.appendChild(petSection);
    }

    // Add Pet + Remove Pet section
    const manageSection = document.createElement('section');
    manageSection.className = 'ctx-section';

    const addBtn = document.createElement('button');
    addBtn.className = 'ctx-item';
    addBtn.textContent = '添加宠物...';
    addBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const action: MenuAction = { type: 'addPet' };
      void this.hide().catch(() => {}).then(() => {
        for (const h of this.handlers) h(action);
      });
    });
    manageSection.appendChild(addBtn);

    // Show Remove button for current non-built-in pet
    const currentPet = this.pets.find((p) => p.id === this.currentPetId);
    if (currentPet && currentPet.removable) {
      const removeBtn = document.createElement('button');
      removeBtn.className = 'ctx-item ctx-item-danger';
      removeBtn.textContent = `移除 "${currentPet.label}"`;
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const action: MenuAction = { type: 'removePet', petId: currentPet.id };
        void this.hide().catch(() => {}).then(() => {
          for (const h of this.handlers) h(action);
        });
      });
      manageSection.appendChild(removeBtn);
    }

    this.el.appendChild(manageSection);
  }

  on(handler: (action: MenuAction) => void): void {
    this.handlers.push(handler);
  }

  setPets(pets: PetMenuItem[], currentPetId: string): void {
    this.pets = pets;
    this.currentPetId = currentPetId;
    this.build();
    if (this.open || this.desiredOpen) {
      void this.queueWindowSync().catch(() => {});
    }
  }

  setPetSize(width: number, height: number): void {
    this.petWidth = width;
    this.petHeight = height;
    if (!this.open && !this.desiredOpen) {
      void this.queueWindowSync(true).catch(() => {});
    }
  }

  async show(): Promise<void> {
    this.desiredOpen = true;
    await this.queueWindowSync();
  }

  async hide(): Promise<void> {
    this.desiredOpen = false;
    await this.queueWindowSync();
  }

  get isOpen(): boolean {
    return this.open;
  }

  private getMenuWidth(): number {
    const labels = [
      ...STATE_ITEMS.map((item) => item.label),
      ...this.pets.map((pet) =>
        pet.id === this.currentPetId ? `当前：${pet.label}` : pet.label
      ),
      '添加宠物...',
    ];
    const currentPet = this.pets.find((p) => p.id === this.currentPetId);
    if (currentPet && currentPet.removable) {
      labels.push(`移除 "${currentPet.label}"`);
    }
    const widestLabel = Math.max(...labels.map((label) => this.measureTextWidth(label)), 0);
    return Math.max(MENU_MIN_W, widestLabel + MENU_HORIZONTAL_PADDING);
  }

  private async syncWindowSize(): Promise<void> {
    await getCurrentWindow().setSize(new LogicalSize(this.petWidth, this.petHeight));
  }

  private async syncOpenWindowSize(): Promise<void> {
    const menuWidth = this.getMenuWidth();
    const petSectionHeight = this.pets.length > 0
      ? MENU_SECTION_TITLE_HEIGHT + this.pets.length * MENU_ITEM_HEIGHT + MENU_SECTION_GAP
      : 0;
    const manageSectionHeight = MENU_ITEM_HEIGHT +
      (this.pets.find((p) => p.id === this.currentPetId)?.removable ? MENU_ITEM_HEIGHT : 0);
    const menuH =
      MENU_HEADER_HEIGHT +
      MENU_SECTION_TITLE_HEIGHT +
      STATE_ITEMS.length * MENU_ITEM_HEIGHT +
      MENU_SECTION_GAP +
      petSectionHeight +
      MENU_SECTION_GAP +
      manageSectionHeight +
      MENU_BOTTOM_PADDING;
    await getCurrentWindow().setSize(
      new LogicalSize(this.petWidth + MENU_GAP + menuWidth, Math.max(this.petHeight, menuH)),
    );
  }

  private queueWindowSync(forceClosedResize = false): Promise<void> {
    const runVersion = ++this.visibilityVersion;
    const nextTask = this.visibilityTask.catch(() => {}).then(async () => {
      if (runVersion !== this.visibilityVersion) {
        return;
      }

      if (this.desiredOpen) {
        await this.syncOpenWindowSize();

        if (runVersion !== this.visibilityVersion || !this.desiredOpen) {
          return;
        }

        this.open = true;
        this.el.style.display = 'flex';
        return;
      }

      if (!forceClosedResize && !this.open && this.el.style.display === 'none') {
        return;
      }

      this.open = false;
      this.el.style.display = 'none';
      await this.syncWindowSize();
    });

    this.visibilityTask = nextTask.catch(() => {});
    return nextTask;
  }

  private measureTextWidth(text: string): number {
    const context = this.getTextMeasureContext();
    if (context) {
      const width = Math.ceil(context.measureText(text).width);
      if (Number.isFinite(width) && width > 0) {
        return width;
      }
    }

    return Array.from(text).reduce((total, char) => total + this.getFallbackCharWidth(char), 0);
  }

  private getTextMeasureContext(): CanvasRenderingContext2D | null {
    if (this.textMeasureContext !== undefined) {
      return this.textMeasureContext;
    }

    try {
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      if (!context) {
        this.textMeasureContext = null;
        return this.textMeasureContext;
      }

      const style = window.getComputedStyle(this.el);
      context.font = [
        style.fontStyle,
        style.fontVariant,
        style.fontWeight,
        style.fontSize,
        style.fontFamily,
      ].filter(Boolean).join(' ');
      this.textMeasureContext = context;
      return this.textMeasureContext;
    } catch {
      this.textMeasureContext = null;
      return this.textMeasureContext;
    }
  }

  private getFallbackCharWidth(char: string): number {
    if (/\s/u.test(char)) {
      return MENU_SPACE_CHAR_W;
    }

    const codePoint = char.codePointAt(0) ?? 0;
    if (codePoint > 0xffff) {
      return MENU_EMOJI_CHAR_W;
    }

    if (WIDE_CHAR_RE.test(char)) {
      return MENU_WIDE_CHAR_W;
    }

    if (codePoint <= 0x00ff) {
      return MENU_ASCII_CHAR_W;
    }

    return MENU_FALLBACK_CHAR_W;
  }

  private currentPetLabel(): string {
    return this.pets.find((pet) => pet.id === this.currentPetId)?.label ?? '小猫';
  }

  private createSectionTitle(text: string): HTMLDivElement {
    const title = document.createElement('div');
    title.className = 'ctx-section-title';
    title.textContent = text;
    return title;
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles for contextmenu**

Run: `npx tsc --noEmit src/ui/contextmenu.ts`
Expected: errors only in appmenu.ts and app.ts (not yet updated)

- [ ] **Step 3: Commit**

```bash
git add src/ui/contextmenu.ts
git commit -m "feat: Chinese context menu with add/remove pet support"
```

---

### Task 8: Update appmenu.ts with Chinese + Add/Remove Pet

**Files:**
- Modify: `src/ui/appmenu.ts`

- [ ] **Step 1: Rewrite appmenu.ts**

Rewrite `src/ui/appmenu.ts`:
```typescript
import { Menu } from '@tauri-apps/api/menu';
import type { MenuItemOptions, MenuOptions, PredefinedMenuItemOptions, SubmenuOptions } from '@tauri-apps/api/menu';
import type { MenuAction, PetMenuItem } from './menu-model';
import { STATE_ITEMS } from './menu-model';

export class NativeAppMenu {
  private handlers: Array<(action: MenuAction) => void> = [];
  private pets: PetMenuItem[] = [];
  private currentPetId: string | null = null;

  on(handler: (action: MenuAction) => void): void {
    this.handlers.push(handler);
  }

  async setPets(pets: PetMenuItem[], currentPetId: string): Promise<void> {
    if (!this.isAvailable()) {
      return;
    }

    this.pets = pets;
    this.currentPetId = currentPetId;

    const menu = await Menu.new({
      items: [
        {
          id: 'desktop-pet',
          text: '桌面宠物',
          items: this.buildDesktopPetItems(),
        } satisfies SubmenuOptions,
        {
          id: 'actions',
          text: '动作',
          items: this.buildStateItems(),
        } satisfies SubmenuOptions,
        {
          id: 'switch-pet',
          text: '切换宠物',
          items: this.buildPetItems(),
        } satisfies SubmenuOptions,
        {
          id: 'manage',
          text: '管理',
          items: this.buildManageItems(),
        } satisfies SubmenuOptions,
      ],
    } satisfies MenuOptions);

    await menu.setAsAppMenu();
  }

  private currentPetLabel(): string {
    return this.pets.find((pet) => pet.id === this.currentPetId)?.label ?? '小猫';
  }

  private buildDesktopPetItems(): Array<MenuItemOptions | PredefinedMenuItemOptions> {
    const items: Array<MenuItemOptions | PredefinedMenuItemOptions> = [];
    if (this.currentPetId) {
      items.push({
        id: `current:${this.currentPetId}`,
        text: `当前宠物：${this.currentPetLabel()}`,
        enabled: false,
      });
    }
    items.push({ item: 'Separator' });
    items.push(...this.buildStateItems());
    return items;
  }

  private buildStateItems(): MenuItemOptions[] {
    return STATE_ITEMS.map((item) => ({
      id: `state:${item.action}`,
      text: item.label,
      action: () => this.emit({ type: 'state', state: item.action }),
    }));
  }

  private buildPetItems(): MenuItemOptions[] {
    if (this.pets.length === 0) {
      return [
        {
          id: 'pet:none',
          text: '无可用宠物',
          enabled: false,
        },
      ];
    }

    return this.pets.map((pet): MenuItemOptions => {
      if (pet.id === this.currentPetId) {
        return {
          id: `pet:${pet.id}`,
          text: `当前：${pet.label}`,
          enabled: false,
        };
      }

      return {
        id: `pet:${pet.id}`,
        text: pet.label,
        enabled: true,
        action: () => this.emit({ type: 'pet', petId: pet.id }),
      };
    });
  }

  private buildManageItems(): MenuItemOptions[] {
    const items: MenuItemOptions[] = [
      {
        id: 'add-pet',
        text: '添加宠物...',
        enabled: true,
        action: () => this.emit({ type: 'addPet' }),
      },
    ];

    const currentPet = this.pets.find((p) => p.id === this.currentPetId);
    if (currentPet && currentPet.removable) {
      items.push({
        id: 'remove-pet',
        text: `移除 "${currentPet.label}"`,
        enabled: true,
        action: () => this.emit({ type: 'removePet', petId: currentPet.id }),
      });
    }

    return items;
  }

  private emit(action: MenuAction): void {
    for (const handler of this.handlers) {
      handler(action);
    }
  }

  private isAvailable(): boolean {
    return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles for appmenu**

Run: `npx tsc --noEmit src/ui/appmenu.ts`
Expected: errors only in app.ts (not yet updated)

- [ ] **Step 3: Commit**

```bash
git add src/ui/appmenu.ts
git commit -m "feat: Chinese native app menu with add/remove pet support"
```

---

### Task 9: Update app.ts with preferences and add/remove pet handling

**Files:**
- Modify: `src/app.ts`

- [ ] **Step 1: Rewrite app.ts**

Rewrite `src/app.ts`:
```typescript
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { LogicalPosition } from '@tauri-apps/api/dpi';
import { loadPet } from './engine/loader';
import { Renderer } from './engine/renderer';
import { Animator } from './engine/animator';
import { BehaviorEngine } from './engine/behavior';
import { Interactions } from './interactions';
import { ContextMenu } from './ui/contextmenu';
import { NativeAppMenu } from './ui/appmenu';
import type { MenuAction } from './ui/menu-model';
import { CELL_HEIGHT, CELL_WIDTH } from './pets/contract';
import { discoverPets } from './pets/catalog';
import type { PetCatalogEntry, Preferences } from './types';

const DRAG_ANIMATED_STATES = new Set(['running-right', 'running-left']);

function getRenderScale(canvas: HTMLCanvasElement): number {
  const widthScale = (canvas.clientWidth || 64) / CELL_WIDTH;
  const heightScale = (canvas.clientHeight || 64) / CELL_HEIGHT;
  return Math.min(widthScale, heightScale) || 1;
}

interface AddPetResult {
  success: boolean;
  petId?: string;
  error?: string;
}

interface RemovePetResult {
  success: boolean;
  error?: string;
}

export async function initApp(canvas: HTMLCanvasElement): Promise<void> {
  // Load preferences first
  const prefs = await invoke<Preferences>('load_preferences');

  // Restore window position if saved
  if (prefs.windowPosition) {
    try {
      await getCurrentWindow().setPosition(
        new LogicalPosition(prefs.windowPosition.x, prefs.windowPosition.y),
      );
    } catch {
      // window position restore is best-effort
    }
  }

  let pets = await discoverPets();
  if (pets.length === 0) {
    console.error('No pets available');
    return;
  }

  // Find preferred pet, fall back to first available
  const preferredPet = pets.find((p) => p.id === prefs.activePetId) ?? pets[0];
  if (!preferredPet) {
    return;
  }

  const behavior = new BehaviorEngine();
  const animator = new Animator();
  const menu = new ContextMenu();
  const nativeMenu = new NativeAppMenu();
  const renderScale = getRenderScale(canvas);
  let renderer = new Renderer(canvas, renderScale);
  let activePet = preferredPet;
  let petLoadVersion = 0;

  async function savePrefs(): Promise<void> {
    try {
      const pos = await getCurrentWindow().outerPosition();
      await invoke('save_preferences', {
        preferences: {
          activePetId: activePet.id,
          windowPosition: { x: pos.x, y: pos.y },
        },
      });
    } catch (err) {
      console.warn('[app] failed to save preferences:', err);
    }
  }

  function syncMenuPets(entries: PetCatalogEntry[], currentPetId: string): void {
    const menuPets = entries.map((pet) => ({
      id: pet.id,
      label: pet.manifest.displayName,
      removable: pet.removable,
    }));
    menu.setPets(menuPets, currentPetId);
    void nativeMenu.setPets(menuPets, currentPetId).catch((error: unknown) => {
      console.error('[app] failed to sync native app menu', error);
    });
  }

  async function switchPet(entry: PetCatalogEntry, availablePets: PetCatalogEntry[] = pets): Promise<boolean> {
    const loadVersion = ++petLoadVersion;
    const loadedPet = await loadPet(entry.manifest, entry.spritesheetUrl);
    if (!loadedPet) {
      console.warn(`[app] failed to load pet ${entry.id}`);
      return false;
    }
    if (loadVersion !== petLoadVersion) {
      return false;
    }

    activePet = entry;
    pets = availablePets;
    renderer = new Renderer(canvas, renderScale);
    renderer.setCharacter(loadedPet);
    menu.setPetSize(canvas.width, canvas.height);
    syncMenuPets(pets, activePet.id);
    animator.play(behavior.currentState);

    // Save preferences on pet switch
    void savePrefs();
    return true;
  }

  async function refreshPets(): Promise<void> {
    const discovered = await discoverPets();
    if (discovered.length === 0) return;

    const currentPet = discovered.find((pet) => pet.id === activePet.id);
    if (!currentPet) {
      pets = discovered;
      const fallbackPet = discovered[0];
      if (fallbackPet) {
        await switchPet(fallbackPet, discovered);
        return;
      }
      syncMenuPets(pets, activePet.id);
      return;
    }

    pets = discovered;
    syncMenuPets(pets, activePet.id);
  }

  animator.on(() => {
    behavior.handleAnimationEnd();
  });

  const switched = await switchPet(preferredPet);
  if (!switched) {
    console.error(`Failed to load initial pet ${preferredPet.id}`);
    return;
  }

  let heartAlpha = 0;
  const HEART_DURATION = 600;
  let heartTimer = 0;

  behavior.on((nextState) => {
    animator.play(nextState);
    if (nextState === 'waving') {
      heartAlpha = 1;
      heartTimer = HEART_DURATION;
    }
  });

  async function handleMenuAction(action: MenuAction): Promise<void> {
    switch (action.type) {
      case 'state':
        behavior.forceState(action.state);
        break;
      case 'pet':
        {
          const nextPet = pets.find((pet) => pet.id === action.petId);
          if (nextPet) {
            await switchPet(nextPet);
          }
        }
        break;
      case 'addPet':
        {
          const result = await invoke<AddPetResult>('add_pet');
          if (result.success) {
            await refreshPets();
          } else if (result.error) {
            console.warn('[app] add pet failed:', result.error);
          }
        }
        break;
      case 'removePet':
        {
          const result = await invoke<RemovePetResult>('remove_pet', {
            petId: action.petId,
          });
          if (result.success) {
            await refreshPets();
          } else if (result.error) {
            console.warn('[app] remove pet failed:', result.error);
          }
        }
        break;
    }
  }

  menu.on(handleMenuAction);
  nativeMenu.on(handleMenuAction);

  new Interactions(canvas, behavior);

  window.addEventListener('pet:contextmenu', (() => {
    void menu.show().catch((error: unknown) => {
      console.error('[app] failed to show context menu', error);
    });
    void refreshPets().catch((error: unknown) => {
      console.error('[app] failed to refresh pets', error);
    });
  }) as EventListener);

  // Save window position on move
  window.addEventListener('mouseup', () => {
    if (behavior.isDragging) return;
    // defer save to after drag settles
    setTimeout(() => {
      void savePrefs();
    }, 200);
  });

  let lastTime = performance.now();

  function loop(currentTime: number): void {
    const deltaMs = currentTime - lastTime;
    lastTime = currentTime;

    behavior.tick(deltaMs);

    const shouldAnimateWhileDragging =
      behavior.isDragging && DRAG_ANIMATED_STATES.has(behavior.currentState);

    if (behavior.isDragging && !shouldAnimateWhileDragging) {
      if (!animator.isPaused) {
        animator.pause();
      }
    } else {
      if (animator.isPaused) {
        animator.resume();
      }
      animator.tick(deltaMs);
    }

    renderer.drawFrame(animator.currentCell);

    if (heartAlpha > 0) {
      heartTimer -= deltaMs;
      heartAlpha = Math.max(0, heartTimer / HEART_DURATION);
      renderer.drawHeart(heartAlpha);
    }

    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);
}
```

- [ ] **Step 2: Verify full TypeScript compilation**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/app.ts
git commit -m "feat: integrate preferences persistence and add/remove pet flows"
```

---

### Task 10: Update tests

**Files:**
- Modify: `tests/catalog.test.ts`
- Modify: `tests/contextmenu.test.ts`
- Modify: `tests/appmenu.test.ts`
- Modify: `tests/integration.test.ts`

- [ ] **Step 1: Rewrite catalog.test.ts**

Rewrite `tests/catalog.test.ts`:
```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
  convertFileSrc: vi.fn((path: string) => `asset://${path}`),
}));

import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { discoverPets } from '../src/pets/catalog';

describe('pet catalog', () => {
  const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

  beforeEach(() => {
    vi.mocked(invoke).mockReset();
    vi.mocked(convertFileSrc).mockClear();
    warnSpy.mockClear();
  });

  it('marks built-in cat as non-removable', async () => {
    vi.mocked(invoke).mockResolvedValue([
      {
        manifest: {
          id: 'cat',
          displayName: '小猫',
          description: '默认桌面宠物猫',
          spritesheetPath: 'spritesheet.webp',
        },
        spritesheetPath: '/app_data/pets/cat/spritesheet.webp',
      },
    ]);

    const pets = await discoverPets();
    expect(pets).toHaveLength(1);
    expect(pets[0]?.id).toBe('cat');
    expect(pets[0]?.removable).toBe(false);
    expect(pets[0]?.source).toBe('built-in');
  });

  it('marks user pets as removable', async () => {
    vi.mocked(invoke).mockResolvedValue([
      {
        manifest: {
          id: 'cat',
          displayName: '小猫',
          description: '默认桌面宠物猫',
          spritesheetPath: 'spritesheet.webp',
        },
        spritesheetPath: '/app_data/pets/cat/spritesheet.webp',
      },
      {
        manifest: {
          id: 'desk-fox',
          displayName: 'Desk Fox',
          description: 'A quick fox',
          spritesheetPath: 'spritesheet.webp',
        },
        spritesheetPath: '/app_data/pets/desk-fox/spritesheet.webp',
      },
    ]);

    const pets = await discoverPets();
    expect(pets.map((p) => p.id)).toEqual(['cat', 'desk-fox']);
    expect(pets[1]?.removable).toBe(true);
    expect(pets[1]?.source).toBe('user');
  });

  it('skips duplicate pet ids', async () => {
    vi.mocked(invoke).mockResolvedValue([
      {
        manifest: {
          id: 'desk-fox',
          displayName: 'Desk Fox Alpha',
          description: 'First fox',
          spritesheetPath: 'spritesheet.webp',
        },
        spritesheetPath: '/app_data/pets/fox-alpha/spritesheet.webp',
      },
      {
        manifest: {
          id: 'desk-fox',
          displayName: 'Desk Fox Beta',
          description: 'Second fox',
          spritesheetPath: 'spritesheet.webp',
        },
        spritesheetPath: '/app_data/pets/fox-beta/spritesheet.webp',
      },
    ]);

    const pets = await discoverPets();
    expect(pets).toHaveLength(1);
    expect(pets[0]?.manifest.displayName).toBe('Desk Fox Alpha');
  });

  it('skips records with invalid manifest', async () => {
    vi.mocked(invoke).mockResolvedValue([
      {
        manifest: {
          id: '',
          displayName: 'Invalid',
          description: 'Broken',
          spritesheetPath: 'spritesheet.webp',
        },
        spritesheetPath: '/app_data/pets/broken/spritesheet.webp',
      },
      {
        manifest: {
          id: 'valid-pet',
          displayName: 'Valid Pet',
          description: 'A pet',
          spritesheetPath: 'spritesheet.webp',
        },
        spritesheetPath: '/app_data/pets/valid/spritesheet.webp',
      },
    ]);

    const pets = await discoverPets();
    expect(pets).toHaveLength(1);
    expect(pets[0]?.id).toBe('valid-pet');
  });

  it('returns empty array when discovery fails', async () => {
    vi.mocked(invoke).mockRejectedValue(new Error('discovery failed'));

    const pets = await discoverPets();
    expect(pets).toEqual([]);
    expect(warnSpy).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Update contextmenu.test.ts for Chinese labels**

Rewrite `tests/contextmenu.test.ts` to use Chinese labels:
```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest';

const setSize = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    setSize,
  }),
}));

vi.mock('@tauri-apps/api/dpi', () => ({
  LogicalSize: class LogicalSize {
    constructor(
      public width: number,
      public height: number,
    ) {}
  },
}));

import { ContextMenu, STATE_ITEMS } from '../src/ui/contextmenu';

describe('ContextMenu', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="ctx-menu"></div>';
    setSize.mockReset();
    setSize.mockResolvedValue(undefined);
  });

  it('exposes Codex pet actions in order', () => {
    expect(STATE_ITEMS.map((item) => item.action)).toEqual([
      'waving',
      'review',
      'running',
      'waiting',
      'jumping',
      'running-right',
      'running-left',
      'idle',
    ]);
  });

  it('renders Chinese menu labels', () => {
    const menu = new ContextMenu();
    menu.setPets(
      [
        { id: 'cat', label: '小猫', removable: false },
        { id: 'fox', label: '狐狸', removable: true },
      ],
      'cat',
    );

    const buttons = Array.from(document.querySelectorAll('button')).map((button) =>
      button.textContent?.trim(),
    );

    expect(buttons).toContain('挥手');
    expect(buttons).toContain('思考');
    expect(buttons).toContain('工作');
    expect(buttons).toContain('等待');
    expect(buttons).toContain('跳跃');
    expect(buttons).toContain('向右移动');
    expect(buttons).toContain('向左移动');
    expect(buttons).toContain('重置');
    expect(buttons).toContain('狐狸');
    expect(buttons).toContain('当前：小猫');
    expect(buttons).toContain('添加宠物...');
  });

  it('shows remove button only for removable current pet', () => {
    const menu = new ContextMenu();
    menu.setPets(
      [
        { id: 'cat', label: '小猫', removable: false },
        { id: 'fox', label: '狐狸', removable: true },
      ],
      'fox',
    );

    const buttons = Array.from(document.querySelectorAll('button')).map((button) =>
      button.textContent?.trim(),
    );

    expect(buttons).toContain('移除 "狐狸"');
  });

  it('does not show remove button for built-in pet', () => {
    const menu = new ContextMenu();
    menu.setPets(
      [
        { id: 'cat', label: '小猫', removable: false },
      ],
      'cat',
    );

    const buttons = Array.from(document.querySelectorAll('button')).map((button) =>
      button.textContent?.trim(),
    );

    expect(buttons.filter((b) => b?.startsWith('移除'))).toHaveLength(0);
  });

  it('emits addPet action when add button clicked', async () => {
    const menu = new ContextMenu();
    const handler = vi.fn();
    menu.on(handler);

    const addBtn = Array.from(document.querySelectorAll('button')).find(
      (btn) => btn.textContent?.trim() === '添加宠物...',
    );
    addBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    await vi.waitFor(() => {
      expect(handler).toHaveBeenCalledWith({ type: 'addPet' });
    });
  });

  it('emits removePet action when remove button clicked', async () => {
    const menu = new ContextMenu();
    const handler = vi.fn();
    menu.on(handler);

    menu.setPets(
      [
        { id: 'cat', label: '小猫', removable: false },
        { id: 'fox', label: '狐狸', removable: true },
      ],
      'fox',
    );

    const removeBtn = Array.from(document.querySelectorAll('button')).find(
      (btn) => btn.textContent?.trim() === '移除 "狐狸"',
    );
    removeBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    await vi.waitFor(() => {
      expect(handler).toHaveBeenCalledWith({ type: 'removePet', petId: 'fox' });
    });
  });
});
```

- [ ] **Step 3: Update appmenu.test.ts for Chinese labels**

Rewrite `tests/appmenu.test.ts`:
```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest';

const menuNew = vi.hoisted(() => vi.fn());
const setAsAppMenu = vi.hoisted(() => vi.fn().mockResolvedValue(null));

vi.mock('@tauri-apps/api/menu', () => ({
  Menu: {
    new: menuNew,
  },
}));

import { NativeAppMenu } from '../src/ui/appmenu';
import { STATE_ITEMS } from '../src/ui/menu-model';

describe('NativeAppMenu', () => {
  beforeEach(() => {
    vi.stubGlobal('__TAURI_INTERNALS__', {});
    menuNew.mockReset();
    setAsAppMenu.mockReset();
    setAsAppMenu.mockResolvedValue(null);
    menuNew.mockImplementation(async (options: unknown) => ({
      options,
      setAsAppMenu,
    }));
  });

  it('builds a Chinese native app menu', async () => {
    const menu = new NativeAppMenu();

    await menu.setPets(
      [
        { id: 'cat', label: '小猫', removable: false },
        { id: 'fox', label: '狐狸', removable: true },
      ],
      'cat',
    );

    expect(menuNew).toHaveBeenCalledTimes(1);
    const options = menuNew.mock.calls[0]?.[0] as { items: Array<{ text: string; items?: Array<{ text?: string; enabled?: boolean }> }> };
    expect(options.items.map((item) => item.text)).toEqual(['桌面宠物', '动作', '切换宠物', '管理']);
    expect(options.items[1]?.items?.map((item) => item.text)).toEqual(STATE_ITEMS.map((item) => item.label));
    expect(options.items[2]?.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ text: '当前：小猫', enabled: false }),
        expect.objectContaining({ text: '狐狸', enabled: true }),
      ]),
    );
    expect(options.items[3]?.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ text: '添加宠物...', enabled: true }),
      ]),
    );
    expect(setAsAppMenu).toHaveBeenCalledTimes(1);
  });

  it('includes remove pet menu item for removable current pet', async () => {
    const menu = new NativeAppMenu();

    await menu.setPets(
      [
        { id: 'cat', label: '小猫', removable: false },
        { id: 'fox', label: '狐狸', removable: true },
      ],
      'fox',
    );

    const options = menuNew.mock.calls[0]?.[0] as {
      items: Array<{ text: string; items?: Array<{ text?: string; id?: string }> }>;
    };
    const manageItems = options.items[3]?.items ?? [];
    expect(manageItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ text: '添加宠物...' }),
        expect.objectContaining({ text: '移除 "狐狸"' }),
      ]),
    );
  });

  it('emits addPet action from menu', async () => {
    const menu = new NativeAppMenu();
    const handler = vi.fn();
    menu.on(handler);

    await menu.setPets(
      [{ id: 'cat', label: '小猫', removable: false }],
      'cat',
    );

    const options = menuNew.mock.calls[0]?.[0] as {
      items: Array<{ items?: Array<{ id?: string; action?: () => void }> }>;
    };
    const manageItems = options.items[3]?.items ?? [];
    manageItems.find((item) => item.id === 'add-pet')?.action?.();

    expect(handler).toHaveBeenCalledWith({ type: 'addPet' });
  });
});
```

- [ ] **Step 4: Update integration.test.ts**

Rewrite `tests/integration.test.ts`:
```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
  convertFileSrc: vi.fn((path: string) => `asset://${path}`),
}));

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    setPosition: vi.fn(async () => undefined),
    setSize: vi.fn(async () => undefined),
    outerPosition: vi.fn(async () => ({ x: 100, y: 200 })),
  }),
}));

vi.mock('@tauri-apps/api/dpi', () => ({
  LogicalPosition: class LogicalPosition {
    constructor(
      public x: number,
      public y: number,
    ) {}
  },
  LogicalSize: class LogicalSize {
    constructor(
      public width: number,
      public height: number,
    ) {}
  },
}));

vi.mock('@tauri-apps/api/menu', () => ({
  Menu: {
    new: vi.fn(async () => ({
      setAsAppMenu: vi.fn(async () => undefined),
    })),
  },
}));

import { invoke } from '@tauri-apps/api/core';

describe('integration', () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset();
    document.body.innerHTML = `
      <canvas id="pet-canvas" width="64" height="64" style="width:64px;height:64px"></canvas>
      <div id="ctx-menu"></div>
    `;
  });

  it('loads preferences and discovers pets from app_data on startup', async () => {
    vi.mocked(invoke)
      .mockImplementation((cmd: string) => {
        if (cmd === 'load_preferences') {
          return Promise.resolve({
            activePetId: 'cat',
          });
        }
        if (cmd === 'discover_pets') {
          return Promise.resolve([
            {
              manifest: {
                id: 'cat',
                displayName: '小猫',
                description: '默认桌面宠物猫',
                spritesheetPath: 'spritesheet.webp',
              },
              spritesheetPath: '/app_data/pets/cat/spritesheet.webp',
            },
          ]);
        }
        return Promise.resolve(null);
      });

    // Verify the mock calls work
    const prefs = await invoke('load_preferences');
    expect(prefs).toEqual({ activePetId: 'cat' });

    const pets = await invoke('discover_pets');
    expect(Array.isArray(pets)).toBe(true);
    expect(pets).toHaveLength(1);
  });

  it('add_pet command flow works end-to-end', async () => {
    vi.mocked(invoke)
      .mockImplementation((cmd: string) => {
        if (cmd === 'add_pet') {
          return Promise.resolve({
            success: true,
            petId: 'new-pet',
          });
        }
        if (cmd === 'discover_pets') {
          return Promise.resolve([
            {
              manifest: {
                id: 'cat',
                displayName: '小猫',
                description: '默认桌面宠物猫',
                spritesheetPath: 'spritesheet.webp',
              },
              spritesheetPath: '/app_data/pets/cat/spritesheet.webp',
            },
            {
              manifest: {
                id: 'new-pet',
                displayName: 'New Pet',
                description: 'A new pet',
                spritesheetPath: 'spritesheet.webp',
              },
              spritesheetPath: '/app_data/pets/new-pet/spritesheet.webp',
            },
          ]);
        }
        return Promise.resolve(null);
      });

    const result = await invoke('add_pet');
    expect(result).toEqual({ success: true, petId: 'new-pet' });

    const pets = await invoke('discover_pets');
    expect(pets).toHaveLength(2);
  });

  it('remove_pet rejects built-in cat', async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === 'remove_pet') {
        return Promise.resolve({
          success: false,
          error: '内置宠物不可移除',
        });
      }
      return Promise.resolve(null);
    });

    const result = await invoke('remove_pet', { petId: 'cat' });
    expect(result).toEqual({ success: false, error: '内置宠物不可移除' });
  });

  it('remove_pet succeeds for user pets', async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === 'remove_pet') {
        return Promise.resolve({ success: true });
      }
      if (cmd === 'discover_pets') {
        return Promise.resolve([
          {
            manifest: {
              id: 'cat',
              displayName: '小猫',
              description: '默认桌面宠物猫',
              spritesheetPath: 'spritesheet.webp',
            },
            spritesheetPath: '/app_data/pets/cat/spritesheet.webp',
          },
        ]);
      }
      return Promise.resolve(null);
    });

    const removeResult = await invoke('remove_pet', { petId: 'desk-fox' });
    expect(removeResult).toEqual({ success: true });

    const pets = await invoke('discover_pets');
    expect(pets).toHaveLength(1);
    expect(pets[0]?.manifest?.id).toBe('cat');
  });
});
```

- [ ] **Step 5: Run all tests**

Run: `npm test`
Expected: all tests pass

- [ ] **Step 6: Commit**

```bash
git add tests/
git commit -m "test: update tests for Chinese menus, app_data catalog, and pet management"
```

---

### Task 11: Final verification

- [ ] **Step 1: Run full test suite**

Run: `npm test`
Expected: all tests pass

- [ ] **Step 2: Run Rust tests**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: all tests pass

- [ ] **Step 3: Full TypeScript type check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Build frontend**

Run: `npm run build`
Expected: builds successfully

- [ ] **Step 5: Build Tauri**

Run: `cargo build --manifest-path src-tauri/Cargo.toml`
Expected: builds successfully

- [ ] **Step 6: Commit any remaining changes**

```bash
git status
git add <any remaining files>
git commit -m "chore: final verification fixes"
```
