import { loadPet } from './engine/loader';
import { Renderer } from './engine/renderer';
import { Animator } from './engine/animator';
import { BehaviorEngine } from './engine/behavior';
import { Interactions } from './interactions';
import { ContextMenu } from './ui/contextmenu';
import { CELL_HEIGHT, CELL_WIDTH } from './pets/contract';
import { discoverPets } from './pets/catalog';
import type { PetCatalogEntry } from './types';

function getRenderScale(canvas: HTMLCanvasElement): number {
  const widthScale = (canvas.clientWidth || 64) / CELL_WIDTH;
  const heightScale = (canvas.clientHeight || 64) / CELL_HEIGHT;
  return Math.min(widthScale, heightScale) || 1;
}

export async function initApp(canvas: HTMLCanvasElement): Promise<void> {
  let pets = await discoverPets();
  const initialPet = pets[0];
  if (!initialPet) {
    console.error('No pets available');
    return;
  }

  const behavior = new BehaviorEngine();
  const animator = new Animator();
  const menu = new ContextMenu();
  const renderScale = getRenderScale(canvas);
  let renderer = new Renderer(canvas, renderScale);
  let activePet = initialPet;
  let petLoadVersion = 0;

  function syncMenuPets(entries: PetCatalogEntry[], currentPetId: string): void {
    menu.setPets(
      entries.map((pet) => ({
        id: pet.id,
        label: pet.manifest.displayName,
      })),
      currentPetId,
    );
  }

  function keepLoadedPetMetadata(entries: PetCatalogEntry[]): PetCatalogEntry[] {
    return entries.map((pet) => (pet.id === activePet.id ? activePet : pet));
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
        const switched = await switchPet(fallbackPet, discovered);
        if (switched) {
          return;
        }
      }

      syncMenuPets(pets, activePet.id);
      return;
    }

    const switched = await switchPet(currentPet, discovered);
    if (switched) {
      return;
    }

    pets = keepLoadedPetMetadata(discovered);
    syncMenuPets(pets, activePet.id);
  }

  animator.on(() => {
    behavior.handleAnimationEnd();
  });

  const switched = await switchPet(initialPet);
  if (!switched) {
    console.error(`Failed to load initial pet ${initialPet.id}`);
    return;
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

  menu.on((action) => {
    if (action.type === 'pet') {
      const nextPet = pets.find((pet) => pet.id === action.petId);
      if (nextPet) {
        void switchPet(nextPet);
      }
      return;
    }

    behavior.forceState(action.state);
  });

  new Interactions(canvas, behavior);

  window.addEventListener('pet:contextmenu', (() => {
    void menu.show().catch((error: unknown) => {
      console.error('[app] failed to show context menu', error);
    });
    void refreshPets().catch((error: unknown) => {
      console.error('[app] failed to refresh pets', error);
    });
  }) as EventListener);

  let lastTime = performance.now();

  function loop(currentTime: number): void {
    const deltaMs = currentTime - lastTime;
    lastTime = currentTime;

    behavior.tick(deltaMs);

    if (behavior.isDragging) {
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

    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);
}
