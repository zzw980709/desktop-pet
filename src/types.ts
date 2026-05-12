export interface AnimationConfig {
  start: number;
  end: number;
  fps: number;
  loop: boolean;
}

export interface ReminderConfig {
  interval: number; // seconds
  message: string;
  animation: string;
}

export interface CharacterManifest {
  name: string;
  displayName: string;
  version: string;
  author: string;
  frameWidth: number;
  frameHeight: number;
  animations: Record<string, AnimationConfig>;
  defaultState: string;
  scale: number;
  reminders: ReminderConfig[];
  behaviorOverrides?: string;
}

export interface LoadedCharacter {
  manifest: CharacterManifest;
  spritesheet: HTMLImageElement;
}

export type PetState = 'idle' | 'walk' | 'sleep' | 'sit' | 'drag' | 'react';

export interface Position {
  x: number;
  y: number;
}
