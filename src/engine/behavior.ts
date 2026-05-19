import type { PetState } from '../types';

export type State = PetState;

type StateChangeHandler = (newState: State, oldState: State) => void;

const RESET_TO_IDLE_ON_END: State[] = ['waving', 'jumping', 'failed', 'bongo-left', 'bongo-right'];
const RANDOM_IDLE_TRANSITIONS: State[] = ['running-right', 'running-left', 'jumping', 'running', 'waiting', 'review'];
const DRAG_SETTLE_MS = 180;
const DIRECTIONAL_DRAG_STATES: State[] = ['running-right', 'running-left'];
const MAX_RANDOM_ACTION_MS = 4000;

export class BehaviorEngine {
  private _currentState: State = 'idle';
  private listeners: StateChangeHandler[] = [];
  private idleTimer = 0;
  private stateElapsed = 0;
  private dragging = false;
  private dragSettleTimer = 0;
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
    this.dragSettleTimer = 0;
    this.stateElapsed = 0;
    if (newState === 'idle') {
      this.dragging = false;
      this.resetIdleTimer();
    }
    for (const fn of this.listeners) {
      fn(newState, oldState);
    }
  }

  tick(deltaMs: number): void {
    try {
      if (this.dragging) return;
      if (this.dragSettleTimer > 0) {
        this.dragSettleTimer = Math.max(0, this.dragSettleTimer - deltaMs);
        if (this.dragSettleTimer === 0 && DIRECTIONAL_DRAG_STATES.includes(this._currentState)) {
          this.transitionTo('idle');
        }
        return;
      }

      if (this._currentState !== 'idle') {
        // Looping random actions eventually return to idle
        if (!RESET_TO_IDLE_ON_END.includes(this._currentState)) {
          this.stateElapsed += deltaMs;
          if (this.stateElapsed >= MAX_RANDOM_ACTION_MS) {
            this.transitionTo('idle');
          }
        }
        return;
      }

      this.idleTimer -= deltaMs;
      if (this.idleTimer > 0) return;

      this.tryRandomTransition();
      this.resetIdleTimer();
    } catch (err) {
      console.error('[behavior] tick error, resetting to idle:', err);
      this._currentState = 'idle';
      this.dragging = false;
      this.resetIdleTimer();
    }
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
    this.dragSettleTimer = 0;
  }

  handleDragMove(deltaX: number): void {
    if (!this.dragging) return;
    this.transitionTo(deltaX > 0 ? 'running-right' : 'running-left');
  }

  handleDragEnd(): void {
    this.dragging = false;
    if (DIRECTIONAL_DRAG_STATES.includes(this._currentState)) {
      this.dragSettleTimer = DRAG_SETTLE_MS;
      return;
    }
    this.transitionTo('idle');
  }

  handleBongoTap(side: 'left' | 'right'): void {
    if (this.dragging) return;
    this.transitionTo(side === 'left' ? 'bongo-left' : 'bongo-right');
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
