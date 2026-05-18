use std::path::{Path, PathBuf};
use tauri::Manager;

mod pets;

fn resolve_pet_root(home_dir: &Path) -> PathBuf {
    home_dir.join(".codex").join("pets")
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn discover_pets(app_handle: tauri::AppHandle) -> Vec<pets::ExternalPetRecord> {
    let Ok(home_dir) = app_handle.path().home_dir() else {
        return Vec::new();
    };
    let pet_root = resolve_pet_root(&home_dir);

    pets::discover_pets(&pet_root)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![greet, discover_pets])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::resolve_pet_root;
    use std::path::Path;

    #[test]
    fn discover_pets_root_resolves_codex_pets_directory() {
        let pet_root = resolve_pet_root(Path::new("/tmp/codex-home"));

        assert_eq!(pet_root, Path::new("/tmp/codex-home/.codex/pets"));
    }
}
