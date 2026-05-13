import type { CharacterManifest } from '../types';

type EventName = 'animationEnd';
type EventHandler = () => void;

export class Animator {
  currentAnimation: string;
  currentFrame: number;
  private elapsed: number = 0;
  private frameDuration: number = 0;
  private listeners: Map<EventName, Set<EventHandler>> = new Map();

  constructor(private manifest: CharacterManifest) {
    const initial = manifest.defaultState;
    this.currentAnimation = initial;
    const anim = manifest.animations[initial];
    this.currentFrame = anim?.start ?? 0;
    this.frameDuration = anim ? 1000 / anim.fps : 250;
  }

  on(event: EventName, handler: EventHandler): void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(handler);
  }

  private emit(event: EventName): void {
    this.listeners.get(event)?.forEach((fn) => fn());
  }

  play(name: string): void {
    if (name === this.currentAnimation) return;
    const anim = this.manifest.animations[name];
    if (!anim) return;
    this.currentAnimation = name;
    this.currentFrame = anim.start;
    this.elapsed = 0;
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
        this.emit('animationEnd');
      } else {
        this.currentFrame = newFrame;
      }
    }
  }
}
