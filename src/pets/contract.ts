import type { PetManifest } from '../types';

export const CELL_WIDTH = 192;
export const CELL_HEIGHT = 208;
export const ATLAS_COLUMNS = 8;
export const ATLAS_ROWS = 9;
export const SPRITESHEET_PATH = 'spritesheet.webp';

export interface FrameRect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

export function validatePetManifest(data: unknown): PetManifest | null {
  if (!data || typeof data !== 'object') return null;
  const value = data as Record<string, unknown>;

  if (typeof value.id !== 'string' || !value.id) return null;
  if (value.spritesheetPath !== SPRITESHEET_PATH) return null;

  // Default missing optional fields for resilience
  const displayName = typeof value.displayName === 'string' && value.displayName
    ? value.displayName
    : value.id;
  const description = typeof value.description === 'string' && value.description
    ? value.description
    : '';

  return {
    id: value.id,
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
