use rdev::{listen, Event, EventType};
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Emitter};

use super::classifier::{classify_key, BongoSide};

static IS_LISTENING: AtomicBool = AtomicBool::new(false);

#[derive(Debug, Clone, serde::Serialize)]
struct BongoTapEvent {
    side: BongoSide,
}

/// Start global keyboard listening via rdev.
///
/// Blocks the calling thread on `rdev::listen`. Must be called from an async
/// Tauri command or a dedicated thread — never from the main/UI thread.
/// Idempotent via `IS_LISTENING` atomic flag.
pub fn start_keyboard_listening(app_handle: AppHandle) -> Result<(), String> {
    if IS_LISTENING.load(Ordering::SeqCst) {
        return Ok(());
    }

    IS_LISTENING.store(true, Ordering::SeqCst);

    let callback = move |event: Event| {
        if let EventType::KeyPress(key) = event.event_type {
            if let Some(side) = classify_key(&key) {
                let _ = app_handle.emit("bongo-tap", BongoTapEvent { side });
            }
        }
    };

    listen(callback).map_err(|err| {
        IS_LISTENING.store(false, Ordering::SeqCst);
        format!("keyboard listen failed: {:?}", err)
    })
}
