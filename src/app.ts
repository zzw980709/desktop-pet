import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow, currentMonitor } from '@tauri-apps/api/window';
import { LogicalPosition } from '@tauri-apps/api/dpi';
import { loadPet } from './engine/loader';
import { Renderer } from './engine/renderer';
import { Animator } from './engine/animator';
import { BehaviorEngine } from './engine/behavior';
import { Interactions } from './interactions';
import { ContextMenu } from './ui/contextmenu';
import { NativeAppMenu } from './ui/appmenu';
import type { MenuAction } from './ui/menu-model';
import { CELL_HEIGHT, CELL_WIDTH } from './pets/contract';
import { discoverPets } from './pets/catalog';
import type { PetCatalogEntry, Preferences } from './types';

const DRAG_ANIMATED_STATES = new Set(['running-right', 'running-left']);

function getRenderScale(canvas: HTMLCanvasElement): number {
  const widthScale = (canvas.clientWidth || 64) / CELL_WIDTH;
  const heightScale = (canvas.clientHeight || 64) / CELL_HEIGHT;
  return Math.min(widthScale, heightScale) || 1;
}

function getWindowSize(canvas: HTMLCanvasElement) {
  const s = getRenderScale(canvas);
  return { w: 64 * s, h: 64 * s };
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
  const menu = new ContextMenu();
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
    menu.setPets(menuPets, currentPetId);
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
    menu.setPetSize(canvas.width, canvas.height);
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

  let heartAlpha = 0;
  const HEART_DURATION = 600;
  let heartTimer = 0;

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
          const result = await invoke<AddPetResult>('add_pet');
          if (result.success) {
            await refreshPets();
          } else if (result.error) {
            console.warn('[app] add pet failed:', result.error);
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
    }
  }

  menu.on(handleMenuAction);
  nativeMenu.on(handleMenuAction);

  new Interactions(canvas, behavior);

  window.addEventListener('pet:contextmenu', (() => {
    void menu.show().catch((error: unknown) => {
      console.error('[app] failed to show context menu', error);
    });
    void refreshPets().catch((error: unknown) => {
      console.error('[app] failed to refresh pets', error);
    });
  }) as EventListener);

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

      behavior.tick(deltaMs);

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
