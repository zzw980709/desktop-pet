import type { PetState } from '../types';

type EventHandler = () => void;

type AnimationSpec = {
  row: number;
  usedColumns: number[];
  durationsMs: number[];
  loop: boolean;
};

const PET_ANIMATIONS: Record<PetState, AnimationSpec> = {
  idle: { row: 0, usedColumns: [0, 1, 2, 3, 4, 5], durationsMs: [280, 110, 110, 140, 140, 320], loop: true },
  'running-right': { row: 1, usedColumns: [0, 1, 2, 3, 4, 5, 6, 7], durationsMs: [120, 120, 120, 120, 120, 120, 120, 220], loop: true },
  'running-left': { row: 2, usedColumns: [0, 1, 2, 3, 4, 5, 6, 7], durationsMs: [120, 120, 120, 120, 120, 120, 120, 220], loop: true },
  waving: { row: 3, usedColumns: [0, 1, 2, 3], durationsMs: [140, 140, 140, 280], loop: false },
  jumping: { row: 4, usedColumns: [0, 1, 2, 3, 4], durationsMs: [140, 140, 140, 140, 280], loop: false },
  failed: { row: 5, usedColumns: [0, 1, 2, 3, 4, 5, 6, 7], durationsMs: [140, 140, 140, 140, 140, 140, 140, 240], loop: false },
  waiting: { row: 6, usedColumns: [0, 1, 2, 3, 4, 5], durationsMs: [150, 150, 150, 150, 150, 260], loop: true },
  running: { row: 7, usedColumns: [0, 1, 2, 3, 4, 5], durationsMs: [120, 120, 120, 120, 120, 220], loop: true },
  review: { row: 8, usedColumns: [0, 1, 2, 3, 4, 5], durationsMs: [150, 150, 150, 150, 150, 280], loop: true },
};

type TransitionState = {
  frameIndex: number;
  elapsed: number;
};

export class Animator {
  currentState: PetState = 'idle';
  currentFrameIndex = 0;
  currentCell = { row: 0, column: 0 };
  currentAnimation = this.currentState;
  currentFrame = 0;

  private elapsed = 0;
  private handlers: EventHandler[] = [];
  private finished = false;
  private paused = false;

  constructor(_manifest?: unknown) {
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
    const spec = PET_ANIMATIONS[this.currentState];
    if (!spec || this.finished || this.paused) return;

    this.elapsed += deltaMs;

    while (this.elapsed >= spec.durationsMs[this.currentFrameIndex]) {
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
  }

  private syncCell(): void {
    const spec = PET_ANIMATIONS[this.currentState];
    const column = spec.usedColumns[this.currentFrameIndex] ?? spec.usedColumns[0] ?? 0;
    this.currentCell = { row: spec.row, column };
    this.currentFrame = spec.row * 8 + column;
  }

  private computeTransition(nextState: PetState): TransitionState {
    const currentSpec = PET_ANIMATIONS[this.currentState];
    const nextSpec = PET_ANIMATIONS[nextState];

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
