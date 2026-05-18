import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Renderer } from '../src/engine/renderer';
import type { LoadedPet, PetManifest } from '../src/types';
import { ATLAS_COLUMNS, ATLAS_ROWS, CELL_HEIGHT, CELL_WIDTH } from '../src/pets/contract';

function makePet(): LoadedPet {
  const manifest: PetManifest = {
    id: 'codex-cat',
    displayName: 'Codex Cat',
    description: 'Mascot cat',
    spritesheetPath: 'spritesheet.webp',
  };

  const spritesheet = document.createElement('canvas');
  spritesheet.width = CELL_WIDTH * ATLAS_COLUMNS;
  spritesheet.height = CELL_HEIGHT * ATLAS_ROWS;

  return {
    manifest,
    spritesheet: spritesheet as unknown as HTMLImageElement,
  };
}

describe('Renderer', () => {
  let canvas: HTMLCanvasElement;
  let renderer: Renderer;

  beforeEach(() => {
    canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
  });

  it('initializes with given scale', () => {
    renderer = new Renderer(canvas, 3);
    expect(renderer.scale).toBe(3);
    expect(renderer.frameWidth).toBe(CELL_WIDTH);
    expect(renderer.frameHeight).toBe(CELL_HEIGHT);
  });

  it('drawFrame does not throw with a valid atlas cell', () => {
    renderer = new Renderer(canvas, 2);
    renderer.setCharacter(makePet());

    expect(() => renderer.drawFrame({ row: 2, column: 3 })).not.toThrow();
  });

  it('drawFrame clears the canvas and draws the requested atlas slice', () => {
    renderer = new Renderer(canvas, 2);
    renderer.setCharacter(makePet());

    const ctx = canvas.getContext('2d')!;
    const clearSpy = vi.spyOn(ctx, 'clearRect');
    const offscreenDrawSpy = vi.spyOn((renderer as any).offCtx, 'drawImage');

    renderer.drawFrame({ row: 2, column: 3 });

    expect(clearSpy).toHaveBeenCalledWith(0, 0, canvas.width, canvas.height);
    expect(offscreenDrawSpy).toHaveBeenCalledWith(
      expect.any(HTMLCanvasElement),
      CELL_WIDTH * 3,
      CELL_HEIGHT * 2,
      CELL_WIDTH,
      CELL_HEIGHT,
      0,
      0,
      CELL_WIDTH,
      CELL_HEIGHT,
    );
  });
});
