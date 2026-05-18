import { ATLAS_COLUMNS, ATLAS_ROWS, CELL_HEIGHT, CELL_WIDTH, validatePetManifest } from '../pets/contract';
import type { LoadedPet, PetManifest } from '../types';

export { validatePetManifest };

export function validatePetSpritesheet(img: HTMLImageElement): boolean {
  return img.naturalWidth === CELL_WIDTH * ATLAS_COLUMNS
    && img.naturalHeight === CELL_HEIGHT * ATLAS_ROWS;
}

export async function loadPet(manifest: PetManifest, imageSrc: string): Promise<LoadedPet | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      if (!validatePetSpritesheet(img)) {
        console.warn(`[loader] Spritesheet size mismatch for ${manifest.id}`);
        resolve(null);
        return;
      }
      resolve({ manifest, spritesheet: img });
    };
    img.onerror = () => {
      console.warn(`[loader] Failed to load spritesheet for ${manifest.id}`);
      resolve(null);
    };
    img.src = imageSrc;
  });
}
