export type PetState =
  | 'idle'
  | 'running-right'
  | 'running-left'
  | 'waving'
  | 'jumping'
  | 'failed'
  | 'waiting'
  | 'running'
  | 'review';

export interface PetManifest {
  id: string;
  displayName: string;
  description: string;
  spritesheetPath: 'spritesheet.webp';
}

export interface LoadedPet {
  manifest: PetManifest;
  spritesheet: HTMLImageElement;
}

export interface PetCatalogEntry {
  id: string;
  source: 'built-in' | 'user';
  manifest: PetManifest;
  spritesheetUrl: string;
  removable: boolean;
}

export interface Position {
  x: number;
  y: number;
}

export interface AiConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  systemPrompt: string;
  idleChatEnabled: boolean;
  idleChatInterval: number;
}

export interface Preferences {
  activePetId: string;
  windowPosition?: Position;
  aiConfig?: AiConfig;
}
