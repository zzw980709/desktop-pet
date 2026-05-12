import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Renderer } from '../src/engine/renderer';
import type { CharacterManifest } from '../src/types';

function makeManifest(overrides: Partial<CharacterManifest> = {}): CharacterManifest {
  return {
    name: 'test', displayName: 'Test', version: '1.0.0', author: '',
    frameWidth: 32, frameHeight: 32,
    animations: { idle: { start: 0, end: 3, fps: 4, loop: true } },
    defaultState: 'idle', scale: 2, reminders: [],
    ...overrides,
  };
}

describe('Renderer', () => {
  let canvas: HTMLCanvasElement;
  let renderer: Renderer;

  beforeEach(() => {
    canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
  });

  it('initializes with given scale', () => {
    renderer = new Renderer(canvas, makeManifest({ scale: 3 }));
    expect(renderer.scale).toBe(3);
  });

  it('drawFrame does not throw with valid frame index', () => {
    renderer = new Renderer(canvas, makeManifest());
    expect(() => renderer.drawFrame(0)).not.toThrow();
  });

  it('drawFrame clears canvas before drawing', () => {
    renderer = new Renderer(canvas, makeManifest());
    const ctx = canvas.getContext('2d')!;
    const spy = vi.spyOn(ctx, 'clearRect');
    renderer.drawFrame(0);
    expect(spy).toHaveBeenCalled();
  });
});
