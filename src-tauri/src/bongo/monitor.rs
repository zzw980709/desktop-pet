use std::panic::catch_unwind;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::mpsc::{self, RecvTimeoutError};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::Emitter;
use tracing::{error, info, warn};

use super::classifier::{classify_keycode, BongoSide};

/// Lock-free single-event buffer shared with the CGEventTap C callback.
/// The callback does only atomic stores — no mutex, no allocation, no emit.
static KEY_PENDING: AtomicBool = AtomicBool::new(false);
static KEY_KEYCODE: AtomicU64 = AtomicU64::new(0);

/// Set by the CGEventTap callback. Called from a Mach port dispatch thread
/// where blocking or allocating is unsafe. Only atomic stores.
extern "C" fn cg_event_callback(
    _proxy: *mut std::ffi::c_void,
    _typ: u64,
    event: *mut std::ffi::c_void,
    _user_info: *mut std::ffi::c_void,
) -> *mut std::ffi::c_void {
    // Only process keydown events (type 10 = kCGEventKeyDown)
    if _typ == 10 {
        // CGEventGetIntegerValueField(event, kCGKeyboardEventKeycode)
        // We call this via a thin FFI wrapper
        let keycode = unsafe { get_keycode(event) } as u64;
        KEY_KEYCODE.store(keycode, Ordering::Relaxed);
        KEY_PENDING.store(true, Ordering::Release);
    }
    event
}

// FFI to CGEventGetIntegerValueField for kCGKeyboardEventKeycode (field 9).
// We declare this ourselves to avoid depending on core-graphics crate details.
extern "C" {
    fn CGEventGetIntegerValueField(
        event: *mut std::ffi::c_void,
        field: u32,
    ) -> i64;
}

unsafe fn get_keycode(event: *mut std::ffi::c_void) -> u16 {
    // kCGKeyboardEventKeycode = 9
    CGEventGetIntegerValueField(event, 9) as u16
}

// CGEventTap externals
type CGEventTapProxy = *mut std::ffi::c_void;
type CGEventTapCallBack = extern "C" fn(
    proxy: CGEventTapProxy,
    typ: u64,
    event: *mut std::ffi::c_void,
    user_info: *mut std::ffi::c_void,
) -> *mut std::ffi::c_void;

#[link(name = "ApplicationServices", kind = "framework")]
extern "C" {
    fn CGEventTapCreate(
        tap: u32,        // CGEventTapLocation = kCGHIDEventTap (0)
        place: u32,      // CGEventTapPlacement = kCGHeadInsertEventTap (0)
        options: u32,    // CGEventTapOptions = kCGEventTapOptionListenOnly (1)
        events_of_interest: u64,
        callback: CGEventTapCallBack,
        user_info: *mut std::ffi::c_void,
    ) -> *mut std::ffi::c_void; // CFMachPortRef

    fn CGEventTapEnable(tap: *mut std::ffi::c_void, enable: bool);
}

// CFRunLoop externals
#[link(name = "CoreFoundation", kind = "framework")]
extern "C" {
    fn CFRunLoopGetCurrent() -> *mut std::ffi::c_void;
    fn CFRunLoopRun();
    fn CFMachPortCreateRunLoopSource(
        allocator: *mut std::ffi::c_void,
        port: *mut std::ffi::c_void,
        order: i64,
    ) -> *mut std::ffi::c_void;
    fn CFRunLoopAddSource(
        rl: *mut std::ffi::c_void,
        source: *mut std::ffi::c_void,
        mode: *mut std::ffi::c_void,
    );

    // kCFRunLoopCommonModes is a CFStringRef constant, not a C string.
    // Using a C string literal would crash when CoreFoundation tries to
    // interpret it as a CFString object.
    static kCFRunLoopCommonModes: *mut std::ffi::c_void;
}

// Event mask: (1 << 10) = kCGEventKeyDown
const EVENT_MASK_KEYDOWN: u64 = 1 << 10;

#[derive(Clone, serde::Serialize)]
struct BongoEvent {
    side: BongoSide,
}

/// Manages the bongo keyboard monitor lifecycle.
/// Architecture:
///   1. CGEventTap thread — runs CFRunLoop, C callback does only atomic stores
///   2. Polling thread — reads atomic buffer, classifies keys, pushes to channel
///   3. Forwarder thread — consumes channel, calls app_handle.emit()
///
/// Threads 2 + 3 are normal Rust threads where Tauri APIs are safe.
pub struct BongoMonitor {
    app_handle: tauri::AppHandle,
    started: Mutex<bool>,
    enabled: Arc<AtomicBool>,
}

impl BongoMonitor {
    pub fn new(app_handle: tauri::AppHandle) -> Self {
        Self {
            app_handle,
            started: Mutex::new(false),
            enabled: Arc::new(AtomicBool::new(false)),
        }
    }

    pub fn set_active(&self, active: bool) -> Result<(), String> {
        self.enabled.store(active, Ordering::Relaxed);
        if active {
            self.ensure_started()
        } else {
            Ok(())
        }
    }

    fn ensure_started(&self) -> Result<(), String> {
        let mut started = self.started.lock().map_err(|e| e.to_string())?;
        if *started {
            return Ok(());
        }
        *started = true;
        drop(started);

        let (startup_tx, startup_rx) = mpsc::channel();
        let startup_tx_err = startup_tx.clone();

        // Channel from polling thread to forwarder thread
        let (ev_tx, ev_rx) = mpsc::channel::<BongoSide>();
        let enabled = Arc::clone(&self.enabled);

        // Thread 1: CGEventTap (runs CFRunLoop with minimal C callback)
        let _tap_thread = thread::Builder::new()
            .name("bongo-cgevent-tap".into())
            .spawn(move || {
                info!("bongo: starting CGEventTap");

                let result = catch_unwind(|| {
                    unsafe {
                        let tap = CGEventTapCreate(
                            0, // kCGHIDEventTap
                            0, // kCGHeadInsertEventTap
                            1, // kCGEventTapOptionListenOnly
                            EVENT_MASK_KEYDOWN,
                            cg_event_callback,
                            std::ptr::null_mut(),
                        );

                        if tap.is_null() {
                            return Err(
                                "无法创建键盘监听。请前往 系统设置 → 隐私与安全性 → 辅助功能 中授权本应用。"
                                    .to_string(),
                            );
                        }

                        let run_loop_source =
                            CFMachPortCreateRunLoopSource(std::ptr::null_mut(), tap, 0);
                        if run_loop_source.is_null() {
                            return Err("无法创建 RunLoop 事件源。".to_string());
                        }

                        let current_loop = CFRunLoopGetCurrent();
                        CFRunLoopAddSource(
                            current_loop,
                            run_loop_source,
                            kCFRunLoopCommonModes,
                        );
                        CGEventTapEnable(tap, true);

                        // Signal success before entering the run loop
                        let _ = startup_tx.send(Ok(()));

                        CFRunLoopRun();

                        Ok(())
                    }
                });

                match result {
                    Ok(Ok(())) => info!("bongo: CGEventTap stopped normally"),
                    Ok(Err(e)) => {
                        let _ = startup_tx.send(Err(e));
                    }
                    Err(_panic) => {
                        let _ = startup_tx.send(Err(
                            "键盘监听异常。请确认已授予辅助功能权限。".into(),
                        ));
                    }
                }
            })
            .inspect_err(|e| {
                warn!("bongo: failed to spawn CGEventTap thread: {}", e);
                let _ = startup_tx_err.send(Err(format!("无法启动键盘监听线程：{}", e)));
            })
            .ok();

        // Thread 2: Key event poller — polls the lock-free atomic buffer
        thread::Builder::new()
            .name("bongo-key-poller".into())
            .spawn(move || {
                info!("bongo: key poller running");
                loop {
                    if KEY_PENDING.swap(false, Ordering::Acquire) {
                        // Skip events when disabled; poller keeps running so
                        // we don't lose events during toggle transitions.
                        if enabled.load(Ordering::Relaxed) {
                            let keycode = KEY_KEYCODE.load(Ordering::Relaxed) as u16;
                            let side = classify_keycode(keycode);
                            // Unbounded send: blocks only if OOM, which won't happen
                            if ev_tx.send(side).is_err() {
                                info!("bongo: forwarder channel closed, poller exiting");
                                break;
                            }
                        }
                    }
                    thread::sleep(Duration::from_micros(500));
                }
            })
            .inspect_err(|e| warn!("bongo: failed to spawn key poller: {}", e))
            .ok();

        // Thread 3: Forwarder — normal thread, safe for Tauri emit
        let app_handle = self.app_handle.clone();
        thread::Builder::new()
            .name("bongo-forwarder".into())
            .spawn(move || {
                info!("bongo: forwarder running");
                for side in ev_rx {
                    if let Err(e) = app_handle.emit("bongo-tap", BongoEvent { side }) {
                        error!("bongo: forwarder emit failed: {}", e);
                    }
                }
                info!("bongo: forwarder stopped");
            })
            .inspect_err(|e| warn!("bongo: failed to spawn forwarder thread: {}", e))
            .ok();

        // Wait for CGEventTap startup
        match startup_rx.recv_timeout(Duration::from_millis(800)) {
            Ok(Err(e)) => {
                self.reset_on_failure();
                Err(e)
            }
            Ok(Ok(())) => {
                info!("bongo: monitor started successfully");
                Ok(())
            }
            Err(RecvTimeoutError::Timeout) => {
                info!("bongo: monitor running (CFRunLoop)");
                Ok(())
            }
            Err(RecvTimeoutError::Disconnected) => {
                self.reset_on_failure();
                Err("键盘监听线程意外退出，请确认已授予辅助功能权限。".into())
            }
        }
    }

    fn reset_on_failure(&self) {
        if let Ok(mut s) = self.started.lock() {
            *s = false;
        }
        self.enabled.store(false, Ordering::Relaxed);
    }
}
