import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
  convertFileSrc: vi.fn((path: string) => `asset://${path}`),
}));

import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import {
  discoverPets,
  getBuiltInPet,
  resolveExternalPetRecord,
  type ExternalPetRecord,
} from '../src/pets/catalog';

describe('pet catalog', () => {
  const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

  beforeEach(() => {
    vi.mocked(invoke).mockReset();
    vi.mocked(convertFileSrc).mockClear();
    warnSpy.mockClear();
  });

  it('builds the built-in pet entry from pet.json and spritesheet.webp', () => {
    const entry = getBuiltInPet();

    expect(entry.id).toBe('codex-cat');
    expect(entry.source).toBe('built-in');
    expect(entry.manifest).toEqual({
      id: 'codex-cat',
      displayName: 'Codex Cat',
      description: 'A compact Codex-style mascot cat for the desktop runtime.',
      spritesheetPath: 'spritesheet.webp',
    });
    expect(entry.spritesheetUrl).toContain('spritesheet.webp');
  });

  it('resolves a valid external pet record into a catalog entry', () => {
    const entry = resolveExternalPetRecord({
      manifest: {
        id: 'desk-fox',
        displayName: 'Desk Fox',
        description: 'A quick fox',
        spritesheetPath: 'spritesheet.webp',
      },
      spritesheetPath: '/tmp/desk-fox/spritesheet.webp',
    });

    expect(entry?.id).toBe('desk-fox');
    expect(entry?.source).toBe('user');
    expect(entry?.spritesheetUrl).toBe('asset:///tmp/desk-fox/spritesheet.webp');
    expect(convertFileSrc).toHaveBeenCalledWith('/tmp/desk-fox/spritesheet.webp');
  });

  it('rejects external pet records with invalid metadata', () => {
    expect(resolveExternalPetRecord({
      manifest: {
        id: '',
        displayName: 'Bad',
        description: 'Bad',
        spritesheetPath: 'spritesheet.webp',
      },
      spritesheetPath: '/tmp/bad/spritesheet.webp',
    })).toBeNull();
  });

  it('rejects external pet records with an empty spritesheet path', () => {
    expect(resolveExternalPetRecord({
      manifest: {
        id: 'desk-fox',
        displayName: 'Desk Fox',
        description: 'A quick fox',
        spritesheetPath: 'spritesheet.webp',
      },
      spritesheetPath: '',
    })).toBeNull();
  });

  it('returns the built-in pet plus valid external pets from discovery', async () => {
    const records: ExternalPetRecord[] = [
      {
        manifest: {
          id: 'desk-fox',
          displayName: 'Desk Fox',
          description: 'A quick fox',
          spritesheetPath: 'spritesheet.webp',
        },
        spritesheetPath: '/tmp/desk-fox/spritesheet.webp',
      },
      {
        manifest: {
          id: '',
          displayName: 'Invalid',
          description: 'Broken',
          spritesheetPath: 'spritesheet.webp',
        },
        spritesheetPath: '/tmp/broken/spritesheet.webp',
      },
      {
        manifest: {
          id: 'codex-cat',
          displayName: 'Duplicate Cat',
          description: 'Should be skipped',
          spritesheetPath: 'spritesheet.webp',
        },
        spritesheetPath: '/tmp/duplicate/spritesheet.webp',
      },
    ];
    vi.mocked(invoke).mockResolvedValue(records);

    const pets = await discoverPets();

    expect(vi.mocked(invoke)).toHaveBeenCalledWith('discover_pets');
    expect(pets.map((pet) => pet.id)).toEqual(['codex-cat', 'desk-fox']);
  });

  it('keeps the first external pet when duplicate ids are discovered', async () => {
    const records: ExternalPetRecord[] = [
      {
        manifest: {
          id: 'desk-fox',
          displayName: 'Desk Fox Alpha',
          description: 'First fox',
          spritesheetPath: 'spritesheet.webp',
        },
        spritesheetPath: '/tmp/alpha/spritesheet.webp',
      },
      {
        manifest: {
          id: 'desk-fox',
          displayName: 'Desk Fox Beta',
          description: 'Second fox',
          spritesheetPath: 'spritesheet.webp',
        },
        spritesheetPath: '/tmp/beta/spritesheet.webp',
      },
    ];
    vi.mocked(invoke).mockResolvedValue(records);

    const pets = await discoverPets();

    expect(pets.map((pet) => pet.id)).toEqual(['codex-cat', 'desk-fox']);
    expect(pets[1]?.manifest.displayName).toBe('Desk Fox Alpha');
    expect(pets[1]?.spritesheetUrl).toBe('asset:///tmp/alpha/spritesheet.webp');
  });

  it('returns only the built-in pet when external discovery fails', async () => {
    vi.mocked(invoke).mockRejectedValue(new Error('discovery failed'));

    const pets = await discoverPets();

    expect(vi.mocked(invoke)).toHaveBeenCalledWith('discover_pets');
    expect(pets.map((pet) => pet.id)).toEqual(['codex-cat']);
    expect(warnSpy).toHaveBeenCalled();
  });
});
