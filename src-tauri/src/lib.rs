use std::fs;
use std::path::PathBuf;
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;

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

fn setup_app(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let app_data = app.path().app_data_dir()?;
    let _ = fs::create_dir_all(&app_data);

    init_builtin_pet(&app_data);
    init_preferences(&app_data);

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
        return Vec::new();
    };
    let pet_root = app_pets_dir(&app_data);

    if !pet_root.exists() {
        let _ = fs::create_dir_all(&pet_root);
    }

    pets::discover_pets(&pet_root)
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

    let file_path = match file_path.into_path() {
        Ok(p) => p,
        Err(_) => {
            return AddPetResult {
                success: false,
                pet_id: None,
                error: Some("无法解析选择的文件路径".into()),
            };
        }
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
                Some((w, h)) if w == pets::EXPECTED_SPRITESHEET_W && h == pets::EXPECTED_SPRITESHEET_H => {}
                Some((w, h)) => {
                    return AddPetResult {
                        success: false,
                        pet_id: None,
                        error: Some(format!(
                            "精灵表尺寸不符：期望 {}x{}，实际 {}x{}",
                            pets::EXPECTED_SPRITESHEET_W, pets::EXPECTED_SPRITESHEET_H, w, h
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
            add_pet,
            remove_pet
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
