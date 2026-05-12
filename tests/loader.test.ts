import { describe, it, expect } from 'vitest';
import { validateManifest, totalFrames } from '../src/engine/loader';

describe('validateManifest', () => {
  const valid = {
    name: 'cat',
    displayName: 'Cat',
    frameWidth: 32,
    frameHeight: 32,
    animations: { idle: { start: 0, end: 3, fps: 4, loop: true } },
    defaultState: 'idle',
  };

  it('accepts a valid manifest', () => {
    expect(validateManifest(valid)).toBeTruthy();
  });

  it('fills defaults for optional fields', () => {
    const result = validateManifest(valid)!;
    expect(result.version).toBe('0.0.0');
    expect(result.author).toBe('');
    expect(result.scale).toBe(2);
  });

  it('rejects null/undefined', () => {
    expect(validateManifest(null)).toBeNull();
    expect(validateManifest(undefined)).toBeNull();
  });

  it('rejects missing name', () => {
    expect(validateManifest({ ...valid, name: '' })).toBeNull();
  });

  it('rejects missing animations', () => {
    expect(validateManifest({ ...valid, animations: {} })).toBeNull();
  });

  it('rejects negative frameWidth', () => {
    expect(validateManifest({ ...valid, frameWidth: -1 })).toBeNull();
  });
});

describe('totalFrames', () => {
  it('returns max end + 1', () => {
    expect(totalFrames({
      animations: { a: { start: 0, end: 3, fps: 4, loop: true }, b: { start: 4, end: 7, fps: 6, loop: true } }
    } as any)).toBe(8);
  });
});
