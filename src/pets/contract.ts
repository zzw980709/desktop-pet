import type { AtlasFormat, PetManifest } from '../types';

export const CELL_WIDTH = 192;
export const CELL_HEIGHT = 208;
export const ATLAS_COLUMNS = 8;
export const ATLAS_ROWS = 11;
export const PETDEX_ATLAS_COLUMNS = 9;
export const PETDEX_ATLAS_MIN_HEIGHT = 1664;
export const SPRITESHEET_PATH = 'spritesheet.webp';

export interface FrameRect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

export function detectAtlasFormat(imgWidth: number): AtlasFormat {
  if (imgWidth === PETDEX_ATLAS_COLUMNS * CELL_WIDTH) return 'petdex';
  return 'desktop-pet';
}

export function getAtlasColumns(format: AtlasFormat): number {
  return format === 'petdex' ? PETDEX_ATLAS_COLUMNS : ATLAS_COLUMNS;
}

export function validatePetManifest(data: unknown): PetManifest | null {
  if (!data || typeof data !== 'object') return null;
  const value = data as Record<string, unknown>;

  // Accept both 'id' and 'slug' (petdex uses slug)
  const id = typeof value.id === 'string' && value.id
    ? value.id
    : typeof value.slug === 'string' && value.slug
      ? value.slug
      : null;
  if (!id) return null;

  if (value.spritesheetPath !== SPRITESHEET_PATH) return null;

  // Accept both 'displayName' and 'name' (petdex uses name)
  const displayName = typeof value.displayName === 'string' && value.displayName
    ? value.displayName
    : typeof value.name === 'string' && value.name
      ? value.name
      : id;
  const description = typeof value.description === 'string' && value.description
    ? value.description
    : '';

  return {
    id,
    displayName,
    description,
    spritesheetPath: SPRITESHEET_PATH,
  };
}

export function getFrameRect(row: number, column: number): FrameRect {
  return {
    sx: column * CELL_WIDTH,
    sy: row * CELL_HEIGHT,
    sw: CELL_WIDTH,
    sh: CELL_HEIGHT,
  };
}
