import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BehaviorEngine } from '../src/engine/behavior';

describe('BehaviorEngine', () => {
  let engine: BehaviorEngine;

  beforeEach(() => {
    engine = new BehaviorEngine(() => 0.5);
  });

  it('starts in idle state', () => {
    expect(engine.currentState).toBe('idle');
  });

  it('emits stateChange on transition', () => {
    const handler = vi.fn();
    engine.on(handler);
    engine.transitionTo('running-right');
    expect(handler).toHaveBeenCalledWith('running-right', 'idle');
  });

  it('does not emit when transitioning to same state', () => {
    const handler = vi.fn();
    engine.on(handler);
    engine.transitionTo('idle');
    expect(handler).not.toHaveBeenCalled();
  });

  it('click triggers waving from idle', () => {
    engine.handleClick();
    expect(engine.currentState).toBe('waving');
  });

  it('click triggers waving from running-right', () => {
    engine.transitionTo('running-right');
    engine.handleClick();
    expect(engine.currentState).toBe('waving');
  });

  it('click does nothing while dragging', () => {
    engine.handleDragStart();
    engine.handleClick();
    expect(engine.currentState).toBe('idle');
  });

  it('drag start preserves the current pet state', () => {
    engine.transitionTo('review');
    engine.handleDragStart();
    expect(engine.currentState).toBe('review');
    expect(engine.isDragging).toBe(true);
  });

  it('drag end goes to idle', () => {
    engine.handleDragStart();
    engine.handleDragEnd();
    expect(engine.currentState).toBe('idle');
    expect(engine.isDragging).toBe(false);
  });

  it('drag end from directional running keeps a short settle before returning to idle', () => {
    engine.transitionTo('running-right');
    engine.handleDragStart();
    engine.handleDragEnd();

    expect(engine.currentState).toBe('running-right');
    expect(engine.isDragging).toBe(false);

    engine.tick(100);
    expect(engine.currentState).toBe('running-right');

    engine.tick(100);
    expect(engine.currentState).toBe('idle');
  });

  it('dragging right switches to the running-right state', () => {
    engine.handleDragStart();
    engine.handleDragMove(24);
    expect(engine.currentState).toBe('running-right');
  });

  it('dragging left switches to the running-left state', () => {
    engine.handleDragStart();
    engine.handleDragMove(-24);
    expect(engine.currentState).toBe('running-left');
  });

  it('animation end transitions to idle from waving', () => {
    engine.transitionTo('waving');
    engine.handleAnimationEnd();
    expect(engine.currentState).toBe('idle');
  });

  it('animation end from idle does nothing', () => {
    engine.handleAnimationEnd();
    expect(engine.currentState).toBe('idle');
  });

  it('tick triggers a fixed random transition from idle after timeout', () => {
    engine.tick(6000);
    // rng=0.5 -> Math.floor(0.5 * 6) = 3 -> 'running'
    expect(engine.currentState).toBe('running');
  });

  it('tick does not trigger random idle transitions while dragging from idle', () => {
    engine.handleDragStart();
    engine.tick(6000);
    expect(engine.currentState).toBe('idle');
    expect(engine.isDragging).toBe(true);
  });

  it('tick in non-idle state returns to idle after max random action timeout', () => {
    engine.transitionTo('running-right');
    engine.tick(3000);
    expect(engine.currentState).toBe('running-right');
    engine.tick(1001);
    expect(engine.currentState).toBe('idle');
  });

  it('off removes listener', () => {
    const handler = vi.fn();
    engine.on(handler);
    engine.off(handler);
    engine.transitionTo('running-right');
    expect(handler).not.toHaveBeenCalled();
  });

  it('multiple listeners all fire', () => {
    const h1 = vi.fn();
    const h2 = vi.fn();
    engine.on(h1);
    engine.on(h2);
    engine.transitionTo('running-right');
    expect(h1).toHaveBeenCalled();
    expect(h2).toHaveBeenCalled();
  });

  it('rng injection controls idle timer duration', () => {
    const fastEngine = new BehaviorEngine(() => 0);
    fastEngine.tick(3001);
    expect(fastEngine.currentState).toBe('running-right');
  });

  it('rng controls which transition is chosen', () => {
    engine.tick(6000);
    // rng=0.5 -> Math.floor(0.5 * 6) = 3 -> picks 'running'
    expect(engine.currentState).toBe('running');
  });

  it('non-looping states transition to idle on animationEnd', () => {
    for (const state of ['waving', 'jumping', 'failed'] as const) {
      const e = new BehaviorEngine(() => 0.5);
      e.transitionTo(state);
      e.handleAnimationEnd();
      expect(e.currentState).toBe('idle');
    }
  });

  it('looping states remain active on animationEnd', () => {
    engine.transitionTo('review');
    engine.handleAnimationEnd();
    expect(engine.currentState).toBe('review');
  });

  it('dragging does not force a pet state change on animationEnd', () => {
    engine.transitionTo('review');
    engine.handleDragStart();
    engine.handleAnimationEnd();
    expect(engine.currentState).toBe('review');
  });

  it('dragging preserves a non-looping state when animationEnd fires', () => {
    engine.transitionTo('waving');
    engine.handleDragStart();
    engine.handleAnimationEnd();
    expect(engine.currentState).toBe('waving');
    expect(engine.isDragging).toBe(true);
  });
});
