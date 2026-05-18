# Desktop Pet

A Tauri desktop pet app built around a fixed Codex-style pet contract.

The current built-in pet is `codex-cat`, a generated mascot cat atlas with directional drag movement, click reactions, a redesigned in-window context menu, and matching actions exposed through the native app menu.

## Features

- Transparent always-on-top desktop pet window
- Fixed 8x9 Codex pet atlas contract
- Drag-to-move with left/right directional animation
- Click-to-wave interaction
- Native app menu integration for pet actions and pet switching
- Support for user-installed pets from `~/.codex/pets`

## Run

Install dependencies:

```bash
npm install
```

Start the desktop pet in development:

```bash
npm run tauri dev
```

Run the test suite:

```bash
npm test
```

Build the frontend bundle:

```bash
npm run build
```

Build the desktop app:

```bash
npm run tauri build
```

## Pet Contract

Built-in pets live in:

```text
src/pets/<pet-id>/
  pet.json
  spritesheet.webp
```

External pets are discovered from:

```text
~/.codex/pets/<pet-id>/
  pet.json
  spritesheet.webp
```

Minimal `pet.json`:

```json
{
  "id": "codex-cat",
  "displayName": "Codex Cat",
  "description": "A compact Codex-style mascot cat for the desktop runtime.",
  "spritesheetPath": "spritesheet.webp"
}
```

## Atlas Contract

`spritesheet.webp` must be a fixed `8 x 9` atlas:

- Cell size: `192x208`
- Total size: `1536x1872`
- Row order:
  - `idle`
  - `running-right`
  - `running-left`
  - `waving`
  - `jumping`
  - `failed`
  - `waiting`
  - `running`
  - `review`

Unused cells must remain transparent.

## Interaction Model

- Left click: wave
- Drag: move the pet window
- Horizontal drag: play `running-right` / `running-left`
- Right click: open the in-window action menu
- Native app menu: mirrors the same action set plus pet switching

## Project Structure

```text
src/
  app.ts                  runtime wiring
  interactions.ts         click/drag handling
  engine/
    animator.ts           atlas frame progression
    behavior.ts           runtime state machine
    loader.ts             pet manifest and spritesheet loading
    renderer.ts           canvas rendering
  pets/
    contract.ts           atlas geometry and manifest validation
    catalog.ts            built-in and external pet discovery
    codex-cat/            built-in pet asset
  ui/
    menu-model.ts         shared menu actions
    contextmenu.ts        in-window menu
    appmenu.ts            native app menu integration

src-tauri/
  src/lib.rs              Tauri commands and app bootstrap
  src/pets.rs             external pet filesystem discovery
```

## Adding a Custom Pet

1. Create a directory under `~/.codex/pets/<pet-id>/`
2. Add `pet.json`
3. Add a valid `spritesheet.webp` matching the atlas contract
4. Restart the app or reopen the menu so the catalog refreshes

If an external pet is malformed or its spritesheet size is invalid, it is skipped without breaking the app.

## Notes

- The app uses the Tauri window API, so plain `npm run dev` only starts the web dev server; it does not launch the desktop pet window.
- The repo ignores local generation and tool artifacts such as `tmp/`, `.agents/`, `assets/`, and `src-tauri/target/`.
