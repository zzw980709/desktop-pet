use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ExternalPetRecord {
    pub manifest: serde_json::Value,
    pub spritesheet_path: String,
}

pub fn discover_pets(root: &Path) -> Vec<ExternalPetRecord> {
    let mut pets = Vec::new();

    if let Ok(entries) = std::fs::read_dir(root) {
        let mut entries = entries.flatten().collect::<Vec<_>>();
        entries.sort_by(|left, right| left.path().cmp(&right.path()));

        for entry in entries {
            let pet_dir = entry.path();
            let manifest_path = pet_dir.join("pet.json");
            let spritesheet_path = pet_dir.join("spritesheet.webp");

            if !manifest_path.exists() || !spritesheet_path.exists() {
                continue;
            }

            if let Ok(content) = std::fs::read_to_string(&manifest_path) {
                if let Ok(manifest) = serde_json::from_str::<serde_json::Value>(&content) {
                    pets.push(ExternalPetRecord {
                        manifest,
                        spritesheet_path: spritesheet_path.to_string_lossy().to_string(),
                    });
                }
            }
        }
    }

    pets
}

#[cfg(test)]
mod tests {
    use super::discover_pets;
    use std::{
        fs,
        path::{Path, PathBuf},
        sync::atomic::{AtomicU64, Ordering},
    };

    static NEXT_TEST_DIR_ID: AtomicU64 = AtomicU64::new(0);

    struct TestDir {
        path: PathBuf,
    }

    impl TestDir {
        fn new() -> Self {
            let unique = NEXT_TEST_DIR_ID.fetch_add(1, Ordering::Relaxed);
            let path = std::env::temp_dir().join(format!(
                "desktop-pet-discover-pets-{}-{unique}",
                std::process::id()
            ));
            fs::create_dir_all(&path).expect("temp test directory should be created");
            Self { path }
        }

        fn path(&self) -> &Path {
            &self.path
        }
    }

    impl Drop for TestDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.path);
        }
    }

    fn write_pet(root: &Path, pet_id: &str, include_manifest: bool, include_spritesheet: bool) {
        let pet_dir = root.join(pet_id);
        fs::create_dir_all(&pet_dir).expect("pet directory should be created");

        if include_manifest {
            fs::write(
                pet_dir.join("pet.json"),
                format!(
                    r#"{{"id":"{pet_id}","displayName":"{pet_id}","description":"pet","spritesheetPath":"spritesheet.webp"}}"#
                ),
            )
            .expect("manifest should be written");
        }

        if include_spritesheet {
            fs::write(pet_dir.join("spritesheet.webp"), b"webp").expect("spritesheet should be written");
        }
    }

    fn write_malformed_pet(root: &Path, pet_id: &str) {
        let pet_dir = root.join(pet_id);
        fs::create_dir_all(&pet_dir).expect("pet directory should be created");
        fs::write(pet_dir.join("pet.json"), b"{not-json").expect("manifest should be written");
        fs::write(pet_dir.join("spritesheet.webp"), b"webp").expect("spritesheet should be written");
    }

    #[test]
    fn discover_pets_returns_valid_pet_directories() {
        let temp_dir = TestDir::new();
        write_pet(temp_dir.path(), "codex-cat", true, true);

        let pets = discover_pets(temp_dir.path());

        assert_eq!(pets.len(), 1);
        assert_eq!(pets[0].manifest["id"], "codex-cat");
        assert!(pets[0].spritesheet_path.ends_with("codex-cat/spritesheet.webp"));
    }

    #[test]
    fn discover_pets_skips_directories_missing_required_files() {
        let temp_dir = TestDir::new();
        write_pet(temp_dir.path(), "valid-pet", true, true);
        write_pet(temp_dir.path(), "missing-manifest", false, true);
        write_pet(temp_dir.path(), "missing-spritesheet", true, false);

        let pets = discover_pets(temp_dir.path());

        assert_eq!(pets.len(), 1);
        assert_eq!(pets[0].manifest["id"], "valid-pet");
    }

    #[test]
    fn discover_pets_skips_malformed_pet_json() {
        let temp_dir = TestDir::new();
        write_pet(temp_dir.path(), "valid-pet", true, true);
        write_malformed_pet(temp_dir.path(), "broken-pet");

        let pets = discover_pets(temp_dir.path());

        assert_eq!(pets.len(), 1);
        assert_eq!(pets[0].manifest["id"], "valid-pet");
    }

    #[test]
    fn discover_pets_returns_pets_in_sorted_directory_order() {
        let temp_dir = TestDir::new();
        write_pet(temp_dir.path(), "zebra-pet", true, true);
        write_pet(temp_dir.path(), "alpha-pet", true, true);
        write_pet(temp_dir.path(), "middle-pet", true, true);

        let pets = discover_pets(temp_dir.path());

        assert_eq!(pets.len(), 3);
        assert_eq!(pets[0].manifest["id"], "alpha-pet");
        assert_eq!(pets[1].manifest["id"], "middle-pet");
        assert_eq!(pets[2].manifest["id"], "zebra-pet");
    }
}
