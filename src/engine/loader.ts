import { ATLAS_COLUMNS, ATLAS_ROWS, CELL_HEIGHT, CELL_WIDTH, validatePetManifest } from '../pets/contract';
import type { LoadedPet, PetManifest } from '../types';

export { validatePetManifest };

export function validatePetSpritesheet(img: HTMLImageElement): boolean {
  return img.naturalWidth === CELL_WIDTH * ATLAS_COLUMNS
    && img.naturalHeight >= CELL_HEIGHT * 8
    && img.naturalHeight % CELL_HEIGHT === 0;
}

function createPlaceholderImage(): HTMLImageElement {
  const canvas = document.createElement('canvas');
  canvas.width = CELL_WIDTH * ATLAS_COLUMNS;
  canvas.height = CELL_HEIGHT * ATLAS_ROWS;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#666666';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#555555';
  for (let row = 0; row < ATLAS_ROWS; row++) {
    for (let col = 0; col < ATLAS_COLUMNS; col++) {
      if ((row + col) % 2 === 0) {
        ctx.fillRect(col * CELL_WIDTH, row * CELL_HEIGHT, CELL_WIDTH, CELL_HEIGHT);
      }
    }
  }

  const img = new Image();
  img.src = canvas.toDataURL();
  return img;
}

export async function loadPet(manifest: PetManifest, imageSrc: string): Promise<LoadedPet | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      if (!validatePetSpritesheet(img)) {
        console.warn(`[loader] Spritesheet size mismatch for ${manifest.id}, using placeholder`);
        resolve({ manifest, spritesheet: createPlaceholderImage(), atlasFormat: 'desktop-pet' });
        return;
      }
      const atlasFormat = manifest.atlasFormat ?? 'desktop-pet';
      resolve({ manifest, spritesheet: img, atlasFormat });
    };
    img.onerror = () => {
      console.error(`[loader] Failed to load spritesheet for ${manifest.id}, using placeholder`);
      resolve({ manifest, spritesheet: createPlaceholderImage(), atlasFormat: 'desktop-pet' });
    };
    img.src = imageSrc;
  });
}
