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
    engine.addTransition('idle', 'walk', () => true);
    engine.transitionTo('walk');
    expect(handler).toHaveBeenCalledWith('walk', 'idle');
  });

  it('does not emit when transitioning to same state', () => {
    const handler = vi.fn();
    engine.on(handler);
    engine.transitionTo('idle');
    expect(handler).not.toHaveBeenCalled();
  });

  it('click triggers react from idle', () => {
    engine.handleClick();
    expect(engine.currentState).toBe('react');
  });

  it('click triggers react from walk', () => {
    engine.transitionTo('walk');
    engine.handleClick();
    expect(engine.currentState).toBe('react');
  });

  it('drag interrupts any state', () => {
    engine.transitionTo('sleep');
    engine.handleDragStart();
    expect(engine.currentState).toBe('drag');
  });

  it('drag end goes to idle', () => {
    engine.handleDragStart();
    engine.handleDragEnd();
    expect(engine.currentState).toBe('idle');
  });

  it('animation end transitions to idle from walk', () => {
    engine.transitionTo('walk');
    engine.handleAnimationEnd();
    expect(engine.currentState).toBe('idle');
  });

  it('animation end from idle does nothing', () => {
    engine.handleAnimationEnd();
    expect(engine.currentState).toBe('idle');
  });

  it('tick triggers random transition from idle after timeout', () => {
    engine.addTransition('idle', 'walk', () => true);
    engine.tick(6000);
    expect(engine.currentState).toBe('walk');
  });

  it('tick in non-idle state does nothing', () => {
    engine.transitionTo('walk');
    engine.tick(10000);
    expect(engine.currentState).toBe('walk');
  });

  it('off removes listener', () => {
    const handler = vi.fn();
    engine.on(handler);
    engine.off(handler);
    engine.transitionTo('walk');
    expect(handler).not.toHaveBeenCalled();
  });

  it('multiple listeners all fire', () => {
    const h1 = vi.fn();
    const h2 = vi.fn();
    engine.on(h1);
    engine.on(h2);
    engine.transitionTo('walk');
    expect(h1).toHaveBeenCalled();
    expect(h2).toHaveBeenCalled();
  });

  it('rng injection controls idle timer duration', () => {
    const fastEngine = new BehaviorEngine(() => 0);
    fastEngine.addTransition('idle', 'walk', () => true);
    fastEngine.tick(3001);
    expect(fastEngine.currentState).toBe('walk');
  });

  it('rng controls which transition is chosen', () => {
    engine.addTransition('idle', 'walk', () => true);
    engine.addTransition('idle', 'sleep', () => true);
    engine.tick(6000);
    // rng=0.5 → Math.floor(0.5 * 2) = 1 → picks 'sleep'
    expect(engine.currentState).toBe('sleep');
  });

  it('all non-idle states transition to idle on animationEnd', () => {
    for (const state of ['walk', 'sleep', 'sit', 'react'] as const) {
      const e = new BehaviorEngine(() => 0.5);
      e.transitionTo(state);
      e.handleAnimationEnd();
      expect(e.currentState).toBe('idle');
    }
  });
});
