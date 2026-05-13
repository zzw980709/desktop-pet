import { describe, it, expect } from 'vitest';
import { validateManifest } from '../src/engine/loader';
import { Animator } from '../src/engine/animator';
import { BehaviorEngine } from '../src/engine/behavior';
import { ReminderSystem } from '../src/engine/bubble';
import catManifest from '../src/characters/cat/manifest.json';

describe('full pipeline', () => {
  it('cat manifest is valid', () => {
    const m = validateManifest(catManifest);
    expect(m).not.toBeNull();
  });

  it('cat manifest has all required animations', () => {
    const m = validateManifest(catManifest)!;
    expect(m.animations.idle).toBeDefined();
    expect(m.animations.walk).toBeDefined();
    expect(m.animations.sleep).toBeDefined();
    expect(m.animations.sit).toBeDefined();
    expect(m.animations.react).toBeDefined();
  });

  it('animator plays all cat animations without error', () => {
    const m = validateManifest(catManifest)!;
    const animator = new Animator(m);
    for (const name of Object.keys(m.animations)) {
      expect(() => animator.play(name)).not.toThrow();
    }
  });

  it('behavior engine handles full interaction flow', () => {
    const engine = new BehaviorEngine();
    engine.addTransition('idle', 'walk', () => true);

    expect(engine.currentState).toBe('idle');

    engine.handleClick();
    expect(engine.currentState).toBe('react');

    engine.handleAnimationEnd();
    expect(engine.currentState).toBe('idle');

    engine.handleDragStart();
    expect(engine.currentState).toBe('drag');

    engine.handleDragEnd();
    expect(engine.currentState).toBe('idle');
  });

  it('reminders fire in correct order', () => {
    const m = validateManifest(catManifest)!;
    const reminders = new ReminderSystem(m);
    const fired: string[] = [];

    reminders.on((msg) => {
      fired.push(msg);
    });

    // First reminder at 3600s
    reminders.tick(3600 * 1000 + 1);
    expect(fired).toHaveLength(1);
    expect(fired[0]).toBe('该喝水了！');

    // Second reminder at 5400s (only 1800s more needed from here)
    // Tick just enough to trigger the second but not the first again
    reminders.tick(1800 * 1000 + 1);
    expect(fired).toHaveLength(2);
    expect(fired[1]).toBe('休息一下眼睛吧');
  });
});
