use tauri::Manager;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
struct CharacterInfo {
    name: String,
    display_name: String,
    path: String,
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn list_user_characters(app_handle: tauri::AppHandle) -> Vec<CharacterInfo> {
    let data_dir = app_handle.path().app_data_dir().unwrap_or_default();
    let chars_dir = data_dir.join("characters");
    let mut characters = Vec::new();

    if let Ok(entries) = std::fs::read_dir(&chars_dir) {
        for entry in entries.flatten() {
            let manifest_path = entry.path().join("manifest.json");
            if let Ok(content) = std::fs::read_to_string(&manifest_path) {
                if let Ok(manifest) = serde_json::from_str::<serde_json::Value>(&content) {
                    characters.push(CharacterInfo {
                        name: manifest["name"].as_str().unwrap_or("unknown").to_string(),
                        display_name: manifest["displayName"].as_str().unwrap_or("Unknown").to_string(),
                        path: entry.path().to_string_lossy().to_string(),
                    });
                }
            }
        }
    }

    characters
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![greet, list_user_characters])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
