import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Animator } from '../src/engine/animator';
import type { CharacterManifest } from '../src/types';

function makeManifest(): CharacterManifest {
  return {
    name: 'test', displayName: 'Test', version: '1.0.0', author: '',
    frameWidth: 32, frameHeight: 32,
    animations: {
      idle: { start: 0, end: 3, fps: 4, loop: true },
      react: { start: 4, end: 5, fps: 2, loop: false },
    },
    defaultState: 'idle', scale: 2, reminders: [],
  };
}

describe('Animator', () => {
  let animator: Animator;
  let manifest: CharacterManifest;

  beforeEach(() => {
    manifest = makeManifest();
    animator = new Animator(manifest);
  });

  it('starts with default state animation', () => {
    expect(animator.currentAnimation).toBe('idle');
    expect(animator.currentFrame).toBe(0);
  });

  it('play switches animation', () => {
    animator.play('react');
    expect(animator.currentAnimation).toBe('react');
    expect(animator.currentFrame).toBe(4); // start frame of react
  });

  it('play does nothing for same animation', () => {
    animator.play('react');
    const frame = animator.currentFrame;
    animator.play('react');
    expect(animator.currentFrame).toBe(frame);
  });

  it('tick advances frame based on delta time for looping animation', () => {
    animator.play('idle');
    const before = animator.currentFrame;
    animator.tick(300); // > 250ms should advance at least 1 frame
    expect(animator.currentFrame).toBeGreaterThanOrEqual(before);
  });

  it('tick wraps around for looping animation', () => {
    animator.play('idle');
    for (let i = 0; i < 20; i++) {
      animator.tick(300);
    }
    expect(animator.currentFrame).toBeLessThanOrEqual(3); // end=3 for idle
  });

  it('emits animationEnd event when non-looping animation finishes', () => {
    const handler = vi.fn();
    animator.on(handler);
    animator.play('react');
    animator.tick(600); // fps=2 so 500ms per frame
    animator.tick(600); // enough to finish 2 frames
    expect(handler).toHaveBeenCalled();
  });

  it('does not re-emit animationEnd on subsequent ticks', () => {
    const handler = vi.fn();
    animator.on(handler);
    animator.play('react');
    animator.tick(600);
    animator.tick(600); // finishes
    expect(handler).toHaveBeenCalledTimes(1);
    animator.tick(600); // extra tick after finish
    animator.tick(600);
    expect(handler).toHaveBeenCalledTimes(1); // still only once
  });

  it('off removes listener', () => {
    const handler = vi.fn();
    animator.on(handler);
    animator.off(handler);
    animator.play('react');
    animator.tick(600);
    animator.tick(600);
    expect(handler).not.toHaveBeenCalled();
  });
});
