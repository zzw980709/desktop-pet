import type { PetState } from '../types';

export type State = PetState;

type StateChangeHandler = (newState: State, oldState: State) => void;

const RESET_TO_IDLE_ON_END: State[] = ['waving', 'jumping', 'failed', 'bongo-left', 'bongo-right'];
const RANDOM_IDLE_TRANSITIONS: State[] = ['running-right', 'running-left', 'jumping', 'running', 'waiting', 'review'];
const DRAG_SETTLE_MS = 180;
const DIRECTIONAL_DRAG_STATES: State[] = ['running-right', 'running-left'];
const MAX_RANDOM_ACTION_MS = 4000;

interface RoamingState {
  active: boolean;
  suspended: boolean;
  mode: 'paused' | 'wandering' | 'acting';
  targetX: number;
  targetY: number;
  speed: number;
  pauseTimer: number;
  direction: 'left' | 'right';
}

const EDGE_MARGIN = 40;
const WANDER_SPEED_MIN = 60;
const WANDER_SPEED_MAX = 120;
const PAUSE_MIN_MS = 2000;
const PAUSE_MAX_MS = 8000;
const ACT_PROBABILITY = 0.1;
const ACT_OPTIONS: State[] = ['jumping', 'waiting', 'review'];

export class BehaviorEngine {
  private _currentState: State = 'idle';
  private listeners: StateChangeHandler[] = [];
  private idleTimer = 0;
  private stateElapsed = 0;
  private dragging = false;
  private dragSettleTimer = 0;
  private rng: () => number;
  private roaming: RoamingState = {
    active: false,
    suspended: false,
    mode: 'paused',
    targetX: 0,
    targetY: 0,
    speed: 60,
    pauseTimer: 0,
    direction: 'right',
  };
  private screenW = 1920;
  private screenH = 1080;
  private currentPosX = 0;
  private _roamingDisplacement = { dx: 0, dy: 0 };

  constructor(rng?: () => number) {
    this.rng = rng ?? Math.random;
    this.resetIdleTimer();
  }

  get roamingActive(): boolean {
    return this.roaming.active;
  }

  get roamingDisplacement(): { dx: number; dy: number } {
    return this._roamingDisplacement;
  }

  setScreenBounds(w: number, h: number): void {
    this.screenW = w;
    this.screenH = h;
  }

  setCurrentPosition(x: number, _y: number): void {
    this.currentPosX = x;
  }

  startRoaming(): void {
    this.roaming.active = true;
    this.roaming.mode = 'paused';
    this.roaming.suspended = false;
    this.roaming.pauseTimer = PAUSE_MIN_MS + this.rng() * (PAUSE_MAX_MS - PAUSE_MIN_MS);
    this._roamingDisplacement = { dx: 0, dy: 0 };
    this.transitionTo('idle');
  }

  suspendRoaming(): void {
    this.roaming.suspended = true;
    this._roamingDisplacement = { dx: 0, dy: 0 };
  }

  resumeRoaming(): void {
    this.roaming.suspended = false;
    this.roaming.mode = 'paused';
    this.roaming.pauseTimer = PAUSE_MIN_MS + this.rng() * (PAUSE_MAX_MS - PAUSE_MIN_MS);
    this.transitionTo('idle');
  }

  notifyArrived(): void {
    if (this.roaming.mode !== 'wandering') return;
    if (this.rng() < ACT_PROBABILITY) {
      this.roaming.mode = 'acting';
      const act = ACT_OPTIONS[Math.floor(this.rng() * ACT_OPTIONS.length)] ?? 'jumping';
      this.transitionTo(act);
    } else {
      this.roaming.mode = 'paused';
      this.roaming.pauseTimer = PAUSE_MIN_MS + this.rng() * (PAUSE_MAX_MS - PAUSE_MIN_MS);
      this.transitionTo('idle');
    }
    this._roamingDisplacement = { dx: 0, dy: 0 };
  }

  redirectFromEdge(edge: 'left' | 'right'): void {
    if (this.roaming.mode !== 'wandering') return;
    switch (edge) {
      case 'left':
        this.roaming.targetX = EDGE_MARGIN + this.rng() * (this.screenW * 0.5);
        break;
      case 'right':
        this.roaming.targetX = this.screenW * 0.5 + this.rng() * (this.screenW * 0.5 - EDGE_MARGIN);
        break;
    }
    this.roaming.direction = this.roaming.targetX > (this.screenW / 2) ? 'right' : 'left';
    this.transitionTo(this.roaming.direction === 'right' ? 'running-right' : 'running-left');
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

      if (this.roaming.active) {
        this.tickRoaming(deltaMs);
        return;
      }

      if (this._currentState !== 'idle') {
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

  private tickRoaming(deltaMs: number): void {
    this._roamingDisplacement = { dx: 0, dy: 0 };

    if (this.roaming.suspended) {
      if (this.roaming.mode === 'paused') {
        this.roaming.pauseTimer -= deltaMs;
      }
      return;
    }

    switch (this.roaming.mode) {
      case 'paused':
        this.roaming.pauseTimer -= deltaMs;
        if (this.roaming.pauseTimer <= 0) {
          const overflow = -this.roaming.pauseTimer;
          this.pickRandomTarget();
          this.roaming.mode = 'wandering';
          this.roaming.speed = WANDER_SPEED_MIN + this.rng() * (WANDER_SPEED_MAX - WANDER_SPEED_MIN);
          this.roaming.direction = this.roaming.targetX > this.currentPosX ? 'right' : 'left';
          this.transitionTo(this.roaming.direction === 'right' ? 'running-right' : 'running-left');
          const dx = (this.roaming.direction === 'right' ? 1 : -1) * this.roaming.speed * (overflow / 1000);
          this._roamingDisplacement = { dx: Math.max(-5, Math.min(5, dx)), dy: 0 };
        }
        break;

      case 'wandering': {
        const dx = (this.roaming.direction === 'right' ? 1 : -1) * this.roaming.speed * (deltaMs / 1000);
        this._roamingDisplacement = { dx: Math.max(-5, Math.min(5, dx)), dy: 0 };

        const estimatedX = this.currentPosX + this._roamingDisplacement.dx;
        if ((this.roaming.direction === 'right' && estimatedX >= this.roaming.targetX) ||
            (this.roaming.direction === 'left' && estimatedX <= this.roaming.targetX)) {
          this.notifyArrived();
        }
        break;
      }

      case 'acting':
        break;
    }
  }

  private pickRandomTarget(): void {
    this.roaming.targetX = EDGE_MARGIN + this.rng() * (this.screenW - 2 * EDGE_MARGIN);
    this.roaming.targetY = EDGE_MARGIN + this.rng() * (this.screenH - 2 * EDGE_MARGIN);
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
    if (this.roaming.active && this.roaming.mode === 'acting') {
      this.roaming.mode = 'paused';
      this.roaming.pauseTimer = PAUSE_MIN_MS + this.rng() * (PAUSE_MAX_MS - PAUSE_MIN_MS);
      this.transitionTo('idle');
      return;
    }
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
