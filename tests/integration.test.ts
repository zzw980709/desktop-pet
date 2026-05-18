import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
  convertFileSrc: vi.fn((path: string) => `asset://${path}`),
}));

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    setPosition: vi.fn(async () => undefined),
    setSize: vi.fn(async () => undefined),
    outerPosition: vi.fn(async () => ({ x: 100, y: 200 })),
  }),
}));

vi.mock('@tauri-apps/api/dpi', () => ({
  LogicalPosition: class LogicalPosition {
    constructor(
      public x: number,
      public y: number,
    ) {}
  },
  LogicalSize: class LogicalSize {
    constructor(
      public width: number,
      public height: number,
    ) {}
  },
}));

vi.mock('@tauri-apps/api/menu', () => ({
  Menu: {
    new: vi.fn(async () => ({
      setAsAppMenu: vi.fn(async () => undefined),
    })),
  },
}));

import { invoke } from '@tauri-apps/api/core';

describe('integration', () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset();
    document.body.innerHTML = `
      <canvas id="pet-canvas" width="64" height="64" style="width:64px;height:64px"></canvas>
      <div id="ctx-menu"></div>
    `;
  });

  it('loads preferences and discovers pets from app_data on startup', async () => {
    vi.mocked(invoke)
      .mockImplementation((cmd: string) => {
        if (cmd === 'load_preferences') {
          return Promise.resolve({
            activePetId: 'cat',
          });
        }
        if (cmd === 'discover_pets') {
          return Promise.resolve([
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
        }
        return Promise.resolve(null);
      });

    const prefs = await invoke('load_preferences');
    expect(prefs).toEqual({ activePetId: 'cat' });

    const pets = await invoke('discover_pets');
    expect(Array.isArray(pets)).toBe(true);
    expect(pets).toHaveLength(1);
  });

  it('add_pet command flow works end-to-end', async () => {
    vi.mocked(invoke)
      .mockImplementation((cmd: string) => {
        if (cmd === 'add_pet') {
          return Promise.resolve({
            success: true,
            petId: 'new-pet',
          });
        }
        if (cmd === 'discover_pets') {
          return Promise.resolve([
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
                id: 'new-pet',
                displayName: 'New Pet',
                description: 'A new pet',
                spritesheetPath: 'spritesheet.webp',
              },
              spritesheetPath: '/app_data/pets/new-pet/spritesheet.webp',
            },
          ]);
        }
        return Promise.resolve(null);
      });

    const result = await invoke('add_pet');
    expect(result).toEqual({ success: true, petId: 'new-pet' });

    const pets = await invoke('discover_pets');
    expect(pets).toHaveLength(2);
  });

  it('remove_pet rejects built-in cat', async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === 'remove_pet') {
        return Promise.resolve({
          success: false,
          error: '内置宠物不可移除',
        });
      }
      return Promise.resolve(null);
    });

    const result = await invoke('remove_pet', { petId: 'cat' });
    expect(result).toEqual({ success: false, error: '内置宠物不可移除' });
  });

  it('remove_pet succeeds for user pets', async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === 'remove_pet') {
        return Promise.resolve({ success: true });
      }
      if (cmd === 'discover_pets') {
        return Promise.resolve([
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
      }
      return Promise.resolve(null);
    });

    const removeResult = await invoke('remove_pet', { petId: 'desk-fox' });
    expect(removeResult).toEqual({ success: true });

    const pets = await invoke('discover_pets');
    expect(pets).toHaveLength(1);
    expect(pets[0]?.manifest?.id).toBe('cat');
  });
});
