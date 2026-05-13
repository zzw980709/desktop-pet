import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BehaviorEngine } from '../src/engine/behavior';

describe('BehaviorEngine', () => {
  let engine: BehaviorEngine;

  beforeEach(() => {
    engine = new BehaviorEngine();
    engine.addState('idle');
    engine.addState('walk');
    engine.addState('sleep');
    engine.addState('sit');
    engine.addState('react');
    engine.addState('drag');
  });

  it('starts in idle state', () => {
    expect(engine.currentState).toBe('idle');
  });

  it('emits stateChange on transition', () => {
    const handler = vi.fn();
    engine.on('stateChange', handler);
    engine.addTransition('idle', 'walk', () => true);
    engine.transitionTo('walk');
    expect(handler).toHaveBeenCalledWith('walk', 'idle');
  });

  it('does not emit when transitioning to same state', () => {
    const handler = vi.fn();
    engine.on('stateChange', handler);
    engine.transitionTo('idle');
    expect(handler).not.toHaveBeenCalled();
  });

  it('click triggers react from idle', () => {
    const handler = vi.fn();
    engine.on('stateChange', handler);
    engine.handleClick();
    expect(engine.currentState).toBe('react');
  });

  it('click does not trigger react from walk', () => {
    engine.transitionTo('walk');
    engine.handleClick();
    expect(engine.currentState).toBe('walk');
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

  it('animation end transitions to idle from non-idle states', () => {
    engine.transitionTo('walk');
    engine.handleAnimationEnd();
    expect(engine.currentState).toBe('idle');
  });
});
