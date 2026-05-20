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
/// Idempotent — if already listening, returns Ok immediately.
/// Spawns a background thread that runs the rdev event loop and emits
/// "bongo-tap" events to the frontend for each classified key press.
pub fn start_keyboard_listening(app_handle: AppHandle) -> Result<(), String> {
    if IS_LISTENING.load(Ordering::SeqCst) {
        return Ok(());
    }

    IS_LISTENING.store(true, Ordering::SeqCst);

    std::thread::spawn(move || {
        let callback = move |event: Event| {
            if let EventType::KeyPress(key) = event.event_type {
                if let Some(side) = classify_key(&key) {
                    let _ = app_handle.emit("bongo-tap", BongoTapEvent { side });
                }
            }
        };

        if let Err(err) = listen(callback) {
            tracing::warn!("keyboard listening stopped: {:?}", err);
            IS_LISTENING.store(false, Ordering::SeqCst);
        }
    });

    Ok(())
}
