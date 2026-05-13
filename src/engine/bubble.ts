import type { CharacterManifest } from '../types';

export interface Bubble {
  text: string;
  elapsed: number;
}

type ReminderHandler = (message: string, animation: string) => void;

export class ReminderSystem {
  activeBubble: Bubble | null = null;
  private timers: number[] = [];
  private listeners: ReminderHandler[] = [];
  private bubbleDuration = 5000;
  private bubbleTimer = 0;

  constructor(private manifest: CharacterManifest) {
    this.timers = manifest.reminders.map((r) => r.interval * 1000);
  }

  on(handler: ReminderHandler): void {
    this.listeners.push(handler);
  }

  tick(deltaMs: number): void {
    let bubbleJustCreated = false;

    for (let i = 0; i < this.timers.length; i++) {
      this.timers[i] -= deltaMs;
      if (this.timers[i] <= 0) {
        const reminder = this.manifest.reminders[i];
        this.timers[i] = reminder.interval * 1000;
        this.activeBubble = { text: reminder.message, elapsed: 0 };
        this.bubbleTimer = 0;
        bubbleJustCreated = true;
        for (const fn of this.listeners) {
          fn(reminder.message, reminder.animation);
        }
      }
    }

    if (this.activeBubble && !bubbleJustCreated) {
      this.bubbleTimer += deltaMs;
      this.activeBubble.elapsed = this.bubbleTimer;
      if (this.bubbleTimer >= this.bubbleDuration) {
        this.activeBubble = null;
        this.bubbleTimer = 0;
      }
    }
  }

  showBubble(text: string): void {
    this.activeBubble = { text, elapsed: 0 };
    this.bubbleTimer = 0;
  }

  getBubbleToDraw(): Bubble | null {
    return this.activeBubble;
  }
}
