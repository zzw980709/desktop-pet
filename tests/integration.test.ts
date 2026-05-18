import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { validatePetManifest } from '../src/engine/loader';
import { Animator } from '../src/engine/animator';
import { BehaviorEngine } from '../src/engine/behavior';
import builtInPet from '../src/pets/codex-cat/pet.json';
import type { PetCatalogEntry, PetState } from '../src/types';

function makePetEntry(id: string, displayName: string, spritesheetUrl: string): PetCatalogEntry {
  return {
    id,
    source: id === 'codex-cat' ? 'built-in' : 'user',
    manifest: {
      id,
      displayName,
      description: `${displayName} description`,
      spritesheetPath: 'spritesheet.webp',
    },
    spritesheetUrl,
  };
}

describe('full pipeline', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('built-in pet.json is valid', () => {
    const manifest = validatePetManifest(builtInPet);
    expect(manifest).not.toBeNull();
    expect(manifest).toMatchObject({
      id: 'codex-cat',
      displayName: 'Codex Cat',
      spritesheetPath: 'spritesheet.webp',
    });
  });

  it('animator plays every built-in Codex pet state', () => {
    const animator = new Animator();
    const states: PetState[] = [
      'idle',
      'running-right',
      'running-left',
      'waving',
      'jumping',
      'failed',
      'waiting',
      'running',
      'review',
    ];

    for (const state of states) {
      expect(() => animator.play(state)).not.toThrow();
    }
  });

  it('behavior engine handles the Codex interaction flow', () => {
    const engine = new BehaviorEngine();

    expect(engine.currentState).toBe('idle');

    engine.handleClick();
    expect(engine.currentState).toBe('waving');

    engine.handleAnimationEnd();
    expect(engine.currentState).toBe('idle');

    engine.forceState('review');
    expect(engine.currentState).toBe('review');

    engine.handleDragStart();
    expect(engine.isDragging).toBe(true);

    engine.handleDragEnd();
    expect(engine.currentState).toBe('idle');
    expect(engine.isDragging).toBe(false);
  });

  it('app refresh reloads a fallback pet when the current one disappears', async () => {
    const codexCat = makePetEntry('codex-cat', 'Codex Cat', 'codex.webp');
    const orbitFox = makePetEntry('orbit-fox', 'Orbit Fox', 'orbit.webp');
    const loadPet = vi.fn(async (manifest: PetCatalogEntry['manifest'], spritesheetUrl: string) => ({
      manifest,
      spritesheet: { src: spritesheetUrl } as HTMLImageElement,
    }));
    const discoverPets = vi.fn()
      .mockResolvedValueOnce([codexCat, orbitFox])
      .mockResolvedValueOnce([orbitFox]);
    const setCharacter = vi.fn();
    const setPetSize = vi.fn();
    const setPets = vi.fn();
    const show = vi.fn().mockResolvedValue(undefined);
    let contextMenuListener: ((event: Event) => unknown) | undefined;
    let rendererCreations = 0;

    vi.doMock('../src/engine/loader', () => ({
      loadPet,
    }));
    vi.doMock('../src/pets/catalog', () => ({
      discoverPets,
    }));
    vi.doMock('../src/engine/renderer', () => ({
      Renderer: class MockRenderer {
        frameWidth = 192;
        frameHeight = 208;
        scale = 1;

        constructor() {
          rendererCreations += 1;
        }

        setCharacter(pet: unknown): void {
          setCharacter(pet);
        }

        drawFrame(): void {}

        drawHeart(): void {}
      },
    }));
    vi.doMock('../src/ui/contextmenu', () => ({
      ContextMenu: class MockContextMenu {
        on(): void {}

        setPetSize(width: number, height: number): void {
          setPetSize(width, height);
        }

        setPets(pets: Array<{ id: string; label: string }>, currentPetId: string): void {
          setPets(pets, currentPetId);
        }

        async show(): Promise<void> {
          await show();
        }
      },
    }));
    vi.doMock('../src/interactions', () => ({
      Interactions: class MockInteractions {},
    }));

    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
    vi.spyOn(window, 'addEventListener').mockImplementation(((type: string, listener: EventListenerOrEventListenerObject) => {
      if (type === 'pet:contextmenu') {
        contextMenuListener = listener as (event: Event) => unknown;
      }
    }) as typeof window.addEventListener);

    const { initApp } = await import('../src/app');
    const canvas = document.createElement('canvas');
    Object.defineProperty(canvas, 'clientWidth', { configurable: true, value: 64 });
    Object.defineProperty(canvas, 'clientHeight', { configurable: true, value: 64 });
    canvas.width = 300;
    canvas.height = 150;

    await initApp(canvas);
    expect(loadPet).toHaveBeenCalledTimes(1);
    expect(loadPet).toHaveBeenNthCalledWith(1, codexCat.manifest, 'codex.webp');
    expect(setPets).toHaveBeenLastCalledWith(
      [
        { id: 'codex-cat', label: 'Codex Cat' },
        { id: 'orbit-fox', label: 'Orbit Fox' },
      ],
      'codex-cat',
    );

    expect(contextMenuListener).toBeTruthy();
    contextMenuListener?.(new CustomEvent('pet:contextmenu'));

    await vi.waitFor(() => {
      expect(discoverPets).toHaveBeenCalledTimes(2);
      expect(loadPet).toHaveBeenCalledTimes(2);
      expect(loadPet).toHaveBeenLastCalledWith(orbitFox.manifest, 'orbit.webp');
      expect(setCharacter).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ manifest: orbitFox.manifest }),
      );
      expect(setPets).toHaveBeenLastCalledWith(
        [{ id: 'orbit-fox', label: 'Orbit Fox' }],
        'orbit-fox',
      );
    });
    expect(rendererCreations).toBeGreaterThanOrEqual(2);
    expect(show).toHaveBeenCalledTimes(1);
  });

  it('app sizes the menu from the rendered canvas dimensions', async () => {
    const codexCat = makePetEntry('codex-cat', 'Codex Cat', 'codex.webp');
    const loadPet = vi.fn(async (manifest: PetCatalogEntry['manifest'], spritesheetUrl: string) => ({
      manifest,
      spritesheet: { src: spritesheetUrl } as HTMLImageElement,
    }));
    const discoverPets = vi.fn().mockResolvedValue([codexCat]);
    const setPetSize = vi.fn();

    vi.doMock('../src/engine/loader', () => ({
      loadPet,
    }));
    vi.doMock('../src/pets/catalog', () => ({
      discoverPets,
    }));
    vi.doMock('../src/engine/renderer', () => ({
      Renderer: class MockRenderer {
        frameWidth = 96;
        frameHeight = 104;
        scale = 2.01;

        constructor(canvas: HTMLCanvasElement) {
          canvas.width = 193;
          canvas.height = 209;
        }

        setCharacter(): void {}

        drawFrame(): void {}

        drawHeart(): void {}
      },
    }));
    vi.doMock('../src/ui/contextmenu', () => ({
      ContextMenu: class MockContextMenu {
        on(): void {}

        setPetSize(width: number, height: number): void {
          setPetSize(width, height);
        }

        setPets(): void {}

        async show(): Promise<void> {}
      },
    }));
    vi.doMock('../src/interactions', () => ({
      Interactions: class MockInteractions {},
    }));

    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));

    const { initApp } = await import('../src/app');
    const canvas = document.createElement('canvas');
    Object.defineProperty(canvas, 'clientWidth', { configurable: true, value: 64 });
    Object.defineProperty(canvas, 'clientHeight', { configurable: true, value: 64 });

    await initApp(canvas);

    expect(setPetSize).toHaveBeenCalledWith(193, 209);
  });

  it('app keeps directional drag animations ticking while dragging', async () => {
    const codexCat = makePetEntry('codex-cat', 'Codex Cat', 'codex.webp');
    const loadPet = vi.fn(async (manifest: PetCatalogEntry['manifest'], spritesheetUrl: string) => ({
      manifest,
      spritesheet: { src: spritesheetUrl } as HTMLImageElement,
    }));
    const discoverPets = vi.fn().mockResolvedValue([codexCat]);
    const animatorState = {
      isPaused: false,
      currentCell: { row: 1, column: 0 },
    };
    const animatorPlay = vi.fn();
    const animatorPause = vi.fn(() => {
      animatorState.isPaused = true;
    });
    const animatorResume = vi.fn(() => {
      animatorState.isPaused = false;
    });
    const animatorTick = vi.fn();
    const behaviorTick = vi.fn();
    const rafCallbacks: FrameRequestCallback[] = [];

    vi.doMock('../src/engine/loader', () => ({
      loadPet,
    }));
    vi.doMock('../src/pets/catalog', () => ({
      discoverPets,
    }));
    vi.doMock('../src/engine/renderer', () => ({
      Renderer: class MockRenderer {
        constructor(canvas: HTMLCanvasElement) {
          canvas.width = 192;
          canvas.height = 208;
        }

        setCharacter(): void {}

        drawFrame(): void {}

        drawHeart(): void {}
      },
    }));
    vi.doMock('../src/ui/contextmenu', () => ({
      ContextMenu: class MockContextMenu {
        on(): void {}
        setPetSize(): void {}
        setPets(): void {}
        async show(): Promise<void> {}
      },
    }));
    vi.doMock('../src/interactions', () => ({
      Interactions: class MockInteractions {},
    }));
    vi.doMock('../src/engine/behavior', () => ({
      BehaviorEngine: class MockBehaviorEngine {
        currentState: PetState = 'running-right';
        isDragging = true;

        on(): void {}
        tick(deltaMs: number): void {
          behaviorTick(deltaMs);
        }
        handleAnimationEnd(): void {}
        forceState(): void {}
      },
    }));
    vi.doMock('../src/engine/animator', () => ({
      Animator: class MockAnimator {
        currentCell = animatorState.currentCell;
        currentState: PetState = 'running-right';
        currentAnimation: PetState = 'running-right';
        currentFrame = 8;

        on(): void {}
        get isPaused(): boolean {
          return animatorState.isPaused;
        }
        play(state: PetState): void {
          animatorPlay(state);
        }
        pause(): void {
          animatorPause();
        }
        resume(): void {
          animatorResume();
        }
        tick(deltaMs: number): void {
          animatorTick(deltaMs);
        }
      },
    }));

    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
      rafCallbacks.push(callback);
      return rafCallbacks.length;
    }));

    const { initApp } = await import('../src/app');
    const canvas = document.createElement('canvas');
    Object.defineProperty(canvas, 'clientWidth', { configurable: true, value: 64 });
    Object.defineProperty(canvas, 'clientHeight', { configurable: true, value: 64 });

    await initApp(canvas);

    expect(animatorPlay).toHaveBeenCalledWith('running-right');
    expect(rafCallbacks.length).toBeGreaterThan(0);

    rafCallbacks[0]?.(16);

    expect(behaviorTick).toHaveBeenCalledWith(expect.any(Number));
    expect(animatorTick).toHaveBeenCalledWith(expect.any(Number));
    expect(animatorPause).not.toHaveBeenCalled();
    expect(animatorResume).not.toHaveBeenCalled();
  });

  it('app does not mark a fallback pet current when fallback loading fails', async () => {
    const codexCat = makePetEntry('codex-cat', 'Codex Cat', 'codex.webp');
    const orbitFox = makePetEntry('orbit-fox', 'Orbit Fox', 'orbit.webp');
    const loadPet = vi.fn()
      .mockResolvedValueOnce({
        manifest: codexCat.manifest,
        spritesheet: { src: 'codex.webp' } as HTMLImageElement,
      })
      .mockResolvedValueOnce(null);
    const discoverPets = vi.fn()
      .mockResolvedValueOnce([codexCat, orbitFox])
      .mockResolvedValueOnce([orbitFox]);
    const setPets = vi.fn();
    const show = vi.fn().mockResolvedValue(undefined);
    let contextMenuListener: ((event: Event) => unknown) | undefined;

    vi.doMock('../src/engine/loader', () => ({
      loadPet,
    }));
    vi.doMock('../src/pets/catalog', () => ({
      discoverPets,
    }));
    vi.doMock('../src/engine/renderer', () => ({
      Renderer: class MockRenderer {
        frameWidth = 192;
        frameHeight = 208;
        scale = 1;

        setCharacter(): void {}

        drawFrame(): void {}

        drawHeart(): void {}
      },
    }));
    vi.doMock('../src/ui/contextmenu', () => ({
      ContextMenu: class MockContextMenu {
        on(): void {}

        setPetSize(): void {}

        setPets(pets: Array<{ id: string; label: string }>, currentPetId: string): void {
          setPets(pets, currentPetId);
        }

        async show(): Promise<void> {
          await show();
        }
      },
    }));
    vi.doMock('../src/interactions', () => ({
      Interactions: class MockInteractions {},
    }));

    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
    vi.spyOn(window, 'addEventListener').mockImplementation(((type: string, listener: EventListenerOrEventListenerObject) => {
      if (type === 'pet:contextmenu') {
        contextMenuListener = listener as (event: Event) => unknown;
      }
    }) as typeof window.addEventListener);

    const { initApp } = await import('../src/app');
    const canvas = document.createElement('canvas');
    Object.defineProperty(canvas, 'clientWidth', { configurable: true, value: 64 });
    Object.defineProperty(canvas, 'clientHeight', { configurable: true, value: 64 });

    await initApp(canvas);
    expect(contextMenuListener).toBeTruthy();
    contextMenuListener?.(new CustomEvent('pet:contextmenu'));

    await vi.waitFor(() => {
      expect(loadPet).toHaveBeenCalledTimes(2);
      expect(loadPet).toHaveBeenLastCalledWith(orbitFox.manifest, 'orbit.webp');
      expect(setPets).toHaveBeenLastCalledWith(
        [{ id: 'orbit-fox', label: 'Orbit Fox' }],
        'codex-cat',
      );
    });
    expect(show).toHaveBeenCalledTimes(1);
  });

  it('app preserves loaded metadata when a same-id refresh changes in place but reload fails', async () => {
    const codexCat = makePetEntry('codex-cat', 'Codex Cat', 'codex.webp');
    const refreshedCodexCat = makePetEntry('codex-cat', 'Codex Cat Reloaded', 'codex-reloaded.webp');
    const orbitFox = makePetEntry('orbit-fox', 'Orbit Fox', 'orbit.webp');
    const loadPet = vi.fn()
      .mockResolvedValueOnce({
        manifest: codexCat.manifest,
        spritesheet: { src: 'codex.webp' } as HTMLImageElement,
      })
      .mockResolvedValueOnce(null);
    const discoverPets = vi.fn()
      .mockResolvedValueOnce([codexCat, orbitFox])
      .mockResolvedValueOnce([refreshedCodexCat, orbitFox]);
    const setPets = vi.fn();
    const show = vi.fn().mockResolvedValue(undefined);
    let contextMenuListener: ((event: Event) => unknown) | undefined;

    vi.doMock('../src/engine/loader', () => ({
      loadPet,
    }));
    vi.doMock('../src/pets/catalog', () => ({
      discoverPets,
    }));
    vi.doMock('../src/engine/renderer', () => ({
      Renderer: class MockRenderer {
        frameWidth = 192;
        frameHeight = 208;
        scale = 1;

        setCharacter(): void {}

        drawFrame(): void {}

        drawHeart(): void {}
      },
    }));
    vi.doMock('../src/ui/contextmenu', () => ({
      ContextMenu: class MockContextMenu {
        on(): void {}

        setPetSize(): void {}

        setPets(pets: Array<{ id: string; label: string }>, currentPetId: string): void {
          setPets(pets, currentPetId);
        }

        async show(): Promise<void> {
          await show();
        }
      },
    }));
    vi.doMock('../src/interactions', () => ({
      Interactions: class MockInteractions {},
    }));

    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
    vi.spyOn(window, 'addEventListener').mockImplementation(((type: string, listener: EventListenerOrEventListenerObject) => {
      if (type === 'pet:contextmenu') {
        contextMenuListener = listener as (event: Event) => unknown;
      }
    }) as typeof window.addEventListener);

    const { initApp } = await import('../src/app');
    const canvas = document.createElement('canvas');
    Object.defineProperty(canvas, 'clientWidth', { configurable: true, value: 64 });
    Object.defineProperty(canvas, 'clientHeight', { configurable: true, value: 64 });

    await initApp(canvas);
    expect(contextMenuListener).toBeTruthy();
    await contextMenuListener?.(new CustomEvent('pet:contextmenu'));

    expect(loadPet).toHaveBeenCalledTimes(2);
    expect(loadPet).toHaveBeenLastCalledWith(refreshedCodexCat.manifest, 'codex-reloaded.webp');
    expect(setPets).toHaveBeenLastCalledWith(
      [
        { id: 'codex-cat', label: 'Codex Cat' },
        { id: 'orbit-fox', label: 'Orbit Fox' },
      ],
      'codex-cat',
    );
    expect(show).toHaveBeenCalledTimes(1);
  });

  it('app refresh reloads the current pet even when the catalog entry fields are unchanged', async () => {
    const codexCat = makePetEntry('codex-cat', 'Codex Cat', 'codex.webp');
    const orbitFox = makePetEntry('orbit-fox', 'Orbit Fox', 'orbit.webp');
    const refreshedCodexCat = makePetEntry('codex-cat', 'Codex Cat', 'codex.webp');
    const loadPet = vi.fn(async (manifest: PetCatalogEntry['manifest'], spritesheetUrl: string) => ({
      manifest,
      spritesheet: { src: spritesheetUrl } as HTMLImageElement,
    }));
    const discoverPets = vi.fn()
      .mockResolvedValueOnce([codexCat, orbitFox])
      .mockResolvedValueOnce([refreshedCodexCat, orbitFox]);
    const setCharacter = vi.fn();
    const show = vi.fn().mockResolvedValue(undefined);
    let contextMenuListener: ((event: Event) => unknown) | undefined;

    vi.doMock('../src/engine/loader', () => ({
      loadPet,
    }));
    vi.doMock('../src/pets/catalog', () => ({
      discoverPets,
    }));
    vi.doMock('../src/engine/renderer', () => ({
      Renderer: class MockRenderer {
        frameWidth = 192;
        frameHeight = 208;
        scale = 1;

        setCharacter(pet: unknown): void {
          setCharacter(pet);
        }

        drawFrame(): void {}

        drawHeart(): void {}
      },
    }));
    vi.doMock('../src/ui/contextmenu', () => ({
      ContextMenu: class MockContextMenu {
        on(): void {}

        setPetSize(): void {}

        setPets(): void {}

        async show(): Promise<void> {
          await show();
        }
      },
    }));
    vi.doMock('../src/interactions', () => ({
      Interactions: class MockInteractions {},
    }));

    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
    vi.spyOn(window, 'addEventListener').mockImplementation(((type: string, listener: EventListenerOrEventListenerObject) => {
      if (type === 'pet:contextmenu') {
        contextMenuListener = listener as (event: Event) => unknown;
      }
    }) as typeof window.addEventListener);

    const { initApp } = await import('../src/app');
    const canvas = document.createElement('canvas');
    Object.defineProperty(canvas, 'clientWidth', { configurable: true, value: 64 });
    Object.defineProperty(canvas, 'clientHeight', { configurable: true, value: 64 });

    await initApp(canvas);
    expect(contextMenuListener).toBeTruthy();
    contextMenuListener?.(new CustomEvent('pet:contextmenu'));

    await vi.waitFor(() => {
      expect(loadPet).toHaveBeenCalledTimes(2);
      expect(loadPet).toHaveBeenLastCalledWith(refreshedCodexCat.manifest, 'codex.webp');
      expect(setCharacter).toHaveBeenCalledTimes(2);
    });
    expect(show).toHaveBeenCalledTimes(1);
  });

  it('app switches pets through the menu handler while the menu is closed', async () => {
    const codexCat = makePetEntry('codex-cat', 'Codex Cat', 'codex.webp');
    const orbitFox = makePetEntry('orbit-fox', 'Orbit Fox', 'orbit.webp');
    const loadPet = vi.fn(async (manifest: PetCatalogEntry['manifest'], spritesheetUrl: string) => ({
      manifest,
      spritesheet: { src: spritesheetUrl } as HTMLImageElement,
    }));
    const discoverPets = vi.fn().mockResolvedValue([codexCat, orbitFox]);
    const setCharacter = vi.fn();
    const setPetSize = vi.fn();
    const setPets = vi.fn();
    const rendererSizes = [
      { frameWidth: 192, frameHeight: 208, scale: 1 },
      { frameWidth: 144, frameHeight: 176, scale: 1 },
    ];
    let menuHandler: ((action: { type: 'pet'; petId: string }) => void) | undefined;

    vi.doMock('../src/engine/loader', () => ({
      loadPet,
    }));
    vi.doMock('../src/pets/catalog', () => ({
      discoverPets,
    }));
    vi.doMock('../src/engine/renderer', () => ({
      Renderer: class MockRenderer {
        frameWidth: number;
        frameHeight: number;
        scale: number;

        constructor() {
          const nextSize = rendererSizes.shift() ?? { frameWidth: 144, frameHeight: 176, scale: 1 };
          this.frameWidth = nextSize.frameWidth;
          this.frameHeight = nextSize.frameHeight;
          this.scale = nextSize.scale;
        }

        setCharacter(pet: unknown): void {
          setCharacter(pet);
        }

        drawFrame(): void {}

        drawHeart(): void {}
      },
    }));
    vi.doMock('../src/ui/contextmenu', () => ({
      ContextMenu: class MockContextMenu {
        on(handler: (action: { type: 'pet'; petId: string }) => void): void {
          menuHandler = handler;
        }

        setPetSize(width: number, height: number): void {
          setPetSize(width, height);
        }

        setPets(pets: Array<{ id: string; label: string }>, currentPetId: string): void {
          setPets(pets, currentPetId);
        }

        async show(): Promise<void> {}
      },
    }));
    vi.doMock('../src/interactions', () => ({
      Interactions: class MockInteractions {},
    }));

    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));

    const { initApp } = await import('../src/app');
    const canvas = document.createElement('canvas');
    Object.defineProperty(canvas, 'clientWidth', { configurable: true, value: 64 });
    Object.defineProperty(canvas, 'clientHeight', { configurable: true, value: 64 });

    await initApp(canvas);

    expect(menuHandler).toBeTruthy();
    setPetSize.mockClear();
    setPets.mockClear();

    menuHandler?.({ type: 'pet', petId: 'orbit-fox' });
    await Promise.resolve();

    expect(loadPet).toHaveBeenCalledTimes(2);
    expect(loadPet).toHaveBeenLastCalledWith(orbitFox.manifest, 'orbit.webp');
    expect(setCharacter).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ manifest: orbitFox.manifest }),
    );
    expect(setPetSize).toHaveBeenCalledWith(300, 150);
    expect(setPets).toHaveBeenLastCalledWith(
      [
        { id: 'codex-cat', label: 'Codex Cat' },
        { id: 'orbit-fox', label: 'Orbit Fox' },
      ],
      'orbit-fox',
    );
  });

  it('app handles a rejected menu.show call from the context menu event listener', async () => {
    const codexCat = makePetEntry('codex-cat', 'Codex Cat', 'codex.webp');
    const loadPet = vi.fn(async (manifest: PetCatalogEntry['manifest'], spritesheetUrl: string) => ({
      manifest,
      spritesheet: { src: spritesheetUrl } as HTMLImageElement,
    }));
    const discoverPets = vi.fn()
      .mockResolvedValueOnce([codexCat])
      .mockResolvedValueOnce([codexCat]);
    const showError = new Error('menu show failed');
    const show = vi.fn().mockRejectedValue(showError);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    let contextMenuListener: ((event: Event) => unknown) | undefined;

    vi.doMock('../src/engine/loader', () => ({
      loadPet,
    }));
    vi.doMock('../src/pets/catalog', () => ({
      discoverPets,
    }));
    vi.doMock('../src/engine/renderer', () => ({
      Renderer: class MockRenderer {
        frameWidth = 192;
        frameHeight = 208;
        scale = 1;

        setCharacter(): void {}

        drawFrame(): void {}

        drawHeart(): void {}
      },
    }));
    vi.doMock('../src/ui/contextmenu', () => ({
      ContextMenu: class MockContextMenu {
        on(): void {}

        setPetSize(): void {}

        setPets(): void {}

        async show(): Promise<void> {
          await show();
        }
      },
    }));
    vi.doMock('../src/interactions', () => ({
      Interactions: class MockInteractions {},
    }));

    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
    vi.spyOn(window, 'addEventListener').mockImplementation(((type: string, listener: EventListenerOrEventListenerObject) => {
      if (type === 'pet:contextmenu') {
        contextMenuListener = listener as (event: Event) => unknown;
      }
    }) as typeof window.addEventListener);

    const { initApp } = await import('../src/app');
    const canvas = document.createElement('canvas');
    Object.defineProperty(canvas, 'clientWidth', { configurable: true, value: 64 });
    Object.defineProperty(canvas, 'clientHeight', { configurable: true, value: 64 });

    await initApp(canvas);
    expect(contextMenuListener).toBeTruthy();

    contextMenuListener?.(new CustomEvent('pet:contextmenu'));
    await vi.waitFor(() => {
      expect(errorSpy).toHaveBeenCalledWith('[app] failed to show context menu', showError);
    });
  });
});
