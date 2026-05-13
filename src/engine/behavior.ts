export type State = 'idle' | 'walk' | 'sleep' | 'sit' | 'drag' | 'react';

type StateChangeHandler = (newState: State, oldState: State) => void;
type TransitionCondition = () => boolean;

interface Transition {
  from: State;
  to: State;
  condition: TransitionCondition;
}

const NON_IDLE: State[] = ['walk', 'sleep', 'sit', 'react'];

export class BehaviorEngine {
  private _currentState: State = 'idle';
  private transitions: Transition[] = [];
  private listeners: StateChangeHandler[] = [];
  private idleTimer = 0;
  private rng: () => number;

  constructor(rng?: () => number) {
    this.rng = rng ?? Math.random;
    this.resetIdleTimer();
  }

  get currentState(): State {
    return this._currentState;
  }

  on(handler: StateChangeHandler): void {
    this.listeners.push(handler);
  }

  off(handler: StateChangeHandler): void {
    const idx = this.listeners.indexOf(handler);
    if (idx !== -1) this.listeners.splice(idx, 1);
  }

  addTransition(from: State, to: State, condition: TransitionCondition): void {
    this.transitions.push({ from, to, condition });
  }

  transitionTo(newState: State): void {
    if (newState === this._currentState) return;
    const oldState = this._currentState;
    this._currentState = newState;
    if (newState === 'idle') this.resetIdleTimer();
    for (const fn of this.listeners) {
      fn(newState, oldState);
    }
  }

  tick(deltaMs: number): void {
    if (this._currentState === 'idle') {
      this.idleTimer -= deltaMs;
      if (this.idleTimer <= 0) {
        this.tryRandomTransition();
        this.resetIdleTimer();
      }
    }
  }

  handleClick(): void {
    if (this._currentState !== 'drag') {
      this.transitionTo('react');
    }
  }

  forceState(state: State): void {
    this.transitionTo(state);
  }

  handleDragStart(): void {
    this.transitionTo('drag');
  }

  handleDragEnd(): void {
    this.transitionTo('idle');
  }

  handleAnimationEnd(): void {
    if (NON_IDLE.includes(this._currentState)) {
      this.transitionTo('idle');
    }
  }

  private resetIdleTimer(): void {
    this.idleTimer = 3000 + this.rng() * 5000;
  }

  private tryRandomTransition(): void {
    const available = this.transitions.filter((t) => t.from === 'idle' && t.condition());
    if (available.length === 0) return;
    const chosen = available[Math.floor(this.rng() * available.length)];
    this.transitionTo(chosen.to);
  }
}
