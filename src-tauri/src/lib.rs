use std::fs;
use std::path::PathBuf;
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;
use tracing::{error, info, warn};
use tracing_subscriber::{fmt, prelude::*, EnvFilter};
use tracing_appender::rolling::RollingFileAppender;
use std::collections::HashMap;

mod pets;
mod cc_hooks;
mod ai;

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
        info!("built-in pet 'cat' already exists, skipping");
        return;
    }

    info!("initializing built-in pet 'cat'");
    let _ = fs::create_dir_all(&cat_dir);
    let _ = fs::write(cat_dir.join("pet.json"), BUILTIN_MANIFEST);
    let _ = fs::write(cat_dir.join("spritesheet.webp"), BUILTIN_SPRITESHEET);
}

fn init_preferences(app_data: &PathBuf) {
    let prefs_path = preferences_path(app_data);
    if prefs_path.exists() {
        // Validate existing preferences; if corrupted, back up and rewrite
        match fs::read_to_string(&prefs_path) {
            Ok(content) => {
                if serde_json::from_str::<serde_json::Value>(&content).is_ok() {
                    info!("preferences.json exists and is valid");
                    return;
                }
                warn!("preferences.json is corrupted, backing up and resetting");
                let backup = app_data.join("preferences.json.bak");
                let _ = fs::write(&backup, &content);
            }
            Err(e) => {
                warn!("failed to read preferences.json: {}, resetting", e);
            }
        }
    } else {
        info!("preferences.json not found, creating default");
    }

    let default_prefs = serde_json::json!({
        "activePetId": "cat",
    });

    if let Some(parent) = prefs_path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    let _ = fs::write(&prefs_path, default_prefs.to_string());
}

fn init_logging(app_data: &PathBuf) {
    let log_dir = app_data.join("logs");
    let _ = fs::create_dir_all(&log_dir);
    let file_appender = RollingFileAppender::builder()
        .rotation(tracing_appender::rolling::Rotation::DAILY)
        .filename_prefix("pet")
        .filename_suffix("log")
        .max_log_files(5)
        .build(log_dir)
        .unwrap();
    let file_layer = fmt::layer()
        .with_ansi(false)
        .with_writer(file_appender);
    let stdout_layer = fmt::layer()
        .with_writer(std::io::stdout);
    let filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new("info"));
    tracing_subscriber::registry()
        .with(filter)
        .with(file_layer)
        .with(stdout_layer)
        .init();
}

fn setup_app(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let app_data = app.path().app_data_dir()?;
    let _ = fs::create_dir_all(&app_data);

    init_logging(&app_data);
    info!("app data directory: {:?}", app_data);

    init_builtin_pet(&app_data);
    init_preferences(&app_data);

    // Auto-install CC hooks on startup
    if let Err(e) = install_cc_hooks_internal() {
        warn!("auto-install CC hooks failed: {}", e);
    }

    // CC hook server for Claude Code integration
    let cc_server = cc_hooks::CcHookServer::start(app.handle().clone());
    app.manage(cc_server);

    // Bubble window (hidden, shown on CC hook events)
    let bubble_win = tauri::WebviewWindowBuilder::new(
        app,
        "cc-bubble",
        tauri::WebviewUrl::App("bubble.html".into()),
    )
    .title("")
    .inner_size(350.0, 60.0)
    .transparent(true)
    .decorations(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .shadow(false)
    .visible(false)
    .resizable(false)
    .build();
    if let Ok(w) = bubble_win {
        let _ = w.set_ignore_cursor_events(true);
    }

    info!("application setup complete");
    Ok(())
}

use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Preferences {
    pub active_pet_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub window_position: Option<WindowPosition>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ai_config: Option<AiConfig>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct WindowPosition {
    x: i32,
    y: i32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AiConfig {
    pub api_key: String,
    #[serde(default = "default_base_url")]
    pub base_url: String,
    #[serde(default = "default_model")]
    pub model: String,
    #[serde(default = "default_system_prompt")]
    pub system_prompt: String,
    #[serde(default = "default_idle_chat_enabled")]
    pub idle_chat_enabled: bool,
    #[serde(default = "default_idle_chat_interval")]
    pub idle_chat_interval: u64,
}

fn default_base_url() -> String { "https://api.deepseek.com".into() }
fn default_model() -> String { "DeepSeek-V3".into() }
fn default_system_prompt() -> String {
    "你是一只可爱的桌面宠物猫，名叫小橘。你是主人的编程伙伴，用简短可爱的语气回应，每句话不超过30字。偶尔加个喵~".into()
}
fn default_idle_chat_enabled() -> bool { true }
fn default_idle_chat_interval() -> u64 { 300 }

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[tauri::command]
fn discover_pets(app_handle: tauri::AppHandle) -> Vec<pets::ExternalPetRecord> {
    let Ok(app_data) = app_handle.path().app_data_dir() else {
        error!("failed to get app_data dir during pet discovery");
        return Vec::new();
    };
    let pet_root = app_pets_dir(&app_data);

    if !pet_root.exists() {
        let _ = fs::create_dir_all(&pet_root);
        info!("created pets directory: {:?}", pet_root);
    }

    let pets = pets::discover_pets(&pet_root);
    info!("discovered {} pet(s) in {:?}", pets.len(), pet_root);
    pets
}

#[tauri::command]
fn load_preferences(app_handle: tauri::AppHandle) -> Preferences {
    let Ok(app_data) = app_handle.path().app_data_dir() else {
        error!("failed to get app_data dir when loading preferences");
        return Preferences {
            active_pet_id: "cat".into(),
            window_position: None,
            ai_config: None,
        };
    };

    let prefs_path = preferences_path(&app_data);
    match fs::read_to_string(&prefs_path) {
        Ok(content) => {
            match serde_json::from_str::<Preferences>(&content) {
                Ok(prefs) => {
                    info!("loaded preferences: activePetId={}", prefs.active_pet_id);
                    prefs
                }
                Err(e) => {
                    warn!("failed to parse preferences.json: {}, using defaults", e);
                    Preferences {
                        active_pet_id: "cat".into(),
                        window_position: None,
                        ai_config: None,
                    }
                }
            }
        }
        Err(e) => {
            warn!("failed to read preferences.json: {}, using defaults", e);
            Preferences {
                active_pet_id: "cat".into(),
                window_position: None,
                ai_config: None,
            }
        }
    }
}

#[tauri::command]
fn save_preferences(app_handle: tauri::AppHandle, preferences: Preferences) -> Result<(), String> {
    let app_data = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| {
            error!("failed to get app_data dir when saving preferences: {}", e);
            e.to_string()
        })?;

    let prefs_path = preferences_path(&app_data);
    if let Some(parent) = prefs_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    // Merge incoming preferences into existing file (read-modify-write)
    let mut existing: serde_json::Value = if prefs_path.exists() {
        fs::read_to_string(&prefs_path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_else(|| serde_json::json!({}))
    } else {
        serde_json::json!({})
    };

    let incoming = serde_json::to_value(&preferences).unwrap_or_default();
    if let Some(obj) = existing.as_object_mut() {
        if let Some(incoming_obj) = incoming.as_object() {
            for (key, value) in incoming_obj {
                if value.is_null() {
                    obj.remove(key);
                } else {
                    obj.insert(key.clone(), value.clone());
                }
            }
        }
    }

    let content = serde_json::to_string_pretty(&existing).map_err(|e| e.to_string())?;
    fs::write(&prefs_path, content).map_err(|e| e.to_string())?;
    info!("saved preferences: activePetId={}", preferences.active_pet_id);

    Ok(())
}

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
async fn pick_spritesheet(app_handle: tauri::AppHandle) -> Result<Option<String>, String> {
    info!("pick_spritesheet: opening file dialog");
    let (tx, rx) = tokio::sync::oneshot::channel();
    app_handle
        .dialog()
        .file()
        .add_filter("Spritesheet Image", &["webp", "png"])
        .set_title("选择精灵图")
        .pick_file(move |file_path| {
            let _ = tx.send(file_path);
        });
    let file_path = rx.await.unwrap_or(None);

    match file_path {
        Some(f) => match f.into_path() {
            Ok(p) => Ok(Some(p.to_string_lossy().to_string())),
            Err(_) => Err("无法解析文件路径".into()),
        },
        None => Ok(None),
    }
}

fn generate_pet_id(display_name: &str) -> String {
    let id: String = display_name
        .to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '-' })
        .collect();
    let trimmed = id.trim_matches('-');
    if trimmed.is_empty() { "custom-pet".into() } else { trimmed.to_string() }
}

#[tauri::command]
fn add_pet_from_spritesheet(
    app_handle: tauri::AppHandle,
    source_path: String,
    display_name: String,
) -> AddPetResult {
    info!("add_pet_from_spritesheet: source={}, name={}", source_path, display_name);

    let source = std::path::PathBuf::from(&source_path);
    if !source.exists() {
        return AddPetResult {
            success: false,
            pet_id: None,
            error: Some("精灵图文件不存在".into()),
        };
    }

    // Validate spritesheet dimensions
    match fs::read(&source) {
        Ok(data) => {
            match pets::read_image_dimensions(&data) {
                Some((w, h))
                    if w == pets::EXPECTED_SPRITESHEET_W
                        && h >= pets::EXPECTED_SPRITESHEET_MIN_H
                        && h % pets::CELL_H == 0 => {}
                Some((w, h)) => {
                    return AddPetResult {
                        success: false,
                        pet_id: None,
                        error: Some(format!(
                            "精灵表尺寸不符：宽度须 {}px，高度须为 {}px 的整倍数（最低 {}px），实际 {}x{}",
                            pets::EXPECTED_SPRITESHEET_W,
                            pets::CELL_H,
                            pets::EXPECTED_SPRITESHEET_MIN_H,
                            w,
                            h
                        )),
                    };
                }
                None => {
                    return AddPetResult {
                        success: false,
                        pet_id: None,
                        error: Some("无法解析精灵图尺寸，请确保文件为有效 WebP 或 PNG 格式".into()),
                    };
                }
            }
        }
        Err(e) => {
            return AddPetResult {
                success: false,
                pet_id: None,
                error: Some(format!("无法读取精灵图：{}", e)),
            };
        }
    }

    let pet_id = generate_pet_id(&display_name);

    // Build pet.json
    let manifest = serde_json::json!({
        "id": pet_id,
        "displayName": display_name,
        "description": "",
        "spritesheetPath": "spritesheet.webp",
    });
    let manifest_content = serde_json::to_string_pretty(&manifest).unwrap();

    let Ok(app_data) = app_handle.path().app_data_dir() else {
        return AddPetResult {
            success: false,
            pet_id: None,
            error: Some("无法获取应用数据目录".into()),
        };
    };

    let dest_dir = app_data.join("pets").join(&pet_id);

    if dest_dir.exists() {
        return AddPetResult {
            success: false,
            pet_id: Some(pet_id),
            error: Some(format!("宠物 \"{}\" 已存在", display_name)),
        };
    }

    if fs::create_dir_all(&dest_dir).is_err() {
        return AddPetResult {
            success: false,
            pet_id: None,
            error: Some("无法创建宠物目录".into()),
        };
    }

    // Determine file extension: always save as spritesheet.webp
    let dest_spritesheet = dest_dir.join("spritesheet.webp");
    if source.extension().and_then(|e| e.to_str()) == Some("png") {
        // Convert PNG to WebP if needed — for now, just copy and rename
        // The frontend already validates dimensions, and WebP decoder handles
        // common formats; PNG spritesheets work fine when renamed
        if fs::copy(&source, &dest_spritesheet).is_err() {
            let _ = fs::remove_dir_all(&dest_dir);
            return AddPetResult {
                success: false,
                pet_id: None,
                error: Some("无法复制精灵图".into()),
            };
        }
    } else {
        if fs::copy(&source, &dest_spritesheet).is_err() {
            let _ = fs::remove_dir_all(&dest_dir);
            return AddPetResult {
                success: false,
                pet_id: None,
                error: Some("无法复制精灵图".into()),
            };
        }
    }

    if fs::write(dest_dir.join("pet.json"), &manifest_content).is_err() {
        let _ = fs::remove_dir_all(&dest_dir);
        return AddPetResult {
            success: false,
            pet_id: None,
            error: Some("无法写入 pet.json".into()),
        };
    }

    info!("add_pet_from_spritesheet: successfully added pet '{}'", pet_id);
    AddPetResult {
        success: true,
        pet_id: Some(pet_id),
        error: None,
    }
}

#[derive(Debug, Serialize, Deserialize)]
struct RemovePetResult {
    success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[tauri::command]
fn remove_pet(app_handle: tauri::AppHandle, pet_id: String) -> RemovePetResult {
    info!("remove_pet: requested removal of '{}'", pet_id);
    if pet_id == BUILTIN_PET_ID {
        warn!("remove_pet: rejected removal of built-in pet");
        return RemovePetResult {
            success: false,
            error: Some("内置宠物不可移除".into()),
        };
    }

    let Ok(app_data) = app_handle.path().app_data_dir() else {
        error!("remove_pet: failed to get app_data dir");
        return RemovePetResult {
            success: false,
            error: Some("无法获取应用数据目录".into()),
        };
    };

    let pet_dir = app_data.join("pets").join(&pet_id);

    if !pet_dir.exists() {
        warn!("remove_pet: pet '{}' does not exist", pet_id);
        return RemovePetResult {
            success: false,
            error: Some(format!("宠物 \"{}\" 不存在", pet_id)),
        };
    }

    match fs::remove_dir_all(&pet_dir) {
        Ok(_) => {
            info!("remove_pet: successfully removed '{}'", pet_id);
            RemovePetResult {
                success: true,
                error: None,
            }
        }
        Err(e) => {
            error!("remove_pet: failed to remove '{}': {}", pet_id, e);
            RemovePetResult {
                success: false,
                error: Some(format!("无法删除宠物目录：{}", e)),
            }
        }
    }
}

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
  -d "{\"event\":\"$1\"}"
"#;

struct HookEntry {
    event: &'static str,
    matcher: &'static str,
    pet_event: &'static str,
}

const HOOK_ENTRIES: &[HookEntry] = &[
    HookEntry { event: "UserPromptSubmit", matcher: "", pet_event: "thinking" },
    HookEntry { event: "PermissionRequest", matcher: "", pet_event: "waiting" },
    HookEntry { event: "PostToolUse", matcher: "Bash", pet_event: "tool-bash" },
    HookEntry { event: "PostToolUse", matcher: "Edit", pet_event: "tool-edit" },
    HookEntry { event: "PostToolUse", matcher: "Write", pet_event: "tool-write" },
    HookEntry { event: "PostToolUse", matcher: "WebFetch", pet_event: "tool-web" },
    HookEntry { event: "PostCompact", matcher: "", pet_event: "context-compacted" },
    HookEntry { event: "SessionEnd", matcher: "", pet_event: "completion" },
];

#[derive(Debug, Serialize, Deserialize)]
struct CcHookResult {
    success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct CcHookStatus {
    installed: bool,
}

fn install_cc_hooks_internal() -> Result<(), String> {
    let settings_path = cc_settings_path();

    // Backup existing settings (only if no previous backup exists)
    if settings_path.exists() {
        let backup_path = cc_settings_backup_path();
        if !backup_path.exists() {
            match fs::copy(&settings_path, &backup_path) {
                Ok(_) => info!("backed up settings.json"),
                Err(e) => {
                    error!("failed to backup settings.json: {}", e);
                    return Err(format!("无法备份 settings.json: {}", e));
                }
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
                    return Err(format!("settings.json 格式错误: {}", e));
                }
            },
            Err(e) => {
                error!("failed to read settings.json: {}", e);
                return Err(format!("无法读取 settings.json: {}", e));
            }
        }
    } else {
        serde_json::json!({})
    };

    // Write hook config
    let hooks_obj = settings
        .as_object_mut()
        .map(|obj| obj.entry("hooks").or_insert_with(|| serde_json::json!({})))
        .and_then(|v| v.as_object_mut());

    let Some(hooks_obj) = hooks_obj else {
        return Err("无法解析 settings.json hooks 字段".into());
    };

    for entry in HOOK_ENTRIES {
        let command = format!(
            "{}/notify.sh {}",
            cc_hooks_dir().display(),
            entry.pet_event
        );
        let entry_json = serde_json::json!({
            "matcher": entry.matcher,
            "hooks": [{
                "type": "command",
                "command": command,
                "async": true,
            }],
        });
        let arr = hooks_obj
            .entry(entry.event.to_string())
            .or_insert_with(|| serde_json::json!([]));
        if let Some(arr) = arr.as_array_mut() {
            arr.push(entry_json);
        }
    }

    // Write updated settings
    let content = match serde_json::to_string_pretty(&settings) {
        Ok(c) => c,
        Err(e) => {
            error!("failed to serialize settings.json: {}", e);
            return Err(format!("序列化 settings.json 失败: {}", e));
        }
    };
    if let Err(e) = fs::write(&settings_path, &content) {
        error!("failed to write settings.json: {}", e);
        return Err(format!("无法写入 settings.json: {}", e));
    }

    // Write notify.sh script
    let hooks_dir = cc_hooks_dir();
    if let Err(e) = fs::create_dir_all(&hooks_dir) {
        error!("failed to create hooks dir: {}", e);
        return Err(format!("无法创建 hook 目录: {}", e));
    }

    let notify_script = NOTIFY_SCRIPT.replace("PORT", &cc_hooks::CC_HOOK_PORT.to_string());
    if let Err(e) = fs::write(hooks_dir.join("notify.sh"), &notify_script) {
        error!("failed to write notify.sh: {}", e);
        return Err(format!("无法写入 notify.sh: {}", e));
    }

    // Make executable
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if let Err(e) = fs::set_permissions(
            hooks_dir.join("notify.sh"),
            std::fs::Permissions::from_mode(0o755),
        ) {
            warn!("failed to make notify.sh executable: {}", e);
        }
    }

    info!("install_cc_hooks: successfully installed");
    Ok(())
}

#[tauri::command]
fn install_cc_hooks() -> CcHookResult {
    match install_cc_hooks_internal() {
        Ok(()) => CcHookResult { success: true, error: None },
        Err(e) => CcHookResult { success: false, error: Some(e) },
    }
}

#[tauri::command]
fn uninstall_cc_hooks() -> CcHookResult {
    info!("uninstall_cc_hooks: removing hook configuration");

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
            match fs::read_to_string(&settings_path) {
                Ok(content) => {
                    match serde_json::from_str::<serde_json::Value>(&content) {
                        Ok(mut settings) => {
                            if let Some(obj) = settings.as_object_mut() {
                                obj.remove("hooks");
                                match serde_json::to_string_pretty(&settings) {
                                    Ok(new_content) => {
                                        let _ = fs::write(&settings_path, new_content);
                                    }
                                    Err(e) => {
                                        warn!("failed to serialize settings.json after removing hooks: {}", e);
                                    }
                                }
                            }
                        }
                        Err(e) => {
                            warn!("failed to parse settings.json during uninstall: {}", e);
                        }
                    }
                }
                Err(e) => {
                    warn!("failed to read settings.json during uninstall: {}", e);
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

#[tauri::command]
async fn get_ai_config(app_handle: tauri::AppHandle) -> Option<AiConfig> {
    let Ok(app_data) = app_handle.path().app_data_dir() else { return None };
    let prefs_path = preferences_path(&app_data);
    let content = fs::read_to_string(&prefs_path).ok()?;
    let prefs = serde_json::from_str::<Preferences>(&content).ok()?;
    prefs.ai_config
}

#[tauri::command]
async fn set_ai_config(app_handle: tauri::AppHandle, config: AiConfig) -> Result<(), String> {
    let app_data = app_handle.path().app_data_dir().map_err(|e| e.to_string())?;
    let prefs_path = preferences_path(&app_data);
    let mut prefs: Preferences = if prefs_path.exists() {
        fs::read_to_string(&prefs_path)
            .ok()
            .and_then(|c| serde_json::from_str(&c).ok())
            .unwrap_or(Preferences {
                active_pet_id: "cat".into(),
                window_position: None,
                ai_config: None,
            })
    } else {
        Preferences { active_pet_id: "cat".into(), window_position: None, ai_config: None }
    };
    prefs.ai_config = Some(config);
    let content = serde_json::to_string_pretty(&prefs).map_err(|e| e.to_string())?;
    fs::write(&prefs_path, content).map_err(|e| e.to_string())
}

#[tauri::command]
async fn chat_with_pet(
    app_handle: tauri::AppHandle,
    messages: Vec<ChatMessage>,
) -> Result<String, String> {
    let app_data = app_handle.path().app_data_dir().map_err(|e| e.to_string())?;
    let prefs_path = preferences_path(&app_data);
    let prefs: Preferences = fs::read_to_string(&prefs_path)
        .ok()
        .and_then(|c| serde_json::from_str(&c).ok())
        .unwrap_or(Preferences { active_pet_id: "cat".into(), window_position: None, ai_config: None });
    let config = prefs.ai_config.ok_or("AI 未配置，请在 AI 设置中输入 API Key".to_string())?;
    ai::chat(&config, &messages, 30).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn generate_event_reaction(
    app_handle: tauri::AppHandle,
    event: String,
) -> Result<String, String> {
    let app_data = app_handle.path().app_data_dir().map_err(|e| e.to_string())?;
    let prefs_path = preferences_path(&app_data);
    let prefs: Preferences = fs::read_to_string(&prefs_path)
        .ok()
        .and_then(|c| serde_json::from_str(&c).ok())
        .unwrap_or(Preferences { active_pet_id: "cat".into(), window_position: None, ai_config: None });
    let config = prefs.ai_config.ok_or("no config".to_string())?;

    let desc_map: HashMap<&str, &str> = [
        ("thinking", "主人正在认真思考"),
        ("tool-bash", "主人正在运行命令行"),
        ("tool-edit", "主人正在编辑代码"),
        ("tool-write", "主人正在写文件"),
        ("tool-web", "主人正在浏览网页"),
        ("waiting", "主人在等待授权操作"),
        ("context-compacted", "对话刚被压缩了"),
        ("completion", "主人刚完成了任务"),
    ].into_iter().collect();

    let desc = desc_map.get(event.as_str()).copied().unwrap_or("主人在做点什么");
    let user_msg = format!("你注意到主人正在：{}，请你随口说一句简短的反应（不超过20字）", desc);

    let system_prompt = config.system_prompt.clone();
    let messages = vec![
        ChatMessage { role: "system".into(), content: system_prompt },
        ChatMessage { role: "user".into(), content: user_msg },
    ];
    ai::chat(&config, &messages, 8).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn test_ai_connection(
    _app_handle: tauri::AppHandle,
    config: AiConfig,
) -> Result<String, String> {
    let messages = vec![
        ChatMessage { role: "system".into(), content: "你是一个助手".into() },
        ChatMessage { role: "user".into(), content: "回复'连接成功'".into() },
    ];
    ai::chat(&config, &messages, 15).await.map_err(|e| e.to_string())
}

#[tauri::command]
fn check_cc_hooks_status() -> CcHookStatus {
    CcHookStatus {
        installed: cc_hooks_dir().join("notify.sh").exists(),
    }
}

#[tauri::command]
fn open_ai_settings_window(app_handle: tauri::AppHandle) {
    let win = app_handle.get_webview_window("ai-settings");
    if let Some(w) = win {
        let _ = w.set_focus();
        return;
    }
    let _ = tauri::WebviewWindowBuilder::new(
        &app_handle,
        "ai-settings",
        tauri::WebviewUrl::App("ai-settings.html".into()),
    )
    .title("AI 设置")
    .inner_size(460.0, 620.0)
    .resizable(false)
    .build();
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct BubbleData {
    text: String,
    emoji: String,
    #[serde(rename = "bgColor")]
    bg_color: String,
    #[serde(rename = "borderColor")]
    border_color: String,
}

#[tauri::command]
fn show_bubble_window(app_handle: tauri::AppHandle, data: BubbleData) {
    let Some(bubble_win) = app_handle.get_webview_window("cc-bubble") else {
        return;
    };
    let Some(main_win) = app_handle.get_webview_window("main") else {
        return;
    };

    // Position bubble above main window (logical coords to handle Retina)
    if let Ok(pos) = main_win.outer_position() {
        if let Ok(size) = main_win.outer_size() {
            let scale = main_win.scale_factor().unwrap_or(1.0);
            let main_w = size.width as f64 / scale;
            let bubble_x = pos.x as f64 / scale + (main_w - 350.0) / 2.0;
            let bubble_y = pos.y as f64 / scale - 70.0;
            let _ = bubble_win.set_position(tauri::LogicalPosition::new(bubble_x.max(0.0), bubble_y.max(0.0)));
        }
    }

    let data_json = serde_json::to_string(&data).unwrap_or_default();
    let js = format!("bubbleUpdate({})", data_json);
    let _ = bubble_win.eval(&js);
    let _ = bubble_win.show();
}

#[tauri::command]
fn hide_bubble_window(app_handle: tauri::AppHandle) {
    if let Some(bubble_win) = app_handle.get_webview_window("cc-bubble") {
        let _ = bubble_win.eval("bubbleUpdate(null)");
        let _ = bubble_win.hide();
    }
}

#[tauri::command]
fn sync_bubble_position(app_handle: tauri::AppHandle) {
    let Some(bubble_win) = app_handle.get_webview_window("cc-bubble") else { return; };
    let Some(main_win) = app_handle.get_webview_window("main") else { return; };
    if let Ok(true) = bubble_win.is_visible() {
        if let Ok(pos) = main_win.outer_position() {
            if let Ok(size) = main_win.outer_size() {
                let scale = main_win.scale_factor().unwrap_or(1.0);
                let main_w = size.width as f64 / scale;
                let bubble_x = pos.x as f64 / scale + (main_w - 350.0) / 2.0;
                let bubble_y = pos.y as f64 / scale - 70.0;
                let _ = bubble_win.set_position(tauri::LogicalPosition::new(bubble_x.max(0.0), bubble_y.max(0.0)));
            }
        }
    }
}

#[tauri::command]
fn open_pet_import_window(app_handle: tauri::AppHandle) {
    let win = app_handle.get_webview_window("pet-import");
    if let Some(w) = win {
        let _ = w.set_focus();
        return;
    }
    let _ = tauri::WebviewWindowBuilder::new(
        &app_handle,
        "pet-import",
        tauri::WebviewUrl::App("pet-import.html".into()),
    )
    .title("添加宠物")
    .inner_size(340.0, 290.0)
    .resizable(false)
    .build();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(setup_app)
        .invoke_handler(tauri::generate_handler![
            discover_pets,
            load_preferences,
            save_preferences,
            pick_spritesheet,
            add_pet_from_spritesheet,
            remove_pet,
            install_cc_hooks,
            uninstall_cc_hooks,
            check_cc_hooks_status,
            get_ai_config,
            set_ai_config,
            chat_with_pet,
            generate_event_reaction,
            test_ai_connection,
            open_ai_settings_window,
            open_pet_import_window,
            show_bubble_window,
            hide_bubble_window,
            sync_bubble_position,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::{Preferences, WindowPosition};

    #[test]
    fn preferences_default_to_cat_when_file_missing() {
        let prefs = Preferences {
            active_pet_id: "cat".into(),
            window_position: None,
            ai_config: None,
        };
        assert_eq!(prefs.active_pet_id, "cat");
        assert!(prefs.window_position.is_none());
    }

    #[test]
    fn preferences_serialize_and_deserialize() {
        let prefs = Preferences {
            active_pet_id: "cat".into(),
            window_position: Some(WindowPosition { x: 100, y: 200 }),
            ai_config: None,
        };
        let json = serde_json::to_string(&prefs).unwrap();
        let parsed: Preferences = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.active_pet_id, "cat");
        assert_eq!(parsed.window_position.unwrap().x, 100);
    }

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

    #[test]
    fn remove_pet_rejects_builtin_cat() {
        let result = remove_pet_dry_run("cat");
        assert!(!result.success);
        assert!(result.error.unwrap().contains("内置"));
    }

    #[test]
    fn install_cc_hooks_result_shape() {
        let result = super::CcHookResult {
            success: true,
            error: None,
        };
        assert!(result.success);
        assert!(result.error.is_none());
    }

    #[test]
    fn uninstall_cc_hooks_result_shape() {
        let result = super::CcHookResult {
            success: true,
            error: None,
        };
        assert!(result.success);
        assert!(result.error.is_none());
    }
}
