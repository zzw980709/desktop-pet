use rusqlite::Connection;
use std::fs;
use std::path::PathBuf;
use tracing::info;

use crate::{
    AiConfig, ApiKeyEntry,
    default_system_prompt
};

pub fn app_pets_dir(app_data: &PathBuf) -> PathBuf {
    app_data.join("pets")
}

pub fn init_builtin_pet(app_data: &PathBuf) {
    let pets_dir = app_pets_dir(app_data);
    let cat_dir = pets_dir.join(crate::BUILTIN_PET_ID);

    if cat_dir.exists() {
        info!("built-in pet 'cat' already exists, skipping");
        return;
    }

    info!("initializing built-in pet 'cat'");
    let _ = fs::create_dir_all(&cat_dir);
    let _ = fs::write(cat_dir.join("pet.json"), crate::BUILTIN_MANIFEST);
    let _ = fs::write(cat_dir.join("spritesheet.webp"), crate::BUILTIN_SPRITESHEET);
}

pub fn init_database(app_data: &PathBuf) -> Connection {
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
    let has_pet_id: bool = conn
        .prepare("SELECT pet_id FROM chat_history LIMIT 0")
        .is_ok();
    if !has_pet_id {
        if let Err(e) = conn.execute(
            "ALTER TABLE chat_history ADD COLUMN pet_id TEXT NOT NULL DEFAULT 'cat'",
            [],
        ) {
            tracing::warn!("failed to add pet_id column: {}", e);
        }
    }

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

pub fn read_ai_config(db: &Connection) -> Option<AiConfig> {
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

pub fn resolve_pet_ai(db: &Connection, pet_id: &str) -> Option<(crate::ai::AiConnection, String)> {
    use crate::ai::AiConnection;

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
        AiConnection { api_key: key.0, base_url: key.1, model },
        system_prompt,
    ))
}

pub fn get_active_pet_id(db: &Connection) -> String {
    db.query_row(
        "SELECT active_pet_id FROM preferences WHERE id = 1",
        [],
        |row| row.get::<_, String>(0),
    ).unwrap_or_else(|_| "cat".into())
}
