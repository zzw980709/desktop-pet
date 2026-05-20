import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow, currentMonitor } from '@tauri-apps/api/window';
import { LogicalPosition } from '@tauri-apps/api/dpi';
import { loadPet } from './engine/loader';
import { Renderer } from './engine/renderer';
import { Animator } from './engine/animator';
import { BehaviorEngine } from './engine/behavior';
import { Interactions } from './interactions';
import { NativeAppMenu } from './ui/appmenu';
import type { MenuAction } from './ui/menu-model';
import { CELL_HEIGHT, CELL_WIDTH } from './pets/contract';
import { discoverPets } from './pets/catalog';
import type { PetCatalogEntry, PetState, Preferences } from './types';

const DRAG_ANIMATED_STATES = new Set(['running-right', 'running-left']);
const EDGE_DETECT_MARGIN = 40;

function getRenderScale(canvas: HTMLCanvasElement): number {
  const widthScale = (canvas.clientWidth || 64) / CELL_WIDTH;
  const heightScale = (canvas.clientHeight || 64) / CELL_HEIGHT;
  return Math.min(widthScale, heightScale) || 1;
}

function getWindowSize(canvas: HTMLCanvasElement) {
  // Canvas fills the window; use CSS pixel dimensions for screen-bounds clamping
  return {
    w: canvas.clientWidth || 64,
    h: canvas.clientHeight || 64,
  };
}

async function clampToMonitor(x: number, y: number, canvas: HTMLCanvasElement): Promise<{ x: number; y: number }> {
  try {
    const monitor = await currentMonitor().catch(() => null);
    if (monitor) {
      const { w, h } = getWindowSize(canvas);
      const scale = monitor.scaleFactor;
      const maxX = Math.max(0, (monitor.size.width / scale) - w);
      const maxY = Math.max(0, (monitor.size.height / scale) - h);
      return {
        x: Math.max(0, Math.min(x, maxX)),
        y: Math.max(0, Math.min(y, maxY)),
      };
    }
  } catch {
    // fall through to fallback
  }
  // Fallback: always keep position on-screen
  return { x: Math.max(0, x), y: Math.max(0, y) };
}

interface AddPetResult {
  success: boolean;
  petId?: string;
  error?: string;
}

interface RemovePetResult {
  success: boolean;
  error?: string;
}

interface SpritesheetValidation {
  valid: boolean;
  width: number;
  height: number;
  error?: string;
}

function validateSpritesheetDimensions(img: HTMLImageElement): SpritesheetValidation {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const EXPECTED_W = 1536;
  const CELL_H = 208;
  const MIN_H = 1872;
  if (w !== EXPECTED_W) {
    return { valid: false, width: w, height: h, error: `宽度须为 ${EXPECTED_W}px，实际 ${w}px` };
  }
  if (h < MIN_H) {
    return { valid: false, width: w, height: h, error: `高度至少 ${MIN_H}px，实际 ${h}px` };
  }
  if (h % CELL_H !== 0) {
    return { valid: false, width: w, height: h, error: `高度须为 ${CELL_H}px 的整倍数，实际 ${h}px` };
  }
  return { valid: true, width: w, height: h };
}

export async function initApp(canvas: HTMLCanvasElement): Promise<void> {
  const prefs = await invoke<Preferences>('load_preferences');

  if (prefs.windowPosition) {
    const clamped = await clampToMonitor(
      prefs.windowPosition.x,
      prefs.windowPosition.y,
      canvas,
    );
    if (clamped.x !== prefs.windowPosition.x || clamped.y !== prefs.windowPosition.y) {
      console.warn(`[app] clamped off-screen position from (${prefs.windowPosition.x},${prefs.windowPosition.y}) to (${clamped.x},${clamped.y})`);
    }
    await getCurrentWindow().setPosition(
      new LogicalPosition(clamped.x, clamped.y),
    ).catch(() => {});
  }

  let pets = await discoverPets();
  if (pets.length === 0) {
    console.error('No pets available');
    return;
  }

  const preferredPet = pets.find((p) => p.id === prefs.activePetId) ?? pets[0];
  if (!preferredPet) {
    return;
  }

  const behavior = new BehaviorEngine();
  const animator = new Animator();
  const nativeMenu = new NativeAppMenu();
  const renderScale = getRenderScale(canvas);
  let renderer = new Renderer(canvas, renderScale);
  let activePet = preferredPet;
  let petLoadVersion = 0;

  async function savePrefs(): Promise<void> {
    try {
      const pos = await getCurrentWindow().outerPosition();
      const clamped = await clampToMonitor(pos.x, pos.y, canvas);
      await invoke('save_preferences', {
        preferences: {
          activePetId: activePet.id,
          windowPosition: { x: clamped.x, y: clamped.y },
        },
      });
    } catch (err) {
      console.warn('[app] failed to save preferences:', err);
    }
  }

  function syncMenuPets(entries: PetCatalogEntry[], currentPetId: string): void {
    const menuPets = entries.map((pet) => ({
      id: pet.id,
      label: pet.manifest.displayName,
      removable: pet.removable,
    }));
    void nativeMenu.setPets(menuPets, currentPetId).catch((error: unknown) => {
      console.error('[app] failed to sync native app menu', error);
    });
  }

  async function switchPet(entry: PetCatalogEntry, availablePets: PetCatalogEntry[] = pets): Promise<boolean> {
    const loadVersion = ++petLoadVersion;
    const loadedPet = await loadPet(entry.manifest, entry.spritesheetUrl);
    if (!loadedPet) {
      console.warn(`[app] failed to load pet ${entry.id}`);
      return false;
    }
    if (loadVersion !== petLoadVersion) {
      return false;
    }

    activePet = entry;
    pets = availablePets;
    renderer = new Renderer(canvas, renderScale);
    renderer.setCharacter(loadedPet);
    syncMenuPets(pets, activePet.id);
    animator.play(behavior.currentState);

    void savePrefs();
    return true;
  }

  async function refreshPets(): Promise<void> {
    const discovered = await discoverPets();
    if (discovered.length === 0) return;

    const currentPet = discovered.find((pet) => pet.id === activePet.id);
    if (!currentPet) {
      pets = discovered;
      const fallbackPet = discovered[0];
      if (fallbackPet) {
        await switchPet(fallbackPet, discovered);
        return;
      }
      syncMenuPets(pets, activePet.id);
      return;
    }

    pets = discovered;
    syncMenuPets(pets, activePet.id);
  }

  function showPetImportModal(): Promise<{ sourcePath: string; displayName: string } | null> {
    return new Promise((resolve) => {
      const overlay = document.getElementById('pet-import-overlay')!;
      const pickBtn = document.getElementById('pet-import-pick-btn')!;
      const fileInfo = document.getElementById('pet-import-file-info')!;
      const nameInput = document.getElementById('pet-import-name-input') as HTMLInputElement;
      const cancelBtn = document.getElementById('pet-import-cancel-btn')!;
      const confirmBtn = document.getElementById('pet-import-confirm-btn')! as HTMLButtonElement;

      let selectedPath: string | null = null;
      let isValid = false;

      function updateConfirm(): void {
        confirmBtn.disabled = !(isValid && nameInput.value.trim().length > 0);
      }

      function resetModal(): void {
        selectedPath = null;
        isValid = false;
        nameInput.value = '';
        fileInfo.textContent = '';
        fileInfo.className = 'pet-import-file-info';
        confirmBtn.disabled = true;
      }

      pickBtn.addEventListener('click', async () => {
        try {
          const path = await invoke<string | null>('pick_spritesheet');
          if (!path) return;

          selectedPath = path;
          const fileName = path.split(/[/\\]/).pop() || path;
          fileInfo.textContent = `检查中: ${fileName}...`;
          fileInfo.className = 'pet-import-file-info';

          // Validate dimensions by loading the image
          const assetUrl = convertFileSrc(path);
          const img = new Image();
          img.onload = () => {
            const result = validateSpritesheetDimensions(img);
            isValid = result.valid;
            if (result.valid) {
              fileInfo.textContent = `${fileName} (${result.width}x${result.height})`;
              fileInfo.className = 'pet-import-file-info ok';
            } else {
              fileInfo.textContent = `${fileName} — ${result.error}`;
              fileInfo.className = 'pet-import-file-info err';
            }
            updateConfirm();
          };
          img.onerror = () => {
            isValid = false;
            fileInfo.textContent = `无法读取: ${fileName}`;
            fileInfo.className = 'pet-import-file-info err';
            updateConfirm();
          };
          img.src = assetUrl;
        } catch (err) {
          console.error('[app] pick_spritesheet failed:', err);
        }
      });

      nameInput.addEventListener('input', updateConfirm);

      function cleanup(): void {
        overlay.classList.remove('show');
        resetModal();
      }

      cancelBtn.addEventListener('click', () => {
        cleanup();
        resolve(null);
      });

      confirmBtn.addEventListener('click', () => {
        if (!selectedPath || !isValid || !nameInput.value.trim()) return;
        const displayName = nameInput.value.trim();
        cleanup();
        resolve({ sourcePath: selectedPath, displayName });
      });

      // Close on backdrop click
      overlay.querySelector('.pet-import-backdrop')?.addEventListener('click', () => {
        cleanup();
        resolve(null);
      });

      resetModal();
      overlay.classList.add('show');
    });
  }

  animator.on(() => {
    behavior.handleAnimationEnd();
  });

  let switched = await switchPet(preferredPet);
  if (!switched) {
    // Try fallback: iterate through available pets
    const fallback = pets.find((p) => p.id !== preferredPet.id);
    if (fallback) {
      console.warn(`[app] initial pet ${preferredPet.id} failed, falling back to ${fallback.id}`);
      switched = await switchPet(fallback);
    }
    if (!switched) {
      console.error(`[app] failed to load any pet`);
      return;
    }
  }

  // Initialize roaming with screen bounds
  let screenW = 1920;
  let screenH = 1080;
  let cachedRoamX = 0;
  let cachedRoamY = 0;
  const initPos = await getCurrentWindow().outerPosition().catch(() => null);
  if (initPos) {
    cachedRoamX = initPos.x;
    cachedRoamY = initPos.y;
  }
  const mon = await currentMonitor().catch(() => null);
  if (mon) {
    const scale = mon.scaleFactor;
    screenW = mon.size.width / scale;
    screenH = mon.size.height / scale;
  }
  behavior.setScreenBounds(screenW, screenH);
  behavior.setCurrentPosition(cachedRoamX, cachedRoamY);
  behavior.startRoaming();

  let heartAlpha = 0;
  const HEART_DURATION = 600;
  let heartTimer = 0;
  let edgeRedirectCooldown = 0;

  behavior.on((nextState) => {
    animator.play(nextState);
    if (nextState === 'waving') {
      heartAlpha = 1;
      heartTimer = HEART_DURATION;
    }
  });

  async function handleMenuAction(action: MenuAction): Promise<void> {
    switch (action.type) {
      case 'state':
        behavior.forceState(action.state);
        break;
      case 'pet':
        {
          const nextPet = pets.find((pet) => pet.id === action.petId);
          if (nextPet) {
            await switchPet(nextPet);
          }
        }
        break;
      case 'addPet':
        {
          const result = await showPetImportModal();
          if (result) {
            const addResult = await invoke<AddPetResult>('add_pet_from_spritesheet', {
              sourcePath: result.sourcePath,
              displayName: result.displayName,
            });
            if (addResult.success) {
              await refreshPets();
            } else if (addResult.error) {
              console.warn('[app] add pet failed:', addResult.error);
            }
          }
        }
        break;
      case 'removePet':
        {
          const result = await invoke<RemovePetResult>('remove_pet', {
            petId: action.petId,
          });
          if (result.success) {
            await refreshPets();
          } else if (result.error) {
            console.warn('[app] remove pet failed:', result.error);
          }
        }
        break;
      case 'installCcHooks':
        {
          const result = await invoke<{ success: boolean; error?: string }>('install_cc_hooks');
          if (!result.success && result.error) {
            console.warn('[app] install CC hooks failed:', result.error);
          }
        }
        break;
      case 'uninstallCcHooks':
        {
          const result = await invoke<{ success: boolean; error?: string }>('uninstall_cc_hooks');
          if (!result.success && result.error) {
            console.warn('[app] uninstall CC hooks failed:', result.error);
          }
        }
        break;
    }
  }

  nativeMenu.on(handleMenuAction);

  // Bongo keyboard event listener
  void await listen<{ side: string }>('bongo-tap', (event) => {
    try {
      const bongoState = event.payload.side === 'Left' ? 'bongo-left' : 'bongo-right';
      behavior.handleBongoTap(event.payload.side === 'Left' ? 'left' : 'right');
      animator.play(bongoState);
    } catch (err) {
      console.error('[app] bongo tap error:', err);
    }
  });

  // CC Hook event listener
  void listen<string>('cc-event', (event) => {
    try {
      const stateMap: Record<string, PetState> = {
        'thinking': 'review',
        'tool-calling': 'running',
        'waiting': 'waiting',
        'context-compacted': 'failed',
        'completion': 'waving',
      };
      const petState = stateMap[event.payload];
      if (petState) {
        behavior.forceState(petState);
        animator.play(petState);
      }
    } catch (err) {
      console.error('[app] cc-event error:', err);
    }
  });

  new Interactions(canvas, behavior);

  window.addEventListener('mouseup', () => {
    if (behavior.isDragging) return;
    setTimeout(() => {
      void savePrefs();
    }, 200);
  });

  let lastTime = performance.now();

  let loopErrorCount = 0;
  let loopErrorTime = 0;

  function loop(currentTime: number): void {
    try {
      const deltaMs = currentTime - lastTime;
      lastTime = currentTime;

      // Feed current position before tick so behavior can compute target
      if (behavior.roamingActive) {
        behavior.setCurrentPosition(cachedRoamX, cachedRoamY);
      }

      behavior.tick(deltaMs);

      // Apply roaming displacement after tick
      if (behavior.roamingActive) {
        const disp = behavior.roamingDisplacement;
        if (disp.dx !== 0 || disp.dy !== 0) {
          cachedRoamX += disp.dx;
          cachedRoamY += disp.dy;

          // Clamp to screen bounds (account for window size)
          const { w, h } = getWindowSize(canvas);
          cachedRoamX = Math.max(0, Math.min(cachedRoamX, screenW - w));
          cachedRoamY = Math.max(0, Math.min(cachedRoamY, screenH - h));

          // Edge detection with cooldown to prevent rapid-fire retargeting
          edgeRedirectCooldown = Math.max(0, edgeRedirectCooldown - deltaMs);
          if (edgeRedirectCooldown === 0) {
            if (cachedRoamX <= EDGE_DETECT_MARGIN) {
              behavior.redirectFromEdge('left');
              edgeRedirectCooldown = 500;
            } else if (cachedRoamX + w >= screenW - EDGE_DETECT_MARGIN) {
              behavior.redirectFromEdge('right');
              edgeRedirectCooldown = 500;
            }
          }

          getCurrentWindow().setPosition(
            new LogicalPosition(cachedRoamX, cachedRoamY),
          ).catch(() => {});
        }
      }

      const shouldAnimateWhileDragging =
        behavior.isDragging && DRAG_ANIMATED_STATES.has(behavior.currentState);

      if (behavior.isDragging && !shouldAnimateWhileDragging) {
        if (!animator.isPaused) {
          animator.pause();
        }
      } else {
        if (animator.isPaused) {
          animator.resume();
        }
        animator.tick(deltaMs);
      }

      renderer.drawFrame(animator.currentCell);

      if (heartAlpha > 0) {
        heartTimer -= deltaMs;
        heartAlpha = Math.max(0, heartTimer / HEART_DURATION);
        renderer.drawHeart(heartAlpha);
      }
    } catch (err) {
      // Rate-limit loop errors to 1 per 2 seconds
      const now = performance.now();
      if (now - loopErrorTime > 2000) {
        loopErrorTime = now;
        loopErrorCount++;
        console.error(`[app] render loop error (count=${loopErrorCount}):`, err);
      }
    }

    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);
}
