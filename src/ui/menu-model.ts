import type { PetState } from '../types';

export type StateAction = Extract<
  PetState,
  'waving' | 'review' | 'running' | 'waiting' | 'jumping' | 'running-right' | 'running-left' | 'idle'
>;

export interface PetMenuItem {
  id: string;
  label: string;
}

export type MenuAction =
  | { type: 'state'; state: StateAction }
  | { type: 'pet'; petId: string };

export const STATE_ITEMS = [
  { label: 'Wave', action: 'waving' },
  { label: 'Think', action: 'review' },
  { label: 'Work', action: 'running' },
  { label: 'Wait', action: 'waiting' },
  { label: 'Jump', action: 'jumping' },
  { label: 'Move Right', action: 'running-right' },
  { label: 'Move Left', action: 'running-left' },
  { label: 'Reset to Idle', action: 'idle' },
] as const satisfies ReadonlyArray<{ label: string; action: StateAction }>;
