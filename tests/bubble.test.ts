import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReminderSystem } from '../src/engine/bubble';
import type { CharacterManifest } from '../types';

describe('ReminderSystem', () => {
  let reminders: ReminderSystem;
  let manifest: CharacterManifest;

  beforeEach(() => {
    manifest = {
      reminders: [
        { interval: 3600, message: '该喝水了！', animation: 'react' },
      ],
    } as CharacterManifest;
    reminders = new ReminderSystem(manifest);
  });

  it('does not trigger immediately', () => {
    expect(reminders.activeBubble).toBeNull();
  });

  it('triggers after interval elapsed', () => {
    const handler = vi.fn();
    reminders.on(handler);
    reminders.tick(3600 * 1000 + 1);
    expect(handler).toHaveBeenCalledWith('该喝水了！', 'react');
  });

  it('activeBubble is set after trigger', () => {
    reminders.tick(3600 * 1000 + 1);
    expect(reminders.activeBubble).not.toBeNull();
    expect(reminders.activeBubble!.text).toBe('该喝水了！');
  });

  it('bubble expires after 5 seconds', () => {
    reminders.tick(3600 * 1000 + 1);
    expect(reminders.activeBubble).not.toBeNull();
    reminders.tick(5001);
    expect(reminders.activeBubble).toBeNull();
  });
});
