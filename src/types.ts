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

export type AtlasFormat = 'desktop-pet' | 'petdex';

export interface PetManifest {
  id: string;
  displayName: string;
  description: string;
  spritesheetPath: 'spritesheet.webp';
  atlasFormat?: AtlasFormat;
}

export interface LoadedPet {
  manifest: PetManifest;
  spritesheet: HTMLImageElement;
  atlasFormat: AtlasFormat;
}

export interface PetCatalogEntry {
  id: string;
  source: 'built-in' | 'user' | 'petdex';
  manifest: PetManifest;
  spritesheetUrl: string;
  removable: boolean;
}

export interface Position {
  x: number;
  y: number;
}

export interface ApiKeyEntry {
  id?: number;
  provider: string;
  apiKey: string;
  baseUrl: string;
  defaultModel: string;
  isDefault: boolean;
}

export interface PetPersona {
  petId: string;
  apiKeyId: number | null;
  modelOverride: string;
  systemPrompt: string;
}

export interface AiConfig {
  apiKeys: ApiKeyEntry[];
  idleChatEnabled: boolean;
  idleChatInterval: number;
}

export interface Preferences {
  activePetId: string;
  windowPosition?: Position;
  aiConfig?: AiConfig;
}
