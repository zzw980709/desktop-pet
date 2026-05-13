import type { CharacterManifest, LoadedCharacter } from '../types';

export function validateManifest(data: unknown): CharacterManifest | null {
  if (!data || typeof data !== 'object') return null;
  const m = data as Record<string, unknown>;

  if (typeof m.name !== 'string' || !m.name) return null;
  if (typeof m.displayName !== 'string' || !m.displayName) return null;
  if (typeof m.frameWidth !== 'number' || m.frameWidth <= 0) return null;
  if (typeof m.frameHeight !== 'number' || m.frameHeight <= 0) return null;
  if (!m.animations || typeof m.animations !== 'object' || Object.keys(m.animations as object).length === 0) return null;
  if (typeof m.defaultState !== 'string' || !m.defaultState) return null;
  if (!Object.prototype.hasOwnProperty.call(m.animations as object, m.defaultState)) return null;

  // Validate each animation entry
  for (const [, val] of Object.entries(m.animations as object)) {
    if (!val || typeof val !== 'object') return null;
    const a = val as Record<string, unknown>;
    if (typeof a.start !== 'number' || a.start < 0) return null;
    if (typeof a.end !== 'number' || a.end < a.start) return null;
    if (typeof a.fps !== 'number' || a.fps <= 0) return null;
    if (typeof a.loop !== 'boolean') return null;
  }

  return {
    name: m.name,
    displayName: m.displayName,
    version: typeof m.version === 'string' ? m.version : '0.0.0',
    author: typeof m.author === 'string' ? m.author : '',
    frameWidth: m.frameWidth,
    frameHeight: m.frameHeight,
    animations: m.animations as CharacterManifest['animations'],
    defaultState: m.defaultState,
    scale: typeof m.scale === 'number' && m.scale > 0 ? m.scale : 2,
    reminders: Array.isArray(m.reminders) ? m.reminders : [],
    behaviorOverrides: typeof m.behaviorOverrides === 'string' ? m.behaviorOverrides : undefined,
  };
}

export function totalFrames(manifest: CharacterManifest): number {
  let maxEnd = 0;
  for (const anim of Object.values(manifest.animations)) {
    if (anim.end > maxEnd) maxEnd = anim.end;
  }
  return maxEnd + 1;
}

export function validateSpritesheet(img: HTMLImageElement, manifest: CharacterManifest): boolean {
  const expectedWidth = manifest.frameWidth * totalFrames(manifest);
  return img.naturalWidth >= expectedWidth && img.naturalHeight >= manifest.frameHeight;
}

export async function loadCharacter(manifest: CharacterManifest, imageSrc: string): Promise<LoadedCharacter | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      if (!validateSpritesheet(img, manifest)) {
        console.warn(`[loader] Spritesheet size mismatch for ${manifest.name}`);
        resolve(null);
        return;
      }
      resolve({ manifest, spritesheet: img });
    };
    img.onerror = () => {
      console.warn(`[loader] Failed to load spritesheet for ${manifest.name}`);
      resolve(null);
    };
    img.src = imageSrc;
  });
}
