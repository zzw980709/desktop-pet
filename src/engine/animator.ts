import type { AtlasFormat, PetState } from '../types';

type EventHandler = () => void;

type AnimationSpec = {
  row: number;
  usedColumns: number[];
  durationsMs: number[];
  loop: boolean;
  /** Renderer should flip this animation horizontally */
  flipHorizontal?: boolean;
};

const PET_ANIMATIONS: Record<PetState, AnimationSpec> = {
  // Breathing cycle: slow inhale → hold → gentle exhale → hold
  idle: { row: 0, usedColumns: [0, 1, 2, 3, 4, 5], durationsMs: [500, 220, 280, 220, 280, 500], loop: true },
  // Directional walk: even alternating steps, planted foot holds longer
  'running-right': { row: 1, usedColumns: [0, 1, 2, 3, 4, 5, 6, 7], durationsMs: [220, 180, 220, 180, 220, 180, 220, 360], loop: true },
  'running-left': { row: 2, usedColumns: [0, 1, 2, 3, 4, 5, 6, 7], durationsMs: [220, 180, 220, 180, 220, 180, 220, 360], loop: true },
  // Wave: raise arm → quick wave at peak → return
  waving: { row: 3, usedColumns: [0, 1, 2, 3], durationsMs: [250, 180, 400, 250], loop: false },
  // Jump: crouch → launch → float at peak → fall → land
  jumping: { row: 4, usedColumns: [0, 1, 2, 3, 4], durationsMs: [240, 160, 450, 180, 280], loop: false },
  // Stumble: slip → stumble → try to recover → fall → dramatic pause
  failed: { row: 5, usedColumns: [0, 1, 2, 3, 4, 5, 6, 7], durationsMs: [180, 160, 160, 200, 220, 280, 350, 600], loop: false },
  // Impatient fidget: look around, slight tap, look again
  waiting: { row: 6, usedColumns: [0, 1, 2, 3, 4, 5], durationsMs: [350, 220, 220, 220, 220, 400], loop: true },
  // Quick run: faster cycle than walk
  running: { row: 7, usedColumns: [0, 1, 2, 3, 4, 5], durationsMs: [160, 140, 160, 140, 160, 300], loop: true },
  // Thoughtful review: slow look → ponder → slow look away
  review: { row: 8, usedColumns: [0, 1, 2, 3, 4, 5], durationsMs: [400, 280, 450, 280, 220, 400], loop: true },
};

// Petdex gallery format: 8 columns, 8+ rows.
// Row mapping: 0=idle, 1=wave, 2=run, 3=failed, 4=review, 5=jump, 6=extra1, 7=extra2
// Frame counts per row vary (4-8), matching actual petdex spritesheet content.
const PETDEX_ANIMATIONS: Record<PetState, AnimationSpec> = {
  idle: { row: 0, usedColumns: [0, 1, 2, 3, 4, 5], durationsMs: [400, 220, 280, 220, 280, 400], loop: true },
  'running-right': { row: 2, usedColumns: [0, 1, 2, 3, 4, 5, 6, 7], durationsMs: [180, 160, 180, 160, 180, 160, 180, 300], loop: true, flipHorizontal: true },
  'running-left': { row: 2, usedColumns: [0, 1, 2, 3, 4, 5, 6, 7], durationsMs: [180, 160, 180, 160, 180, 160, 180, 300], loop: true },
  waving: { row: 1, usedColumns: [0, 1, 2, 3, 4, 5, 6, 7], durationsMs: [200, 160, 180, 160, 180, 160, 180, 240], loop: false },
  jumping: { row: 5, usedColumns: [0, 1, 2, 3, 4, 5, 6, 7], durationsMs: [200, 140, 350, 160, 180, 180, 180, 260], loop: false },
  failed: { row: 3, usedColumns: [0, 1, 2, 3], durationsMs: [200, 180, 220, 400], loop: false },
  waiting: { row: 6, usedColumns: [0, 1, 2, 3, 4, 5], durationsMs: [350, 220, 220, 220, 220, 400], loop: true },
  running: { row: 2, usedColumns: [0, 1, 2, 3, 4, 5, 6, 7], durationsMs: [140, 120, 140, 120, 140, 120, 140, 240], loop: true },
  review: { row: 4, usedColumns: [0, 1, 2, 3, 4], durationsMs: [400, 280, 450, 280, 400], loop: true },
};

type TransitionState = {
  frameIndex: number;
  elapsed: number;
};

export class Animator {
  currentState: PetState = 'idle';
  currentFrameIndex = 0;
  currentCell = { row: 0, column: 0 };
  flipHorizontal = false;
  currentAnimation = this.currentState;
  currentFrame = 0;

  private elapsed = 0;
  private handlers: EventHandler[] = [];
  private finished = false;
  private paused = false;
  private animations: Record<PetState, AnimationSpec>;

  constructor(format: AtlasFormat = 'desktop-pet') {
    this.animations = format === 'petdex' ? PETDEX_ANIMATIONS : PET_ANIMATIONS;
    this.syncCell();
  }

  on(handler: EventHandler): void {
    this.handlers.push(handler);
  }

  get isPaused(): boolean {
    return this.paused;
  }

  off(handler: EventHandler): void {
    const idx = this.handlers.indexOf(handler);
    if (idx !== -1) this.handlers.splice(idx, 1);
  }

  play(state: PetState): void {
    if (state === this.currentState) return;
    const transition = this.computeTransition(state);
    this.currentState = state;
    this.currentAnimation = state;
    this.currentFrameIndex = transition.frameIndex;
    this.elapsed = transition.elapsed;
    this.finished = false;
    this.paused = false;
    this.syncCell();
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
  }

  tick(deltaMs: number): void {
    const spec = this.animations[this.currentState];
    if (!spec || this.finished || this.paused) return;

    this.elapsed += deltaMs;

    let iterations = 0;
    const maxIterations = spec.usedColumns.length * 2;
    while (this.elapsed + 0.5 >= spec.durationsMs[this.currentFrameIndex] && iterations < maxIterations) {
      iterations++;
      this.elapsed -= spec.durationsMs[this.currentFrameIndex];
      const lastFrame = this.currentFrameIndex === spec.usedColumns.length - 1;

      if (lastFrame) {
        if (!spec.loop) {
          this.finished = true;
          this.syncCell();
          this.emit();
          return;
        }

        this.currentFrameIndex = 0;
      } else {
        this.currentFrameIndex += 1;
      }

      this.syncCell();
    }
    if (iterations >= maxIterations) {
      console.warn('[animator] tick exceeded max iterations, resetting');
      this.currentFrameIndex = 0;
      this.elapsed = 0;
    }
  }

  private syncCell(): void {
    const spec = this.animations[this.currentState];
    // Clamp frameIndex within valid range to guard against out-of-bounds access
    const maxIdx = spec.usedColumns.length - 1;
    const safeIdx = Math.max(0, Math.min(this.currentFrameIndex, maxIdx));
    this.currentFrameIndex = safeIdx;
    const column = spec.usedColumns[safeIdx] ?? spec.usedColumns[0] ?? 0;
    this.currentCell = { row: spec.row, column };
    this.flipHorizontal = spec.flipHorizontal === true;
    this.currentFrame = spec.row * 8 + column;
  }

  private computeTransition(nextState: PetState): TransitionState {
    const currentSpec = this.animations[this.currentState];
    const nextSpec = this.animations[nextState];

    if (!currentSpec.loop || !nextSpec.loop) {
      return { frameIndex: 0, elapsed: 0 };
    }

    const currentDuration = currentSpec.durationsMs[this.currentFrameIndex] ?? currentSpec.durationsMs[0] ?? 1;
    const frameProgress = currentDuration > 0 ? this.elapsed / currentDuration : 0;
    const normalizedProgress =
      (this.currentFrameIndex + Math.min(Math.max(frameProgress, 0), 0.999)) /
      currentSpec.usedColumns.length;
    const rawTargetFrame = normalizedProgress * nextSpec.usedColumns.length;
    const frameIndex = Math.min(nextSpec.usedColumns.length - 1, Math.floor(rawTargetFrame));
    const targetFrameProgress = rawTargetFrame - frameIndex;
    const nextDuration = nextSpec.durationsMs[frameIndex] ?? nextSpec.durationsMs[0] ?? 0;

    return {
      frameIndex,
      elapsed: nextDuration * targetFrameProgress,
    };
  }

  private emit(): void {
    for (const fn of this.handlers) {
      try {
        fn();
      } catch {
        // Isolate listener failures from animator progress.
      }
    }
  }
}
