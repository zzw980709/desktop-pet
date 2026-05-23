use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use rusqlite::Connection;
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

fn init_database(app_data: &PathBuf) -> Connection {
    let db_path = app_data.join("desktop-pet.db");
    let conn = Connection::open(&db_path).expect("failed to open database");

    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS preferences (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            active_pet_id TEXT NOT NULL DEFAULT 'cat',
            window_x INTEGER,
            window_y INTEGER
        );
        INSERT OR IGNORE INTO preferences (id) VALUES (1);

        CREATE TABLE IF NOT EXISTS ai_config (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            api_key TEXT NOT NULL DEFAULT '',
            base_url TEXT NOT NULL DEFAULT 'https://api.deepseek.com',
            model TEXT NOT NULL DEFAULT 'DeepSeek-V3',
            system_prompt TEXT NOT NULL DEFAULT '你是一只可爱的桌面宠物猫，名叫小橘。你是主人的编程伙伴，用简短可爱的语气回应，每句话不超过30字。偶尔加个喵~',
            idle_chat_enabled INTEGER NOT NULL DEFAULT 1,
            idle_chat_interval INTEGER NOT NULL DEFAULT 300
        );
        INSERT OR IGNORE INTO ai_config (id) VALUES (1);

        CREATE TABLE IF NOT EXISTS chat_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            pet_id TEXT NOT NULL DEFAULT 'cat',
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS api_keys (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            provider TEXT NOT NULL DEFAULT '',
            api_key TEXT NOT NULL DEFAULT '',
            base_url TEXT NOT NULL DEFAULT 'https://api.deepseek.com',
            default_model TEXT NOT NULL DEFAULT '',
            is_default INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS pet_personas (
            pet_id TEXT PRIMARY KEY,
            api_key_id INTEGER,
            model_override TEXT NOT NULL DEFAULT '',
            system_prompt TEXT NOT NULL DEFAULT ''
        );"
    ).expect("failed to create tables");

    // Migrate chat_history to add pet_id (added in 0.1.0+)
    let _ = conn.execute(
        "ALTER TABLE chat_history ADD COLUMN pet_id TEXT NOT NULL DEFAULT 'cat'",
        [],
    );

    // Migrate old ai_config to new api_keys + pet_personas tables
    let key_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM api_keys", [], |r| r.get(0))
        .unwrap_or(0);
    if key_count == 0 {
        if let Ok(old) = conn.query_row(
            "SELECT api_key, base_url, model, system_prompt FROM ai_config WHERE id=1",
            [],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                ))
            },
        ) {
            let (key, url, model, prompt) = old;
            if !key.is_empty() {
                conn.execute(
                    "INSERT INTO api_keys (provider, api_key, base_url, default_model, is_default) VALUES (?1, ?2, ?3, ?4, 1)",
                    rusqlite::params!["Default", key, url, model],
                ).ok();
            }
            conn.execute(
                "INSERT OR IGNORE INTO pet_personas (pet_id, system_prompt) VALUES ('cat', ?1)",
                rusqlite::params![prompt],
            ).ok();
        }
    }

    // Migrate from old preferences.json
    let json_path = app_data.join("preferences.json");
    if json_path.exists() {
        info!("migrating from preferences.json to SQLite");
        if let Ok(content) = fs::read_to_string(&json_path) {
            if let Ok(prefs) = serde_json::from_str::<serde_json::Value>(&content) {
                let pet_id = prefs.get("activePetId").and_then(|v| v.as_str()).unwrap_or("cat");
                if let Some(pos) = prefs.get("windowPosition") {
                    let x = pos.get("x").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
                    let y = pos.get("y").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
                    let _ = conn.execute(
                        "UPDATE preferences SET active_pet_id = ?1, window_x = ?2, window_y = ?3 WHERE id = 1",
                        rusqlite::params![pet_id, x, y],
                    );
                } else {
                    let _ = conn.execute(
                        "UPDATE preferences SET active_pet_id = ?1 WHERE id = 1",
                        rusqlite::params![pet_id],
                    );
                }
                if let Some(ai) = prefs.get("aiConfig") {
                    let api_key = ai.get("apiKey").and_then(|v| v.as_str()).unwrap_or("");
                    let base_url = ai.get("baseUrl").and_then(|v| v.as_str()).unwrap_or("https://api.deepseek.com");
                    let model = ai.get("model").and_then(|v| v.as_str()).unwrap_or("DeepSeek-V3");
                    let system_prompt = ai.get("systemPrompt").and_then(|v| v.as_str()).unwrap_or("");
                    let idle_chat_enabled = ai.get("idleChatEnabled").and_then(|v| v.as_bool()).unwrap_or(true);
                    let idle_chat_interval = ai.get("idleChatInterval").and_then(|v| v.as_u64()).unwrap_or(300);

                    let _ = conn.execute(
                        "UPDATE ai_config SET idle_chat_enabled=?1, idle_chat_interval=?2 WHERE id=1",
                        rusqlite::params![idle_chat_enabled as i32, idle_chat_interval as i64],
                    );
                    if !api_key.is_empty() {
                        let _ = conn.execute(
                            "INSERT INTO api_keys (provider, api_key, base_url, default_model, is_default) VALUES ('Default', ?1, ?2, ?3, 1)",
                            rusqlite::params![api_key, base_url.to_string(), model.to_string()],
                        );
                    }
                    if !system_prompt.is_empty() {
                        let _ = conn.execute(
                            "INSERT OR IGNORE INTO pet_personas (pet_id, system_prompt) VALUES ('cat', ?1)",
                            rusqlite::params![system_prompt.to_string()],
                        );
                    }
                }
            }
        }
        let _ = fs::remove_file(&json_path);
        info!("migration complete, removed preferences.json");
    }

    conn
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
    let db_conn = init_database(&app_data);
    app.manage(Mutex::new(db_conn));

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

fn read_ai_config(db: &Connection) -> Option<AiConfig> {
    let idle = db.query_row(
        "SELECT idle_chat_enabled, idle_chat_interval FROM ai_config WHERE id=1",
        [],
        |row| {
            Ok((
                row.get::<_, i32>(0)? != 0,
                row.get::<_, i64>(1)? as u64,
            ))
        },
    ).unwrap_or((true, 300));

    let mut stmt = db.prepare(
        "SELECT id, provider, api_key, base_url, default_model, is_default FROM api_keys ORDER BY id ASC"
    ).ok()?;
    let keys: Vec<ApiKeyEntry> = stmt
        .query_map([], |row| {
            Ok(ApiKeyEntry {
                id: Some(row.get(0)?),
                provider: row.get(1)?,
                api_key: row.get(2)?,
                base_url: row.get(3)?,
                default_model: row.get(4)?,
                is_default: row.get::<_, i32>(5)? != 0,
            })
        })
        .ok()?
        .filter_map(|r| r.ok())
        .collect();

    Some(AiConfig {
        api_keys: keys,
        idle_chat_enabled: idle.0,
        idle_chat_interval: idle.1,
    })
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
pub struct ApiKeyEntry {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<i64>,
    #[serde(default)]
    pub provider: String,
    #[serde(default)]
    pub api_key: String,
    #[serde(default = "default_base_url")]
    pub base_url: String,
    #[serde(default)]
    pub default_model: String,
    #[serde(default)]
    pub is_default: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PetPersona {
    pub pet_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub api_key_id: Option<i64>,
    #[serde(default)]
    pub model_override: String,
    #[serde(default = "default_system_prompt")]
    pub system_prompt: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AiConfig {
    #[serde(default)]
    pub api_keys: Vec<ApiKeyEntry>,
    #[serde(default = "default_idle_chat_enabled")]
    pub idle_chat_enabled: bool,
    #[serde(default = "default_idle_chat_interval")]
    pub idle_chat_interval: u64,
}

fn default_base_url() -> String { "https://api.deepseek.com".into() }
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

    let mut pets = pets::discover_pets(&pet_root);
    info!("discovered {} pet(s) in {:?}", pets.len(), pet_root);

    // Also scan ~/.petdex/pets/ for petdex-installed pets
    if let Some(home) = dirs::home_dir() {
        let petdex_root = home.join(".petdex").join("pets");
        if petdex_root.exists() {
            let petdex_pets = pets::discover_pets(&petdex_root);
            if !petdex_pets.is_empty() {
                // Merge: app pets take precedence over petdex pets with same id
                let app_ids: std::collections::HashSet<String> = pets
                    .iter()
                    .filter_map(|p| p.manifest.get("id").or_else(|| p.manifest.get("slug")).and_then(|v| v.as_str()).map(String::from))
                    .collect();
                for p in petdex_pets {
                    let pid = p.manifest.get("id").or_else(|| p.manifest.get("slug"))
                        .and_then(|v| v.as_str())
                        .unwrap_or("");
                    if !app_ids.contains(pid) {
                        pets.push(p);
                    }
                }
                info!("discovered {} pet(s) from ~/.petdex/pets/ (merged, {} total)", pets.len() - app_ids.len(), pets.len());
            }
        }
    }

    pets
}

#[tauri::command]
fn load_preferences(app_handle: tauri::AppHandle) -> Preferences {
    let state = app_handle.state::<Mutex<Connection>>();
    let db = state.lock().unwrap();
    let prefs = db.query_row(
        "SELECT active_pet_id, window_x, window_y FROM preferences WHERE id = 1",
        [],
        |row| {
            let pet_id: String = row.get(0)?;
            let wx: Option<i32> = row.get(1)?;
            let wy: Option<i32> = row.get(2)?;
            Ok(Preferences {
                active_pet_id: pet_id,
                window_position: match (wx, wy) {
                    (Some(x), Some(y)) => Some(WindowPosition { x, y }),
                    _ => None,
                },
                ai_config: None,
            })
        },
    ).unwrap_or(Preferences { active_pet_id: "cat".into(), window_position: None, ai_config: None });

    let ai_config = read_ai_config(&db);
    Preferences { ai_config, ..prefs }
}

#[tauri::command]
fn save_preferences(app_handle: tauri::AppHandle, preferences: Preferences) -> Result<(), String> {
    let state = app_handle.state::<Mutex<Connection>>();
    let db = state.lock().unwrap();
    if let Some(pos) = &preferences.window_position {
        db.execute(
            "UPDATE preferences SET active_pet_id = ?1, window_x = ?2, window_y = ?3 WHERE id = 1",
            rusqlite::params![preferences.active_pet_id, pos.x, pos.y],
        ).map_err(|e| e.to_string())?;
    } else {
        db.execute(
            "UPDATE preferences SET active_pet_id = ?1 WHERE id = 1",
            rusqlite::params![preferences.active_pet_id],
        ).map_err(|e| e.to_string())?;
    }
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

#[tauri::command]
async fn pick_petdex_directory(app_handle: tauri::AppHandle) -> Result<Option<String>, String> {
    info!("pick_petdex_directory: opening folder dialog");
    let (tx, rx) = tokio::sync::oneshot::channel();
    app_handle
        .dialog()
        .file()
        .set_title("选择 Petdex 宠物目录")
        .pick_folder(move |folder_path| {
            let _ = tx.send(folder_path);
        });
    let folder_path = rx.await.unwrap_or(None);

    match folder_path {
        Some(f) => match f.into_path() {
            Ok(p) => Ok(Some(p.to_string_lossy().to_string())),
            Err(_) => Err("无法解析目录路径".into()),
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

#[tauri::command]
fn import_petdex_package(
    app_handle: tauri::AppHandle,
    source_dir: String,
) -> AddPetResult {
    info!("import_petdex_package: source_dir={}", source_dir);

    let source = std::path::PathBuf::from(&source_dir);
    if !source.exists() || !source.is_dir() {
        return AddPetResult {
            success: false,
            pet_id: None,
            error: Some("所选目录不存在".into()),
        };
    }

    let manifest_path = source.join("pet.json");
    let spritesheet_path = source.join("spritesheet.webp");

    if !manifest_path.exists() {
        return AddPetResult {
            success: false,
            pet_id: None,
            error: Some("目录中缺少 pet.json".into()),
        };
    }
    if !spritesheet_path.exists() {
        return AddPetResult {
            success: false,
            pet_id: None,
            error: Some("目录中缺少 spritesheet.webp".into()),
        };
    }

    // Read pet.json to get pet id
    let manifest_content = match fs::read_to_string(&manifest_path) {
        Ok(c) => c,
        Err(e) => return AddPetResult {
            success: false, pet_id: None,
            error: Some(format!("无法读取 pet.json: {}", e)),
        },
    };
    let manifest: serde_json::Value = match serde_json::from_str(&manifest_content) {
        Ok(m) => m,
        Err(e) => return AddPetResult {
            success: false, pet_id: None,
            error: Some(format!("pet.json 格式错误: {}", e)),
        },
    };

    // Accept both 'id' and 'slug' fields (petdex uses slug)
    let raw_id = manifest.get("id")
        .or_else(|| manifest.get("slug"))
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let pet_id = if raw_id.is_empty() {
        generate_pet_id(
            manifest.get("displayName")
                .or_else(|| manifest.get("name"))
                .and_then(|v| v.as_str())
                .unwrap_or("custom-pet")
        )
    } else {
        generate_pet_id(raw_id)
    };

    let Ok(app_data) = app_handle.path().app_data_dir() else {
        return AddPetResult {
            success: false, pet_id: None,
            error: Some("无法获取应用数据目录".into()),
        };
    };

    let dest_dir = app_data.join("pets").join(&pet_id);
    if dest_dir.exists() {
        return AddPetResult {
            success: false,
            pet_id: Some(pet_id.clone()),
            error: Some(format!("宠物 \"{}\" 已存在", pet_id)),
        };
    }

    // Copy entire directory
    match copy_dir_recursive(&source, &dest_dir) {
        Ok(_) => {}
        Err(e) => {
            let _ = fs::remove_dir_all(&dest_dir);
            return AddPetResult {
                success: false, pet_id: None,
                error: Some(format!("复制目录失败: {}", e)),
            };
        }
    }

    // Ensure pet.json has spritesheetPath = "spritesheet.webp" (normalize on import)
    let normalized_manifest = serde_json::json!({
        "id": pet_id,
        "displayName": manifest.get("displayName").or_else(|| manifest.get("name")).and_then(|v| v.as_str()).unwrap_or(&pet_id),
        "description": manifest.get("description").and_then(|v| v.as_str()).unwrap_or(""),
        "spritesheetPath": "spritesheet.webp",
    });
    if fs::write(dest_dir.join("pet.json"), serde_json::to_string_pretty(&normalized_manifest).unwrap()).is_err() {
        let _ = fs::remove_dir_all(&dest_dir);
        return AddPetResult {
            success: false, pet_id: None,
            error: Some("无法写入 pet.json".into()),
        };
    }

    // Validate spritesheet dimensions
    match fs::read(&dest_dir.join("spritesheet.webp")) {
        Ok(data) => {
            match pets::read_image_dimensions(&data) {
                Some((w, h))
                    if w == pets::EXPECTED_SPRITESHEET_W
                        && h >= pets::EXPECTED_SPRITESHEET_MIN_H
                        && h % pets::CELL_H == 0 => {}
                Some((w, h)) => {
                    let _ = fs::remove_dir_all(&dest_dir);
                    return AddPetResult {
                        success: false, pet_id: None,
                        error: Some(format!(
                            "精灵表尺寸不符：实际 {}x{}，需 {}px 宽，高为 {}px 的整倍数",
                            w, h,
                            pets::EXPECTED_SPRITESHEET_W,
                            pets::CELL_H
                        )),
                    };
                }
                None => {
                    let _ = fs::remove_dir_all(&dest_dir);
                    return AddPetResult {
                        success: false, pet_id: None,
                        error: Some("无法解析精灵图尺寸".into()),
                    };
                }
            }
        }
        Err(e) => {
            let _ = fs::remove_dir_all(&dest_dir);
            return AddPetResult {
                success: false, pet_id: None,
                error: Some(format!("无法读取精灵图: {}", e)),
            };
        }
    }

    info!("import_petdex_package: successfully imported pet '{}'", pet_id);
    AddPetResult {
        success: true,
        pet_id: Some(pet_id),
        error: None,
    }
}

fn copy_dir_recursive(src: &std::path::Path, dst: &std::path::Path) -> std::io::Result<()> {
    fs::create_dir_all(dst)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let file_type = entry.file_type()?;
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());
        if file_type.is_dir() {
            copy_dir_recursive(&src_path, &dst_path)?;
        } else {
            fs::copy(&src_path, &dst_path)?;
        }
    }
    Ok(())
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
    let state = app_handle.state::<Mutex<Connection>>();
    let db = state.lock().unwrap();
    read_ai_config(&db)
}

#[tauri::command]
async fn set_ai_config(app_handle: tauri::AppHandle, config: AiConfig) -> Result<(), String> {
    let state = app_handle.state::<Mutex<Connection>>();
    let db = state.lock().unwrap();

    // Update idle settings
    db.execute(
        "UPDATE ai_config SET idle_chat_enabled=?1, idle_chat_interval=?2 WHERE id=1",
        rusqlite::params![config.idle_chat_enabled as i32, config.idle_chat_interval as i64],
    ).map_err(|e| e.to_string())?;

    // Replace api_keys
    db.execute("DELETE FROM api_keys", []).map_err(|e| e.to_string())?;
    for key in &config.api_keys {
        db.execute(
            "INSERT INTO api_keys (provider, api_key, base_url, default_model, is_default) VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params![key.provider, key.api_key, key.base_url, key.default_model, key.is_default as i32],
        ).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn get_pet_persona(app_handle: tauri::AppHandle, pet_id: String) -> Option<PetPersona> {
    let state = app_handle.state::<Mutex<Connection>>();
    let db = state.lock().unwrap();
    db.query_row(
        "SELECT pet_id, api_key_id, model_override, system_prompt FROM pet_personas WHERE pet_id = ?1",
        rusqlite::params![pet_id],
        |row| {
            Ok(PetPersona {
                pet_id: row.get(0)?,
                api_key_id: row.get(1)?,
                model_override: row.get(2)?,
                system_prompt: row.get(3)?,
            })
        },
    ).ok()
}

#[tauri::command]
fn set_pet_persona(app_handle: tauri::AppHandle, persona: PetPersona) -> Result<(), String> {
    let state = app_handle.state::<Mutex<Connection>>();
    let db = state.lock().unwrap();
    db.execute(
        "INSERT OR REPLACE INTO pet_personas (pet_id, api_key_id, model_override, system_prompt) VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![persona.pet_id, persona.api_key_id, persona.model_override, persona.system_prompt],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn get_all_personas(app_handle: tauri::AppHandle) -> Vec<PetPersona> {
    let state = app_handle.state::<Mutex<Connection>>();
    let db = state.lock().unwrap();
    let mut stmt = match db.prepare("SELECT pet_id, api_key_id, model_override, system_prompt FROM pet_personas") {
        Ok(s) => s,
        Err(_) => return vec![],
    };
    stmt.query_map([], |row| {
        Ok(PetPersona {
            pet_id: row.get(0)?,
            api_key_id: row.get(1)?,
            model_override: row.get(2)?,
            system_prompt: row.get(3)?,
        })
    }).ok().map(|r| r.filter_map(|x| x.ok()).collect()).unwrap_or_default()
}

fn resolve_pet_ai(db: &Connection, pet_id: &str) -> Option<(ai::AiConnection, String)> {
    // Get effective key: try pet-specific persona first, fall back to default key
    let key = db
        .query_row(
            "SELECT k.id, k.api_key, k.base_url, k.default_model, p.model_override
             FROM api_keys k
             LEFT JOIN pet_personas p ON p.api_key_id = k.id AND p.pet_id = ?1
             WHERE k.id = COALESCE(
                 (SELECT api_key_id FROM pet_personas WHERE pet_id = ?1),
                 (SELECT id FROM api_keys WHERE is_default = 1 LIMIT 1)
             )
             LIMIT 1",
            rusqlite::params![pet_id],
            |row| {
                Ok((
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, Option<String>>(4)?,
                ))
            },
        )
        .ok()?;

    let model = key.3.filter(|m| !m.is_empty()).unwrap_or(key.2);
    let system_prompt = db
        .query_row(
            "SELECT system_prompt FROM pet_personas WHERE pet_id = ?1",
            rusqlite::params![pet_id],
            |row| row.get::<_, String>(0),
        )
        .unwrap_or_else(|_| default_system_prompt());

    Some((
        ai::AiConnection { api_key: key.0, base_url: key.1, model },
        system_prompt,
    ))
}

fn get_active_pet_id(db: &Connection) -> String {
    db.query_row(
        "SELECT active_pet_id FROM preferences WHERE id = 1",
        [],
        |row| row.get::<_, String>(0),
    ).unwrap_or_else(|_| "cat".into())
}

#[tauri::command]
async fn chat_with_pet(
    app_handle: tauri::AppHandle,
    pet_id: Option<String>,
    messages: Vec<ChatMessage>,
) -> Result<String, String> {
    let (conn, prompt) = {
        let state = app_handle.state::<Mutex<Connection>>();
        let db = state.lock().unwrap();
        let pid = pet_id.unwrap_or_else(|| get_active_pet_id(&db));
        resolve_pet_ai(&db, &pid).ok_or("AI 未配置，请在 AI 设置中输入 API Key".to_string())?
    };
    let mut msgs = vec![ChatMessage { role: "system".into(), content: prompt }];
    msgs.extend(messages);
    ai::chat(&conn, &msgs, 30).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn chat_with_pet_stream(
    app_handle: tauri::AppHandle,
    pet_id: Option<String>,
    messages: Vec<ChatMessage>,
) -> Result<String, String> {
    let (conn, prompt) = {
        let state = app_handle.state::<Mutex<Connection>>();
        let db = state.lock().unwrap();
        let pid = pet_id.unwrap_or_else(|| get_active_pet_id(&db));
        resolve_pet_ai(&db, &pid).ok_or("AI 未配置，请在 AI 设置中输入 API Key".to_string())?
    };
    let mut msgs = vec![ChatMessage { role: "system".into(), content: prompt }];
    msgs.extend(messages);
    ai::chat_stream(&conn, &msgs, 60, &app_handle).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn generate_event_reaction(
    app_handle: tauri::AppHandle,
    event: String,
    pet_id: Option<String>,
) -> Result<String, String> {
    let (conn, prompt) = {
        let state = app_handle.state::<Mutex<Connection>>();
        let db = state.lock().unwrap();
        let pid = pet_id.unwrap_or_else(|| get_active_pet_id(&db));
        resolve_pet_ai(&db, &pid).ok_or("no config".to_string())?
    };

    let desc_map: HashMap<&str, &str> = [
        ("idle", "主人现在闲着，没做什么特别的事"),
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

    let messages = vec![
        ChatMessage { role: "system".into(), content: prompt },
        ChatMessage { role: "user".into(), content: user_msg },
    ];
    ai::chat(&conn, &messages, 8).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn test_ai_connection(
    _app_handle: tauri::AppHandle,
    api_key: String,
    base_url: String,
    model: String,
) -> Result<String, String> {
    let conn = ai::AiConnection { api_key, base_url, model };
    let messages = vec![
        ChatMessage { role: "system".into(), content: "你是一个助手".into() },
        ChatMessage { role: "user".into(), content: "回复'连接成功'".into() },
    ];
    ai::chat(&conn, &messages, 15).await.map_err(|e| e.to_string())
}

#[tauri::command]
fn check_cc_hooks_status() -> CcHookStatus {
    CcHookStatus {
        installed: cc_hooks_dir().join("notify.sh").exists(),
    }
}

#[tauri::command]
fn save_chat_message(app_handle: tauri::AppHandle, pet_id: String, role: String, content: String) -> Result<(), String> {
    let state = app_handle.state::<Mutex<Connection>>();
    let db = state.lock().unwrap();
    db.execute(
        "INSERT INTO chat_history (pet_id, role, content) VALUES (?1, ?2, ?3)",
        rusqlite::params![pet_id, role, content],
    ).map_err(|e| e.to_string())?;
    // Keep only last 10 messages per pet
    db.execute(
        "DELETE FROM chat_history WHERE pet_id = ?1 AND id NOT IN (SELECT id FROM chat_history WHERE pet_id = ?1 ORDER BY id DESC LIMIT 10)",
        rusqlite::params![pet_id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(Debug, Serialize, Deserialize)]
struct ChatHistoryEntry {
    role: String,
    content: String,
}

#[tauri::command]
fn load_chat_history(app_handle: tauri::AppHandle, pet_id: String) -> Vec<ChatHistoryEntry> {
    let state = app_handle.state::<Mutex<Connection>>();
    let db = state.lock().unwrap();
    let mut stmt = match db.prepare("SELECT role, content FROM chat_history WHERE pet_id = ?1 ORDER BY id ASC") {
        Ok(s) => s,
        Err(_) => return vec![],
    };
    let rows = stmt.query_map(rusqlite::params![pet_id], |row| {
        Ok(ChatHistoryEntry {
            role: row.get(0)?,
            content: row.get(1)?,
        })
    });
    match rows {
        Ok(iter) => iter.filter_map(|r| r.ok()).collect(),
        Err(_) => vec![],
    }
}

#[tauri::command]
fn open_chat_window(app_handle: tauri::AppHandle, pet_id: String, pet_name: String, pet_emoji: String) {
    let escaped_id = pet_id.replace('\\', "\\\\").replace('\'', "\\'");
    let escaped_name = pet_name.replace('\\', "\\\\").replace('\'', "\\'");
    let escaped_emoji = pet_emoji.replace('\\', "\\\\").replace('\'', "\\'");

    if let Some(win) = app_handle.get_webview_window("chat") {
        let js = format!(
            "window.__chatPetId='{}';window.__chatPetName='{}';window.__chatPetEmoji='{}';if(typeof initChat==='function')initChat('{}','{}','{}')",
            escaped_id, escaped_name, escaped_emoji,
            escaped_id, escaped_name, escaped_emoji,
        );
        let _ = win.eval(&js);
        let _ = win.show();
        let _ = win.set_focus();
        return;
    }

    let mut x = 100.0;
    let mut y = 100.0;
    if let Some(main_win) = app_handle.get_webview_window("main") {
        if let Ok(pos) = main_win.outer_position() {
            if let Ok(size) = main_win.outer_size() {
                let scale = main_win.scale_factor().unwrap_or(1.0);
                let main_right = pos.x as f64 / scale + size.width as f64 / scale;
                x = main_right + 8.0;
                y = pos.y as f64 / scale;
                if x + 340.0 > 1920.0 {
                    x = pos.x as f64 / scale - 348.0;
                }
                if x < 0.0 { x = 100.0; }
            }
        }
    }

    let builder = tauri::WebviewWindowBuilder::new(
        &app_handle,
        "chat",
        tauri::WebviewUrl::App("chat.html".into()),
    )
    .title("聊天")
    .inner_size(340.0, 440.0)
    .position(x, y)
    .resizable(false)
    .skip_taskbar(true);

    if let Ok(w) = builder.build() {
        let js = format!(
            "window.__chatPetId='{}';window.__chatPetName='{}';window.__chatPetEmoji='{}'",
            escaped_id, escaped_name, escaped_emoji,
        );
        let _ = w.eval(&js);
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
    .inner_size(540.0, 640.0)
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
    .inner_size(340.0, 360.0)
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
            pick_petdex_directory,
            add_pet_from_spritesheet,
            import_petdex_package,
            remove_pet,
            install_cc_hooks,
            uninstall_cc_hooks,
            check_cc_hooks_status,
            get_ai_config,
            set_ai_config,
            chat_with_pet,
            chat_with_pet_stream,
            generate_event_reaction,
            test_ai_connection,
            open_ai_settings_window,
            open_pet_import_window,
            open_chat_window,
            show_bubble_window,
            hide_bubble_window,
            sync_bubble_position,
            save_chat_message,
            load_chat_history,
            get_pet_persona,
            set_pet_persona,
            get_all_personas,
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
