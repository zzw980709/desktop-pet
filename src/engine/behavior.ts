import type { PetState } from '../types';

export type State = PetState;

type StateChangeHandler = (newState: State, oldState: State) => void;

const RESET_TO_IDLE_ON_END: State[] = ['waving', 'jumping', 'failed'];
const RANDOM_IDLE_TRANSITIONS: State[] = ['running-right', 'running-left', 'jumping', 'running', 'review'];

export class BehaviorEngine {
  private _currentState: State = 'idle';
  private listeners: StateChangeHandler[] = [];
  private idleTimer = 0;
  private dragging = false;
  private rng: () => number;

  constructor(rng?: () => number) {
    this.rng = rng ?? Math.random;
    this.resetIdleTimer();
  }

  get currentState(): State {
    return this._currentState;
  }

  get isDragging(): boolean {
    return this.dragging;
  }

  on(handler: StateChangeHandler): void {
    this.listeners.push(handler);
  }

  off(handler: StateChangeHandler): void {
    const idx = this.listeners.indexOf(handler);
    if (idx !== -1) this.listeners.splice(idx, 1);
  }

  addTransition(): void {
    // Transitions are runtime-owned in the fixed atlas contract.
  }

  transitionTo(newState: State): void {
    if (newState === this._currentState) return;
    const oldState = this._currentState;
    this._currentState = newState;
    if (newState === 'idle') {
      this.dragging = false;
      this.resetIdleTimer();
    }
    for (const fn of this.listeners) {
      fn(newState, oldState);
    }
  }

  tick(deltaMs: number): void {
    if (this.dragging) return;
    if (this._currentState !== 'idle') return;

    this.idleTimer -= deltaMs;
    if (this.idleTimer > 0) return;

    this.tryRandomTransition();
    this.resetIdleTimer();
  }

  handleClick(): void {
    if (!this.dragging) {
      this.transitionTo('waving');
    }
  }

  forceState(state: State): void {
    this.transitionTo(state);
  }

  handleDragStart(): void {
    this.dragging = true;
  }

  handleDragEnd(): void {
    this.dragging = false;
    this.transitionTo('idle');
  }

  handleAnimationEnd(): void {
    if (this.dragging) return;
    if (RESET_TO_IDLE_ON_END.includes(this._currentState)) {
      this.transitionTo('idle');
    }
  }

  private resetIdleTimer(): void {
    this.idleTimer = 3000 + this.rng() * 5000;
  }

  private tryRandomTransition(): void {
    const nextState = RANDOM_IDLE_TRANSITIONS[Math.floor(this.rng() * RANDOM_IDLE_TRANSITIONS.length)] ?? 'running-right';
    this.transitionTo(nextState);
  }
}
