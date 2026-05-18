# Desktop Pet

A Tauri desktop pet runtime rebuilt around a Codex-style fixed pet contract.

## Pet Contract

Built-in pet assets live under `src/pets/codex-cat/`:

```text
src/pets/codex-cat/
  pet.json
  spritesheet.webp
```

Custom pets are discovered from:

```text
~/.codex/pets/<pet-id>/
  pet.json
  spritesheet.webp
```

`pet.json` uses the minimal runtime contract:

```json
{
  "id": "codex-cat",
  "displayName": "Codex Cat",
  "description": "A compact Codex-style mascot cat for the desktop runtime.",
  "spritesheetPath": "spritesheet.webp"
}
```

## Atlas Layout

`spritesheet.webp` must be a fixed `8 x 9` atlas:

- cell size: `192x208`
- total size: `1536x1872`
- row order:
  - `idle`
  - `running-right`
  - `running-left`
  - `waving`
  - `jumping`
  - `failed`
  - `waiting`
  - `running`
  - `review`

## Development

Install dependencies:

```bash
npm install
```

Run tests:

```bash
npm test
```

Start the app:

```bash
npm run tauri dev
```

Build:

```bash
npm run build
```

## Current Default Asset

The runtime is wired for the new Codex pet contract. The checked-in `codex-cat` asset is currently a temporary placeholder derived from the previous local cat sheet because live `hatch-pet` image generation was blocked by the current network region for the OpenAI image API.
