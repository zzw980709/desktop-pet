import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Animator } from '../src/engine/animator';

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
    animator.tick(280);
    const cell = animator.currentCell;

    animator.play('idle');

    expect(animator.currentCell).toEqual(cell);
  });

  it('preserves loop progress when switching between directional running states', () => {
    animator.play('running-right');
    animator.tick(370);

    animator.play('running-left');

    expect(animator.currentCell).toEqual({ row: 2, column: 3 });

    animator.tick(110);

    expect(animator.currentCell).toEqual({ row: 2, column: 4 });
  });

  it('maps idle loop progress into running-right instead of resetting to the first frame', () => {
    animator.tick(530);

    animator.play('running-right');

    expect(animator.currentCell).toEqual({ row: 1, column: 4 });
  });

  it('uses per-frame durations for idle timing', () => {
    animator.tick(279);
    expect(animator.currentCell).toEqual({ row: 0, column: 0 });

    animator.tick(1);
    expect(animator.currentCell).toEqual({ row: 0, column: 1 });
  });

  it('loops through the used columns for looping states', () => {
    animator.tick(779);
    expect(animator.currentCell).toEqual({ row: 0, column: 4 });

    animator.tick(1);

    expect(animator.currentCell).toEqual({ row: 0, column: 5 });

    animator.tick(320);

    expect(animator.currentCell).toEqual({ row: 0, column: 0 });
  });

  it('emits animationEnd once when a non-looping animation finishes', () => {
    const handler = vi.fn();
    animator.on(handler);
    animator.play('waving');

    animator.tick(140);
    animator.tick(140);
    animator.tick(140);
    animator.tick(280);

    expect(animator.currentCell).toEqual({ row: 3, column: 3 });
    expect(handler).toHaveBeenCalledTimes(1);

    animator.tick(1000);
    expect(animator.currentCell).toEqual({ row: 3, column: 3 });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('can be paused to freeze the current atlas cell', () => {
    animator.tick(280);
    expect(animator.currentCell).toEqual({ row: 0, column: 1 });

    animator.pause();
    animator.tick(1000);

    expect(animator.isPaused).toBe(true);
    expect(animator.currentCell).toEqual({ row: 0, column: 1 });
  });

  it('can resume after being paused', () => {
    animator.tick(280);
    animator.pause();
    animator.tick(1000);

    animator.resume();
    animator.tick(110);

    expect(animator.isPaused).toBe(false);
    expect(animator.currentCell).toEqual({ row: 0, column: 2 });
  });

  it('off removes listener', () => {
    const handler = vi.fn();
    animator.on(handler);
    animator.off(handler);
    animator.play('waving');
    animator.tick(700);
    expect(handler).not.toHaveBeenCalled();
  });
});
