# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run tauri dev    # Dev mode with hot-reload (frontend + Rust backend)
npm run tauri build  # Production build, outputs DMG to src-tauri/target/release/bundle/dmg/
npm test             # Run vitest tests (jsdom environment)
npm run build        # TypeScript check + Vite frontend bundle only
```

## Architecture

This is a **Tauri v2** desktop pet app for macOS. A transparent, always-on-top, undecorated window renders a pixel art cat that animates through a fixed spritesheet atlas, responds to drag/click interactions, and taps along with keyboard input (bongocat).

**Three-layer architecture:**

| Layer | Technology | Location |
|-------|-----------|----------|
| Frontend render loop | TypeScript + Canvas 2D | `src/` |
| Tauri command bridge | Rust (`tauri::command`) | `src-tauri/src/lib.rs` |
| Bongo keyboard monitor | Raw CGEventTap FFI (3 threads) | `src-tauri/src/bongo/` |

**Frontend engine pipeline (per frame via `requestAnimationFrame`):**

1. `BehaviorEngine.tick(deltaMs)` — idle timer → random action transitions. Drag/click/bongo events bypass the timer.
2. `Animator.tick(deltaMs)` — advances current animation's column index based on per-frame durations. Emits event on non-looping animation end → BehaviorEngine returns to idle.
3. `Renderer.drawFrame(cell)` — copies the spritesheet cell (via getFrameRect) to offscreen canvas at 1:1, then scaled to display canvas with `imageSmoothingEnabled = false` for crisp pixel art.

**Spritesheet contract** (`src/pets/contract.ts`):
- Cell size: 192×208 px. 8 columns. Variable rows (currently 11).
- Row index = animation state (see `Animator.PET_ANIMATIONS`).
- Bongo rows: 9 = bongo-left, 10 = bongo-right (4 frames each for paw tap).

**BehaviorEngine state machine:**
- Idle → random action (3-8s timer) → auto-return to idle (looping actions timeout at 4s; one-shot actions like waving/jumping/bongo return on animation end).
- Drag: `handleDragStart` → `handleDragMove(deltaX)` sets running-left/right → `handleDragEnd` with 180ms settle timer → idle.
- `Interactions` class owns mousedown/move/up on the canvas, accumulates horizontal delta with 8px threshold before signaling direction changes.

**Bongo keyboard monitor (3-thread architecture):**
1. CGEventTap thread — runs CFRunLoop. C callback `cg_event_callback` does only atomic stores to lock-free `KEY_PENDING`/`KEY_KEYCODE` statics. No allocation, no mutex, no Tauri calls.
2. Key poller thread — polls atomics every 500µs, classifies keycodes via `classify_keycode()` (QWERTY touch-typing zones → Left/Right), pushes to `mpsc::channel`.
3. Forwarder thread — consumes channel, calls `app_handle.emit("bongo-tap", ...)` which the frontend listens for.

Bongo always auto-starts on app launch (permissions permitting). On macOS, it requires Accessibility permissions. CGEventTap startup failure surfaces a user-facing error message in Chinese.

**Pet discovery** (`src/pets/catalog.ts` → `discover_pets` Rust command → `src-tauri/src/pets.rs`):
- Built-in pet `cat` is initialized from embedded resources into `app_data_dir/pets/cat/` on first run.
- External pets are discovered from `app_data_dir/pets/*/` directories, each containing `pet.json` + `spritesheet.webp`.
- `pet.json` must have `"spritesheetPath": "spritesheet.webp"`. Spritesheet width must be 1536px, height must be a multiple of 208px and ≥ 1872px.

**Menus:** Two UIs share `MenuAction` type and `handleMenuAction` in `app.ts`:
- `ContextMenu` — inline HTML/CSS panel positioned next to the canvas. Builds/rebuilds DOM on pet list changes. Manages window resize (toggles between 64×64 and pet+menu width).
- `NativeAppMenu` — Tauri native macOS menu bar. Mirrors the same state/pet/management actions.

**Preferences:** Window position and active pet ID persisted to `app_data_dir/preferences.json` via `save_preferences`/`load_preferences` Rust commands.

## Key invariants

- The `Animator.currentFrameIndex` is always clamped to the current animation's `usedColumns` range.
- `BehaviorEngine.dragging` prevents tick-based transitions during drag; only `handleDragMove` sets state.
- Bongo states restart on every tap (even same side) to allow rapid retriggering.
- The `petLoadVersion` integer in `app.ts` prevents stale async `loadPet` completions from overwriting a newer pet switch.
