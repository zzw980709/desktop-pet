import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ATLAS_COLUMNS,
  ATLAS_ROWS,
  CELL_HEIGHT,
  CELL_WIDTH,
  getFrameRect,
  SPRITESHEET_PATH,
  validatePetManifest,
} from '../src/pets/contract';
import * as loader from '../src/engine/loader';
import { loadPet, validatePetSpritesheet } from '../src/engine/loader';

const imageScenarios = new Map<string, { error?: boolean; width: number; height: number }>();

class MockImage {
  naturalWidth = 0;
  naturalHeight = 0;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  private currentSrc = '';

  get src(): string {
    return this.currentSrc;
  }

  set src(value: string) {
    this.currentSrc = value;
    const scenario = imageScenarios.get(value);

    queueMicrotask(() => {
      if (scenario?.error) {
        this.onerror?.();
        return;
      }

      this.naturalWidth = scenario?.width ?? 0;
      this.naturalHeight = scenario?.height ?? 0;
      this.onload?.();
    });
  }
}

beforeEach(() => {
  imageScenarios.clear();
  vi.stubGlobal('Image', MockImage as unknown as typeof Image);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  imageScenarios.clear();
});

describe('validatePetManifest', () => {
  it('accepts the minimal pet.json contract', () => {
    expect(validatePetManifest({
      id: 'codex-cat',
      displayName: 'Codex Cat',
      description: 'Mascot cat',
      spritesheetPath: SPRITESHEET_PATH,
    })).toEqual({
      id: 'codex-cat',
      displayName: 'Codex Cat',
      description: 'Mascot cat',
      spritesheetPath: SPRITESHEET_PATH,
    });
  });

  it('rejects missing spritesheetPath', () => {
    expect(validatePetManifest({ id: 'x', displayName: 'X', description: 'X' })).toBeNull();
  });

  it('rejects a spritesheetPath outside the fixed contract', () => {
    expect(validatePetManifest({
      id: 'codex-cat',
      displayName: 'Codex Cat',
      description: 'Mascot cat',
      spritesheetPath: 'cat.webp',
    })).toBeNull();
  });
});

describe('validatePetSpritesheet', () => {
  it('requires the fixed 8x9 atlas size', () => {
    const valid = { naturalWidth: CELL_WIDTH * ATLAS_COLUMNS, naturalHeight: CELL_HEIGHT * ATLAS_ROWS } as HTMLImageElement;
    const invalidWidth = { naturalWidth: CELL_WIDTH * 6, naturalHeight: CELL_HEIGHT * ATLAS_ROWS } as HTMLImageElement;
    const invalidHeight = { naturalWidth: CELL_WIDTH * ATLAS_COLUMNS, naturalHeight: CELL_HEIGHT * 8 } as HTMLImageElement;

    expect(validatePetSpritesheet(valid)).toBe(true);
    expect(validatePetSpritesheet(invalidWidth)).toBe(false);
    expect(validatePetSpritesheet(invalidHeight)).toBe(false);
  });
});

describe('getFrameRect', () => {
  it('maps row and column to atlas coordinates', () => {
    expect(getFrameRect(2, 3)).toEqual({ sx: 576, sy: 416, sw: 192, sh: 208 });
  });
});

describe('loader exports', () => {
  it('does not expose legacy loader aliases', () => {
    expect('validateManifest' in loader).toBe(false);
    expect('validateSpritesheet' in loader).toBe(false);
    expect('loadCharacter' in loader).toBe(false);
  });
});

describe('loadPet', () => {
  const manifest = {
    id: 'codex-cat',
    displayName: 'Codex Cat',
    description: 'Mascot cat',
    spritesheetPath: SPRITESHEET_PATH,
  } as const;

  it('loads a pet when the image matches the fixed atlas contract', async () => {
    imageScenarios.set('ok.webp', {
      width: CELL_WIDTH * ATLAS_COLUMNS,
      height: CELL_HEIGHT * ATLAS_ROWS,
    });

    const loaded = await loadPet(manifest, 'ok.webp');

    expect(loaded).not.toBeNull();
    expect(loaded?.manifest).toEqual(manifest);
    expect(loaded?.spritesheet.naturalWidth).toBe(CELL_WIDTH * ATLAS_COLUMNS);
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('returns null when the image size does not match the fixed atlas contract', async () => {
    imageScenarios.set('bad-size.webp', {
      width: CELL_WIDTH * (ATLAS_COLUMNS - 1),
      height: CELL_HEIGHT * ATLAS_ROWS,
    });

    await expect(loadPet(manifest, 'bad-size.webp')).resolves.toBeNull();
    expect(console.warn).toHaveBeenCalledWith('[loader] Spritesheet size mismatch for codex-cat');
  });

  it('returns null when the image fails to load', async () => {
    imageScenarios.set('missing.webp', {
      width: 0,
      height: 0,
      error: true,
    });

    await expect(loadPet(manifest, 'missing.webp')).resolves.toBeNull();
    expect(console.warn).toHaveBeenCalledWith('[loader] Failed to load spritesheet for codex-cat');
  });
});
