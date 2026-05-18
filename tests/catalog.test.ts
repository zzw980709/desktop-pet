import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
  convertFileSrc: vi.fn((path: string) => `asset://${path}`),
}));

import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { discoverPets } from '../src/pets/catalog';

describe('pet catalog', () => {
  const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

  beforeEach(() => {
    vi.mocked(invoke).mockReset();
    vi.mocked(convertFileSrc).mockClear();
    warnSpy.mockClear();
  });

  it('marks built-in cat as non-removable', async () => {
    vi.mocked(invoke).mockResolvedValue([
      {
        manifest: {
          id: 'cat',
          displayName: '小猫',
          description: '默认桌面宠物猫',
          spritesheetPath: 'spritesheet.webp',
        },
        spritesheetPath: '/app_data/pets/cat/spritesheet.webp',
      },
    ]);

    const pets = await discoverPets();
    expect(pets).toHaveLength(1);
    expect(pets[0]?.id).toBe('cat');
    expect(pets[0]?.removable).toBe(false);
    expect(pets[0]?.source).toBe('built-in');
  });

  it('marks user pets as removable', async () => {
    vi.mocked(invoke).mockResolvedValue([
      {
        manifest: {
          id: 'cat',
          displayName: '小猫',
          description: '默认桌面宠物猫',
          spritesheetPath: 'spritesheet.webp',
        },
        spritesheetPath: '/app_data/pets/cat/spritesheet.webp',
      },
      {
        manifest: {
          id: 'desk-fox',
          displayName: 'Desk Fox',
          description: 'A quick fox',
          spritesheetPath: 'spritesheet.webp',
        },
        spritesheetPath: '/app_data/pets/desk-fox/spritesheet.webp',
      },
    ]);

    const pets = await discoverPets();
    expect(pets.map((p) => p.id)).toEqual(['cat', 'desk-fox']);
    expect(pets[1]?.removable).toBe(true);
    expect(pets[1]?.source).toBe('user');
  });

  it('skips duplicate pet ids', async () => {
    vi.mocked(invoke).mockResolvedValue([
      {
        manifest: {
          id: 'desk-fox',
          displayName: 'Desk Fox Alpha',
          description: 'First fox',
          spritesheetPath: 'spritesheet.webp',
        },
        spritesheetPath: '/app_data/pets/fox-alpha/spritesheet.webp',
      },
      {
        manifest: {
          id: 'desk-fox',
          displayName: 'Desk Fox Beta',
          description: 'Second fox',
          spritesheetPath: 'spritesheet.webp',
        },
        spritesheetPath: '/app_data/pets/fox-beta/spritesheet.webp',
      },
    ]);

    const pets = await discoverPets();
    expect(pets).toHaveLength(1);
    expect(pets[0]?.manifest.displayName).toBe('Desk Fox Alpha');
  });

  it('skips records with invalid manifest', async () => {
    vi.mocked(invoke).mockResolvedValue([
      {
        manifest: {
          id: '',
          displayName: 'Invalid',
          description: 'Broken',
          spritesheetPath: 'spritesheet.webp',
        },
        spritesheetPath: '/app_data/pets/broken/spritesheet.webp',
      },
      {
        manifest: {
          id: 'valid-pet',
          displayName: 'Valid Pet',
          description: 'A pet',
          spritesheetPath: 'spritesheet.webp',
        },
        spritesheetPath: '/app_data/pets/valid/spritesheet.webp',
      },
    ]);

    const pets = await discoverPets();
    expect(pets).toHaveLength(1);
    expect(pets[0]?.id).toBe('valid-pet');
  });

  it('returns empty array when discovery fails', async () => {
    vi.mocked(invoke).mockRejectedValue(new Error('discovery failed'));

    const pets = await discoverPets();
    expect(pets).toEqual([]);
    expect(warnSpy).toHaveBeenCalled();
  });
});
