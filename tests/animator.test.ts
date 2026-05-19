import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Animator } from '../src/engine/animator';

// idle:            [500, 220, 280, 220, 280, 500] (total 2000ms)
// running-r/l:     [220, 180, 220, 180, 220, 180, 220, 360] (total 1780ms)
// waving:          [250, 180, 400, 250] (total 1080ms)
// jumping:         [240, 160, 450, 180, 280]
// failed:          [180, 160, 160, 200, 220, 280, 350, 600]
// waiting:         [350, 220, 220, 220, 220, 400]
// running:         [160, 140, 160, 140, 160, 300]
// review:          [400, 280, 450, 280, 220, 400]

describe('Animator', () => {
  let animator: Animator;

  beforeEach(() => {
    animator = new Animator();
  });

  it('starts on the idle row and first column', () => {
    expect(animator.currentState).toBe('idle');
    expect(animator.currentCell).toEqual({ row: 0, column: 0 });
    expect(animator.currentFrame).toBe(0);
  });

  it('play switches to the requested atlas row and resets the frame index', () => {
    animator.tick(300);
    animator.play('waving');

    expect(animator.currentState).toBe('waving');
    expect(animator.currentCell).toEqual({ row: 3, column: 0 });
    expect(animator.currentFrame).toBe(24);
  });

  it('play does nothing for same animation', () => {
    animator.tick(400);
    const cell = animator.currentCell;
    // idle frame 0 is 500ms, tick(400) doesn't advance

    animator.play('idle');
    expect(animator.currentCell).toEqual(cell);
  });

  it('preserves loop progress when switching between directional running states', () => {
    animator.play('running-right');
    // running-right: 220ms → col 0, 180ms → col 1. 370ms = frame 1, 150ms elapsed
    animator.tick(370);

    animator.play('running-left');
    // transition preserves relative progress → col 1

    expect(animator.currentCell).toEqual({ row: 2, column: 1 });

    animator.tick(170);
    // 150 + 170 = 320 ≥ 180 (frame 1) → advance to frame 2

    expect(animator.currentCell).toEqual({ row: 2, column: 2 });
  });

  it('maps idle loop progress into running-right instead of resetting to the first frame', () => {
    // idle frame 0: 500ms. 530ms → frame 1, 30ms elapsed
    animator.tick(530);

    animator.play('running-right');
    // normalized = (1 + 30/220) / 6 ≈ 0.1894, * 8 ≈ 1.515 → col 1

    expect(animator.currentCell).toEqual({ row: 1, column: 1 });
  });

  it('uses per-frame durations for idle timing', () => {
    animator.tick(499);
    expect(animator.currentCell).toEqual({ row: 0, column: 0 });

    animator.tick(1);
    expect(animator.currentCell).toEqual({ row: 0, column: 1 });
  });

  it('loops through the used columns for looping states', () => {
    // idle: 500+220+280=1000. tick(779) → frame 2, 59ms elapsed
    animator.tick(779);
    expect(animator.currentCell).toEqual({ row: 0, column: 2 });

    animator.tick(221);
    // 59+221=280 → frame 3
    expect(animator.currentCell).toEqual({ row: 0, column: 3 });

    animator.tick(1000);
    // frame 3 (220) + frame 4 (280) + frame 5 (500) = 1000 → loops back to frame 0
    expect(animator.currentCell).toEqual({ row: 0, column: 0 });
  });

  it('emits animationEnd once when a non-looping animation finishes', () => {
    const handler = vi.fn();
    animator.on(handler);
    animator.play('waving');

    // waving: 250 + 180 + 400 = 830ms through frame 2, then final frame is 250ms
    animator.tick(250);
    animator.tick(180);
    animator.tick(400);
    animator.tick(250);

    expect(animator.currentCell).toEqual({ row: 3, column: 3 });
    expect(handler).toHaveBeenCalledTimes(1);

    animator.tick(1000);
    expect(animator.currentCell).toEqual({ row: 3, column: 3 });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('can be paused to freeze the current atlas cell', () => {
    animator.tick(500);
    expect(animator.currentCell).toEqual({ row: 0, column: 1 });

    animator.pause();
    animator.tick(1000);

    expect(animator.isPaused).toBe(true);
    expect(animator.currentCell).toEqual({ row: 0, column: 1 });
  });

  it('can resume after being paused', () => {
    animator.tick(500);
    animator.pause();
    animator.tick(1000);

    animator.resume();
    animator.tick(220);

    expect(animator.isPaused).toBe(false);
    expect(animator.currentCell).toEqual({ row: 0, column: 2 });
  });

  it('off removes listener', () => {
    const handler = vi.fn();
    animator.on(handler);
    animator.off(handler);
    animator.play('waving');
    animator.tick(1100);
    expect(handler).not.toHaveBeenCalled();
  });
});
