import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Animator } from '../src/engine/animator';

// New idle durations: [400, 180, 180, 220, 220, 480] (total 1680ms)
// New running-right/left: [180, 180, 180, 180, 180, 180, 180, 320] (total 1580ms)
// New waving: [200, 200, 200, 400] (total 1000ms)

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

    animator.play('idle');

    expect(animator.currentCell).toEqual(cell);
  });

  it('preserves loop progress when switching between directional running states', () => {
    animator.play('running-right');
    // running-right frame 0: 180ms, frame 1: 180ms -> 370ms = frame 2, 10ms elapsed
    animator.tick(370);

    animator.play('running-left');

    expect(animator.currentCell).toEqual({ row: 2, column: 2 });

    animator.tick(170);

    expect(animator.currentCell).toEqual({ row: 2, column: 3 });
  });

  it('maps idle loop progress into running-right instead of resetting to the first frame', () => {
    // idle: 400+180=580. tick(530) -> frame 1, 130ms elapsed (180 - 50)
    animator.tick(530);

    animator.play('running-right');
    // normalized = (1 + 130/180) / 6 ≈ 0.287, * 8 ≈ 2.296 -> column 2

    expect(animator.currentCell).toEqual({ row: 1, column: 2 });
  });

  it('uses per-frame durations for idle timing', () => {
    animator.tick(399);
    expect(animator.currentCell).toEqual({ row: 0, column: 0 });

    animator.tick(1);
    expect(animator.currentCell).toEqual({ row: 0, column: 1 });
  });

  it('loops through the used columns for looping states', () => {
    // idle: 400+180+180=760. tick(779) -> frame 3, 19ms elapsed
    animator.tick(779);
    expect(animator.currentCell).toEqual({ row: 0, column: 3 });

    animator.tick(201);
    // 19+201=220 -> frame 4
    expect(animator.currentCell).toEqual({ row: 0, column: 4 });

    animator.tick(700);
    // 220+480=700 -> frame 0
    expect(animator.currentCell).toEqual({ row: 0, column: 0 });
  });

  it('emits animationEnd once when a non-looping animation finishes', () => {
    const handler = vi.fn();
    animator.on(handler);
    animator.play('waving');

    animator.tick(200);
    animator.tick(200);
    animator.tick(200);
    animator.tick(400);

    expect(animator.currentCell).toEqual({ row: 3, column: 3 });
    expect(handler).toHaveBeenCalledTimes(1);

    animator.tick(1000);
    expect(animator.currentCell).toEqual({ row: 3, column: 3 });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('can be paused to freeze the current atlas cell', () => {
    animator.tick(400);
    expect(animator.currentCell).toEqual({ row: 0, column: 1 });

    animator.pause();
    animator.tick(1000);

    expect(animator.isPaused).toBe(true);
    expect(animator.currentCell).toEqual({ row: 0, column: 1 });
  });

  it('can resume after being paused', () => {
    animator.tick(400);
    animator.pause();
    animator.tick(1000);

    animator.resume();
    animator.tick(180);

    expect(animator.isPaused).toBe(false);
    expect(animator.currentCell).toEqual({ row: 0, column: 2 });
  });

  it('off removes listener', () => {
    const handler = vi.fn();
    animator.on(handler);
    animator.off(handler);
    animator.play('waving');
    animator.tick(1000);
    expect(handler).not.toHaveBeenCalled();
  });
});
