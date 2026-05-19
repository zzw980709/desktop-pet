# Desktop Pet

A Tauri v2 desktop pet app for macOS. A transparent always-on-top window renders a pixel art cat that reacts to drag, click, and keyboard input (bongocat).

The built-in pet is `cat`, a pixel art mascot with directional drag movement, click-to-wave, random idle actions, and bongocat paw-tap animations triggered by keyboard typing.

## Features

- Transparent always-on-top desktop pet window
- 8×11 spritesheet atlas with pixel art animations
- Drag-to-move with left/right directional animation
- Click-to-wave interaction
- Random idle actions (running, jumping, waiting, reviewing)
- **Bongocat** — paw-tap animations synced to left/right keyboard zones via CGEventTap
- In-window context menu (right-click) and native macOS menu bar
- Multi-pet support with add/remove from file dialog

## Run

```bash
npm install          # Install dependencies
npm run tauri dev    # Start dev mode with hot-reload
npm run tauri build  # Production build (outputs DMG)
npm test             # Run vitest test suite
```

Note: plain `npm run dev` only starts the Vite dev server — it does not launch the desktop pet window.

## Atlas Contract

`spritesheet.webp` is a fixed 8-column grid with 192×208 px cells.

- Cell size: 192×208
- Width: 1536 px (8 columns)
- Height: 208 × N px (minimum 1872 px / 9 rows, currently 2288 px / 11 rows)

Row order:

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
| 9 | bongo-left |
| 10 | bongo-right |

Unused cells must remain transparent.

## Interaction Model

- **Left click:** wave
- **Drag:** move the pet window; horizontal movement triggers `running-right`/`running-left`
- **Right click:** in-window context menu
- **Keyboard:** typing triggers bongocat paw-tap animations (left-zone keys → left paw, right-zone keys → right paw)
- **Native app menu:** mirrors state actions, pet switching, and pet management

## Pet Contract

Built-in pets are bundled in `src-tauri/resources/<pet-id>/`. External pets are discovered from the app data directory (via `discover_pets` Rust command).

Each pet directory contains:

```
pet.json          # Manifest with id, displayName, spritesheetPath
spritesheet.webp  # Must match the atlas contract
```

Minimal `pet.json`:

```json
{
  "id": "cat",
  "displayName": "Cat",
  "description": "A pixel art desktop cat.",
  "spritesheetPath": "spritesheet.webp"
}
```

## Project Structure

```
src/
  main.ts                 Entry point
  app.ts                  Runtime wiring (init, render loop, menu handling)
  interactions.ts         Click/drag handling on canvas
  types.ts                Shared TypeScript types
  engine/
    animator.ts           Atlas frame progression (per-state frame durations)
    behavior.ts           Idle timer + random action state machine
    loader.ts             Pet manifest/spriteheet loading and validation
    renderer.ts           Canvas 2D rendering with pixel-art scaling
  pets/
    contract.ts           Atlas geometry constants and manifest validation
    catalog.ts            Pet discovery (Rust command bridge)
  ui/
    menu-model.ts         Shared menu action types and state items
    contextmenu.ts        In-window HTML/CSS context menu
    appmenu.ts            Native macOS menu bar integration

src-tauri/
  src/lib.rs              Tauri commands, app bootstrap, preferences
  src/pets.rs             External pet filesystem discovery + WebP dimension parser
  src/bongo/
    mod.rs
    monitor.rs            CGEventTap keyboard monitor (3-thread architecture)
    classifier.rs         QWERTY keycode → Left/Right zone classification
  resources/cat/          Built-in pet (embedded at build time)
  Cargo.toml

scripts/
  generate_bongo_frames.py   Bongo paw-tap animation frame generator (Pillow)
  true_pixelate.py           Pixel art conversion script
```

## Adding a Custom Pet

1. Use the "添加宠物..." menu item or select a `pet.json` via file dialog
2. The directory must contain `pet.json` + `spritesheet.webp` matching the atlas contract
3. The app copies the pet into its data directory and refreshes the menu

## Bongo Keyboard Monitor

The bongocat feature monitors global keyboard input via CGEventTap. It auto-starts on app launch (requires Accessibility permission on macOS). If permission is not granted, the monitor fails silently and bongo animations are skipped.

Three-thread architecture:
1. **CGEventTap thread** — C callback does only atomic stores (lock-free), runs CFRunLoop
2. **Key poller thread** — reads atomic buffer every 500µs, classifies keycodes by QWERTY zone
3. **Forwarder thread** — emits `bongo-tap` events to the Tauri frontend
