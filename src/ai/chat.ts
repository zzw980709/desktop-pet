import type { AiConfig } from '../types';

let aiConfig: AiConfig | null = null;

export function setConfig(c: AiConfig | null): void {
  aiConfig = c;
  if (c) loadHistory();
}

export function getConfig(): AiConfig | null {
  return aiConfig;
}

export function isConfigValid(): boolean {
  if (!aiConfig) return false;
  return aiConfig.apiKeys.some((k) => k.apiKey.length > 0);
}

export function getDefaultModel(): string {
  const defaultKey = aiConfig?.apiKeys.find((k) => k.isDefault);
  if (defaultKey) return defaultKey.defaultModel;
  return aiConfig?.apiKeys[0]?.defaultModel ?? '';
}

export async function loadHistory(): Promise<void> {
  // no-op: history is loaded per-pet by chat-main.ts
}

export function buildMessages(userMessage: string): Array<{ role: string; content: string }> {
  return [{ role: 'user', content: userMessage }];
}
