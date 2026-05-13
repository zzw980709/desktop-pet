import { describe, it, expect } from 'vitest';
import { getCatSpritesheetURL } from '../src/characters/cat/generator';

describe('cat spritesheet generator', () => {
  it('returns a valid data URL', () => {
    const url = getCatSpritesheetURL();
    expect(url).toMatch(/^data:image\/png;base64,/);
  });
});
