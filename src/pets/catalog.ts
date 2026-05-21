import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import type { PetCatalogEntry } from '../types';
import { validatePetManifest } from '../engine/loader';

interface ExternalPetRecord {
  manifest: unknown;
  spritesheetPath: string;
}

const BUILTIN_PET_IDS = new Set(['cat']);

function isBuiltIn(petId: string): boolean {
  return BUILTIN_PET_IDS.has(petId);
}

function detectSource(spritesheetPath: string, petId: string): PetCatalogEntry['source'] {
  if (isBuiltIn(petId)) return 'built-in';
  if (spritesheetPath.includes('/.petdex/pets/')) return 'petdex';
  return 'user';
}

function resolvePetRecord(record: ExternalPetRecord): PetCatalogEntry | null {
  const manifest = validatePetManifest(record.manifest);
  if (!manifest) return null;
  if (!record.spritesheetPath) return null;

  const source = detectSource(record.spritesheetPath, manifest.id);
  return {
    id: manifest.id,
    source,
    manifest,
    spritesheetUrl: convertFileSrc(record.spritesheetPath),
    removable: !isBuiltIn(manifest.id),
  };
}

export async function discoverPets(): Promise<PetCatalogEntry[]> {
  try {
    const records = await invoke<ExternalPetRecord[]>('discover_pets');
    const entries: PetCatalogEntry[] = [];

    for (const record of records) {
      const entry = resolvePetRecord(record);
      if (!entry) continue;
      if (entries.some((existing) => existing.id === entry.id)) continue;
      entries.push(entry);
    }

    return entries;
  } catch (err) {
    console.warn('[catalog] failed to discover pets:', err);
    return [];
  }
}
