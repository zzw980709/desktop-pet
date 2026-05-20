import { invoke } from '@tauri-apps/api/core';
import type { AiConfig } from '../types';

const MAX_HISTORY = 10;

interface HistoryMessage { role: 'user' | 'assistant'; content: string; }

let chatHistory: HistoryMessage[] = [];
let aiConfig: AiConfig | null = null;

export function setConfig(c: AiConfig | null): void {
  aiConfig = c;
  if (c) loadHistory();
}
export function getConfig(): AiConfig | null { return aiConfig; }

export function addToHistory(role: 'user' | 'assistant', content: string): void {
  chatHistory.push({ role, content });
  if (chatHistory.length > MAX_HISTORY) chatHistory = chatHistory.slice(-MAX_HISTORY);
  void invoke('save_chat_message', { role, content });
}

export async function loadHistory(): Promise<void> {
  try {
    const entries = await invoke<Array<{ role: string; content: string }>>('load_chat_history');
    chatHistory = entries.map((e) => ({ role: e.role as 'user' | 'assistant', content: e.content }));
  } catch {
    chatHistory = [];
  }
}

export function buildMessages(userMessage: string): Array<{ role: string; content: string }> {
  if (!aiConfig) return [];
  const msgs: Array<{ role: string; content: string }> = [
    { role: 'system', content: aiConfig.systemPrompt },
  ];
  for (const h of chatHistory) msgs.push({ role: h.role, content: h.content });
  msgs.push({ role: 'user', content: userMessage });
  return msgs;
}
