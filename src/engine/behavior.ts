type StateChangeHandler = (newState: string, oldState: string) => void;
type TransitionCondition = () => boolean;

interface Transition {
  from: string;
  to: string;
  condition: TransitionCondition;
}

export class BehaviorEngine {
  currentState = 'idle';
  private transitions: Transition[] = [];
  private listeners: StateChangeHandler[] = [];
  private idleTimer = 0;

  constructor() {
    this.resetIdleTimer();
  }

  on(event: 'stateChange', handler: StateChangeHandler): void {
    if (event === 'stateChange') this.listeners.push(handler);
  }

  addState(_name: string): void {
    // State registry for future validation
  }

  addTransition(from: string, to: string, condition: TransitionCondition): void {
    this.transitions.push({ from, to, condition });
  }

  transitionTo(newState: string): void {
    if (newState === this.currentState) return;
    const oldState = this.currentState;
    this.currentState = newState;
    if (newState === 'idle') this.resetIdleTimer();
    for (const fn of this.listeners) {
      fn(newState, oldState);
    }
  }

  tick(deltaMs: number): void {
    if (this.currentState === 'idle') {
      this.idleTimer -= deltaMs;
      if (this.idleTimer <= 0) {
        this.tryRandomTransition();
        this.resetIdleTimer();
      }
    }
  }

  handleClick(): void {
    if (this.currentState === 'idle' || this.currentState === 'sit') {
      this.transitionTo('react');
    }
  }

  handleDragStart(): void {
    this.transitionTo('drag');
  }

  handleDragEnd(): void {
    this.transitionTo('idle');
  }

  handleAnimationEnd(): void {
    if (this.currentState === 'walk' || this.currentState === 'sleep' || this.currentState === 'sit' || this.currentState === 'react') {
      this.transitionTo('idle');
    }
  }

  private resetIdleTimer(): void {
    // Random interval between 3-8 seconds
    this.idleTimer = 3000 + Math.random() * 5000;
  }

  private tryRandomTransition(): void {
    const available = this.transitions.filter((t) => t.from === 'idle' && t.condition());
    if (available.length === 0) return;
    const chosen = available[Math.floor(Math.random() * available.length)];
    this.transitionTo(chosen.to);
  }
}
