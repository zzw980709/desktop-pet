import type { CharacterManifest } from '../types';

type EventHandler = () => void;

export class Animator {
  currentAnimation: string;
  currentFrame: number;
  private elapsed: number = 0;
  private frameDuration: number = 0;
  private handlers: EventHandler[] = [];
  private finished = false;

  constructor(private manifest: CharacterManifest) {
    const initial = manifest.defaultState;
    this.currentAnimation = initial;
    const anim = manifest.animations[initial];
    this.currentFrame = anim?.start ?? 0;
    this.frameDuration = anim ? 1000 / anim.fps : 250;
  }

  on(handler: EventHandler): void {
    this.handlers.push(handler);
  }

  off(handler: EventHandler): void {
    const idx = this.handlers.indexOf(handler);
    if (idx !== -1) this.handlers.splice(idx, 1);
  }

  private emit(): void {
    for (const fn of this.handlers) {
      try { fn(); } catch { /* isolate handler errors */ }
    }
  }

  play(name: string): void {
    if (name === this.currentAnimation) return;
    const anim = this.manifest.animations[name];
    if (!anim) return;
    this.currentAnimation = name;
    this.currentFrame = anim.start;
    this.elapsed = 0;
    this.finished = false;
    this.frameDuration = 1000 / anim.fps;
  }

  tick(deltaMs: number): void {
    const anim = this.manifest.animations[this.currentAnimation];
    if (!anim) return;

    this.elapsed += deltaMs;
    const framesToAdvance = Math.floor(this.elapsed / this.frameDuration);
    if (framesToAdvance === 0) return;

    this.elapsed -= framesToAdvance * this.frameDuration;
    const newFrame = this.currentFrame + framesToAdvance;

    if (anim.loop) {
      const range = anim.end - anim.start + 1;
      this.currentFrame = anim.start + ((newFrame - anim.start) % range + range) % range;
    } else {
      if (newFrame > anim.end) {
        this.currentFrame = anim.end;
        if (!this.finished) {
          this.finished = true;
          this.emit();
        }
      } else {
        this.currentFrame = newFrame;
      }
    }
  }
}
