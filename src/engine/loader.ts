import { ATLAS_COLUMNS, ATLAS_ROWS, CELL_HEIGHT, CELL_WIDTH, PETDEX_ATLAS_COLUMNS, PETDEX_ATLAS_MIN_HEIGHT, detectAtlasFormat, validatePetManifest } from '../pets/contract';
import type { AtlasFormat, LoadedPet, PetManifest } from '../types';

export { validatePetManifest };

export function validatePetSpritesheet(img: HTMLImageElement): boolean {
  const expectedWidths = [CELL_WIDTH * ATLAS_COLUMNS, CELL_WIDTH * PETDEX_ATLAS_COLUMNS];
  if (!expectedWidths.includes(img.naturalWidth)) return false;
  if (img.naturalHeight % CELL_HEIGHT !== 0) return false;
  const minHeight = img.naturalWidth === CELL_WIDTH * PETDEX_ATLAS_COLUMNS
    ? PETDEX_ATLAS_MIN_HEIGHT
    : CELL_HEIGHT * 9;
  return img.naturalHeight >= minHeight;
}

function createPlaceholderImage(format: AtlasFormat): HTMLImageElement {
  const cols = format === 'petdex' ? PETDEX_ATLAS_COLUMNS : ATLAS_COLUMNS;
  const rows = format === 'petdex' ? 8 : ATLAS_ROWS;
  const canvas = document.createElement('canvas');
  canvas.width = CELL_WIDTH * cols;
  canvas.height = CELL_HEIGHT * rows;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#666666';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#555555';
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
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
        const format = detectAtlasFormat(CELL_WIDTH * ATLAS_COLUMNS);
        console.warn(`[loader] Spritesheet size mismatch for ${manifest.id}, using placeholder`);
        resolve({ manifest, spritesheet: createPlaceholderImage(format), atlasFormat: format });
        return;
      }
      const atlasFormat = detectAtlasFormat(img.naturalWidth);
      resolve({ manifest, spritesheet: img, atlasFormat });
    };
    img.onerror = () => {
      const format = detectAtlasFormat(CELL_WIDTH * ATLAS_COLUMNS);
      console.error(`[loader] Failed to load spritesheet for ${manifest.id}, using placeholder`);
      resolve({ manifest, spritesheet: createPlaceholderImage(format), atlasFormat: format });
    };
    img.src = imageSrc;
  });
}
