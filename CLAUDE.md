# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run tauri dev       # Full app with hot-reload (Vite + Tauri window)
npm run tauri build     # Production build (DMG on macOS)
npm test                # vitest frontend tests
npm run tsc --noEmit    # TypeScript type check
cd src-tauri && cargo check            # Rust compile check
cd src-tauri && cargo test             # All Rust tests (12)
```

`npm run dev` only starts the Vite dev server — it does NOT launch the desktop pet window.

## Architecture

Tauri v2 app: Rust backend (commands, CC hook HTTP server) + TypeScript/Vite frontend (canvas sprite renderer, behavior state machine).

### Rust side (`src-tauri/src/`)

- **`lib.rs`** — App bootstrap, Tauri commands (`discover_pets`, `load_preferences`, `save_preferences`, `add_pet_from_spritesheet`, `remove_pet`, `install_cc_hooks`, `uninstall_cc_hooks`), `setup_app` starts CC hook server
- **`pets.rs`** — Pet discovery from `$APPDATA/pets/`, WebP/PNG dimension parsing, spritesheet validation constants (`EXPECTED_SPRITESHEET_W = 1536`, `CELL_H = 208`)
- **`cc_hooks.rs`** — HTTP server on `127.0.0.1:18920` that receives CC hook POSTs and emits `cc-event` to the frontend

### Frontend (`src/`)

- **`app.ts`** — Runtime wiring: init, render loop, menu action dispatch, `cc-event` listener, bubble display, roaming displacement application, preference saving
- **`engine/animator.ts`** — Per-state frame progression from fixed atlas rows
- **`engine/behavior.ts`** — Idle timer, random action state machine, click/drag/roaming transitions. `RESET_TO_IDLE_ON_END` states auto-return to idle on animation complete
- **`engine/renderer.ts`** — Canvas 2D pixel-art rendering
- **`engine/loader.ts`** — Pet manifest + spritesheet image loading
- **`pets/contract.ts`** — Atlas geometry constants (8-column grid, 192×208 cells)
- **`ui/appmenu.ts`** — Native macOS menu bar (also used on other platforms)
- **`ui/menu-model.ts`** — Menu action type definitions
- **`interactions.ts`** — Canvas click/drag event handling

### Data flow: CC hooks → pet reaction

```
Claude Code hook fires → notify.sh → curl POST 127.0.0.1:18920/event
  → CcHookServer → app_handle.emit("cc-event", pet_event)
  → frontend maps event name → PetState → behavior.forceState()
```

## Spritesheet Atlas Contract

Fixed 8-column grid, 192×208 px cells. Row-to-state mapping:

| Row | State |
|-----|-------|
| 0 | idle |
| 1 | running-right |
| 2 | running-left |
| 3 | waving |
| 4 | jumping |
| 5 | failed |
| 6 | waiting |
| 7 | running |
| 8 | review |

