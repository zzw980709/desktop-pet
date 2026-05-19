import type { PetState } from '../types';

export type StateAction = Extract<
  PetState,
  'waving' | 'review' | 'running' | 'waiting' | 'jumping' | 'running-right' | 'running-left' | 'idle'
>;

export interface PetMenuItem {
  id: string;
  label: string;
  removable: boolean;
}

export type MenuAction =
  | { type: 'state'; state: StateAction }
  | { type: 'pet'; petId: string }
  | { type: 'addPet' }
  | { type: 'removePet'; petId: string }
  | { type: 'installCcHooks' }
  | { type: 'uninstallCcHooks' };

export const STATE_ITEMS = [
  { label: '挥手', action: 'waving' },
  { label: '思考', action: 'review' },
  { label: '工作', action: 'running' },
  { label: '等待', action: 'waiting' },
  { label: '跳跃', action: 'jumping' },
  { label: '向右移动', action: 'running-right' },
  { label: '向左移动', action: 'running-left' },
  { label: '重置', action: 'idle' },
] as const satisfies ReadonlyArray<{ label: string; action: StateAction }>;
