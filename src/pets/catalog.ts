import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import type { PetCatalogEntry, PetManifest } from '../types';
import { validatePetManifest } from '../engine/loader';
import builtInManifestRaw from './codex-cat/pet.json';
import builtInSpritesheetUrl from './codex-cat/spritesheet.webp';

export interface ExternalPetRecord {
  manifest: unknown;
  spritesheetPath: string;
}

function getValidatedManifest(manifest: unknown): PetManifest | null {
  return validatePetManifest(manifest);
}

export function getBuiltInPet(): PetCatalogEntry {
  const manifest = getValidatedManifest(builtInManifestRaw);
  if (!manifest) {
    throw new Error('Built-in pet.json is invalid');
  }

  return {
    id: manifest.id,
    source: 'built-in',
    manifest,
    spritesheetUrl: builtInSpritesheetUrl,
  };
}

export function resolveExternalPetRecord(record: ExternalPetRecord): PetCatalogEntry | null {
  const manifest = getValidatedManifest(record.manifest);
  if (!manifest) return null;
  if (!record.spritesheetPath) return null;

  return {
    id: manifest.id,
    source: 'user',
    manifest,
    spritesheetUrl: convertFileSrc(record.spritesheetPath),
  };
}

async function fetchExternalPetRecords(): Promise<ExternalPetRecord[]> {
  return invoke<ExternalPetRecord[]>('discover_pets');
}

export async function discoverPets(): Promise<PetCatalogEntry[]> {
  const entries: PetCatalogEntry[] = [getBuiltInPet()];

  try {
    const records = await fetchExternalPetRecords();
    for (const record of records) {
      const entry = resolveExternalPetRecord(record);
      if (!entry) continue;
      if (entries.some((existing) => existing.id === entry.id)) continue;
      entries.push(entry);
    }
  } catch (err) {
    console.warn('[catalog] failed to discover external pets:', err);
  }

  return entries;
}
