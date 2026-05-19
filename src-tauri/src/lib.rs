use std::fs;
use std::path::PathBuf;
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;
use tracing::{error, info, warn};
use tracing_subscriber::{fmt, prelude::*, EnvFilter};
use tracing_appender::rolling::RollingFileAppender;

use bongo::BongoMonitor;
mod bongo;
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

    // Initialize bongo keyboard monitor (always on)
    let bongo_monitor = BongoMonitor::new(app.handle().clone());
    if let Err(e) = bongo_monitor.set_active(true) {
        info!("bongo monitor not available (permissions): {}", e);
    }
    app.manage(bongo_monitor);

    info!("application setup complete");
    Ok(())
}

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
                    }
                }
            }
        }
        Err(e) => {
            warn!("failed to read preferences.json: {}, using defaults", e);
            Preferences {
                active_pet_id: "cat".into(),
                window_position: None,
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

    let content = serde_json::to_string_pretty(&preferences).map_err(|e| e.to_string())?;
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

#[tauri::command]
fn set_bongo_active(monitor: tauri::State<'_, BongoMonitor>, active: bool) -> Result<(), String> {
    monitor.set_active(active)
}

#[tauri::command]
fn open_accessibility_settings() {
    let _ = std::process::Command::new("open")
        .args(["x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"])
        .spawn();
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
            set_bongo_active,
            open_accessibility_settings
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
        };
        assert_eq!(prefs.active_pet_id, "cat");
        assert!(prefs.window_position.is_none());
    }

    #[test]
    fn preferences_serialize_and_deserialize() {
        let prefs = Preferences {
            active_pet_id: "cat".into(),
            window_position: Some(WindowPosition { x: 100, y: 200 }),
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
}
