# Desktop Pet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a pixel-art virtual desktop pet for macOS using Tauri v2 + TypeScript + HTML5 Canvas, starting with a cat character and supporting a plugin-based character system.

**Architecture:** Tauri v2 provides a transparent, frameless, always-on-top window. The TypeScript frontend runs a Canvas-based renderer driven by an animation system and state machine. Characters are directories containing a spritesheet.png + manifest.json + optional behaviors.js, loaded via a Rust-side Tauri command that scans both bundled and user directories.

**Tech Stack:** Tauri v2, Vite, TypeScript, HTML5 Canvas, Vitest

---

### Task 1: Scaffold Tauri v2 + Vite + TypeScript project

**Files:**
- Create: entire project scaffold via `npm create tauri-app`

- [ ] **Step 1: Create Tauri project**

```bash
cd /Users/zhengzhiwei/zzw/desktop-pet
npm create tauri-app@latest . -- --template vanilla-ts --manager npm
```

Expected: Scaffolds `src/`, `src-tauri/`, `package.json`, `tsconfig.json`, `vite.config.ts`

- [ ] **Step 2: Install frontend dependencies**

```bash
cd /Users/zhengzhiwei/zzw/desktop-pet
npm install
```

- [ ] **Step 3: Install Vitest for testing**

```bash
cd /Users/zhengzhiwei/zzw/desktop-pet
npm install -D vitest @vitest/ui
```

- [ ] **Step 4: Add test script to package.json**

Read `package.json`, add to `"scripts"`:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 5: Create vitest.config.ts**

Create `vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
  },
});
```

- [ ] **Step 6: Initialize git and commit**

### Task 2: Configure Tauri window (transparent, frameless, always-on-top)

**Files:**
- Modify: `src-tauri/tauri.conf.json`
- Modify: `src-tauri/src/lib.rs`

- Configure window for transparent, frameless, always-on-top
- Enable `macos-private-api` feature in Cargo.toml
- Set transparent HTML/CSS in index.html

### Task 3: Define character types and implement manifest loader

**Files:**
- Create: `src/types.ts`
- Create: `src/engine/loader.ts`
- Create: `tests/loader.test.ts`

Define CharacterManifest, AnimationConfig, ReminderConfig, LoadedCharacter, PetState types. Implement validateManifest, totalFrames, validateSpritesheet, loadCharacter functions. Write unit tests for validation.

### Task 4: Implement Canvas renderer

**Files:**
- Create: `src/engine/renderer.ts`
- Create: `tests/renderer.test.ts`

Implement Renderer class with double buffering (offscreen canvas), pixel-perfect scaling with image-rendering: pixelated, drawFrame method that crops spritesheet by frame index, drawBubble method for pixel text. Unit tests for initialization, frame drawing, canvas clearing.

### Task 5: Implement animation system

**Files:**
- Create: `src/engine/animator.ts`
- Create: `tests/animator.test.ts`

Implement Animator class: play(animName), tick(deltaMs) for frame advancement based on fps, loop support, animationEnd event for non-looping animations. Unit tests for frame advancement, looping, animation switching.

### Task 6: Implement behavior state machine

**Files:**
- Create: `src/engine/behavior.ts`
- Create: `tests/behavior.test.ts`

Implement BehaviorEngine with states: idle, walk, sleep, sit, drag, react. Random transitions from idle (3-8s intervals). handleClick, handleDragStart, handleDragEnd, handleAnimationEnd methods. stateChange event emission. Unit tests for all transitions.

### Task 7: Implement interactions (drag, click, right-click)

**Files:**
- Create: `src/interactions.ts`

Implement Interactions class using @tauri-apps/api/window and @tauri-apps/api/dpi. Drag detection with 5px threshold, window position via setPosition, click vs drag distinction, context menu event dispatch.

### Task 8: Implement reminder system and pixel bubble

**Files:**
- Create: `src/engine/bubble.ts`
- Create: `tests/bubble.test.ts`

Implement ReminderSystem with timed triggers from manifest config. Bubble display with pixel text rendering. Auto-dismiss after 5 seconds. Unit tests.

### Task 9: Create default cat character spritesheet + manifest

**Files:**
- Create: `src/characters/cat/manifest.json`
- Create: `src/characters/cat/generator.ts`
- Create: `tests/cat-generator.test.ts`

Cat manifest with idle/walk/sleep/sit/react animations. Programmatic spritesheet generation (14 frames × 32×32) via Canvas API, exported as data URL. Unit test for generator.

### Task 10: Wire everything together — app.ts and main loop

**Files:**
- Create: `src/app.ts`
- Modify: `src/main.ts`

Create initApp(canvas) orchestrator: load cat character, initialize Renderer/Animator/BehaviorEngine/ReminderSystem, register state transitions, wire events between components, start requestAnimationFrame main loop.

### Task 11: Tauri Rust backend — character directory scanning + context menu

**Files:**
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/Cargo.toml`

Add list_user_characters Tauri command that scans app data directory for character folders. Add serde/serde_json dependencies. Set up context menu handling.

### Task 12: Final integration test and verification

**Files:**
- Create: `tests/integration.test.ts`

Integration tests covering: cat manifest validation, all animations playable, full behavior flow (idle→click→react→idle, drag→drag end→idle), reminder firing order. Run full test suite and tauri build.
