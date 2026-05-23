import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { LogicalSize } from '@tauri-apps/api/dpi';
import type { AiConfig, ApiKeyEntry } from './types';

interface HistoryEntry { role: 'user' | 'assistant'; content: string; }

const containerEl = document.getElementById('chat-container')!;
const messagesEl = document.getElementById('chat-messages')!;
const emptyEl = document.getElementById('chat-empty')!;
const inputEl = document.getElementById('chat-input')! as HTMLTextAreaElement;
const sendBtn = document.getElementById('chat-send-btn')! as HTMLButtonElement;
const expandBtn = document.getElementById('chat-expand-btn')!;
const closeBtn = document.getElementById('chat-close-btn')!;
const headerEmoji = document.getElementById('chat-header-emoji')!;
const headerName = document.getElementById('chat-header-name')!;
const headerSub = document.getElementById('chat-header-sub')!;
const sidebarList = document.getElementById('sidebar-list')!;

let sending = false;
let isFullMode = false;
let currentPetId = 'cat';
let currentPetName = '小橘';
let currentPetEmoji = '🐱';

function scrollToBottom(): void {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function renderMessages(entries: HistoryEntry[]): void {
  messagesEl.innerHTML = '';
  if (entries.length === 0) {
    emptyEl.style.display = '';
    return;
  }
  emptyEl.style.display = 'none';
  for (const e of entries) {
    const div = document.createElement('div');
    div.className = `msg ${e.role}`;
    div.textContent = e.content;
    messagesEl.appendChild(div);
  }
  scrollToBottom();
}

function appendMessage(role: 'user' | 'assistant' | 'error' | 'loading', content: string): HTMLElement {
  emptyEl.style.display = 'none';
  const div = document.createElement('div');
  div.className = `msg ${role}`;
  if (role === 'loading') {
    div.innerHTML = '<span class="dot"></span><span class="dot"></span><span class="dot"></span>';
  } else {
    div.textContent = content;
  }
  messagesEl.appendChild(div);
  scrollToBottom();
  return div;
}

function updateSidebar(entries: HistoryEntry[]): void {
  if (!isFullMode) return;
  sidebarList.innerHTML = '';
  const userMessages = entries.filter((e) => e.role === 'user');
  for (let i = userMessages.length - 1; i >= 0; i--) {
    const item = document.createElement('div');
    item.className = 'sidebar-item' + (i === userMessages.length - 1 ? ' active' : '');
    item.textContent = userMessages[i].content.slice(0, 20) || '(新对话)';
    sidebarList.appendChild(item);
  }
}

function updateHeader(): void {
  headerEmoji.textContent = currentPetEmoji;
  headerName.textContent = currentPetName;
}

async function loadHistory(): Promise<void> {
  try {
    const entries = await invoke<HistoryEntry[]>('load_chat_history', { petId: currentPetId });
    renderMessages(entries);
    updateSidebar(entries);
  } catch {
    renderMessages([]);
  }
}

async function sendMessage(): Promise<void> {
  const msg = inputEl.value.trim();
  if (!msg || sending) return;

  try {
    const config = await invoke<AiConfig | null>('get_ai_config');
    if (!config || !config.apiKeys?.some((k: ApiKeyEntry) => k.apiKey.length > 0)) {
      emptyEl.style.display = '';
      emptyEl.innerHTML = '<div>⚠️ 请先在 AI 设置中配置 API Key</div><button class="chat-settings-btn" id="chat-open-settings">打开设置</button>';
      document.getElementById('chat-open-settings')?.addEventListener('click', () => {
        void invoke('open_ai_settings_window');
      });
      return;
    }
  } catch { /* proceed */ }

  sending = true;
  sendBtn.disabled = true;
  inputEl.value = '';

  appendMessage('user', msg);
  void invoke('save_chat_message', { petId: currentPetId, role: 'user', content: msg });

  // Load persona and history for context
  let systemPrompt = '';
  let history: HistoryEntry[] = [];
  try {
    const persona = await invoke<{ systemPrompt: string } | null>('get_pet_persona', { petId: currentPetId });
    systemPrompt = persona?.systemPrompt ?? '';
    history = await invoke<HistoryEntry[]>('load_chat_history', { petId: currentPetId });
  } catch { /* use defaults */ }

  const messages: Array<{ role: string; content: string }> = [];
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }
  for (const h of history) {
    messages.push({ role: h.role, content: h.content });
  }
  messages.push({ role: 'user', content: msg });

  if (isFullMode) {
    const loadingEl = appendMessage('loading', '');
    loadingEl.className = 'msg assistant';
    loadingEl.textContent = '';

    const unlisten = await listen<string>('chat-stream-token', (event) => {
      loadingEl.textContent += event.payload;
      scrollToBottom();
    });

    let reply = '';
    try {
      reply = await invoke<string>('chat_with_pet_stream', { messages });
      if (!reply) loadingEl.textContent = loadingEl.textContent || '(empty)';
    } catch (e) {
      loadingEl.textContent = String(e);
      loadingEl.className = 'msg error';
    }
    unlisten();
    if (reply) {
      void invoke('save_chat_message', { petId: currentPetId, role: 'assistant', content: reply });
    }
  } else {
    const loadingEl = appendMessage('loading', '');
    try {
      const reply = await invoke<string>('chat_with_pet', { messages });
      loadingEl.remove();
      appendMessage('assistant', reply);
      void invoke('save_chat_message', { petId: currentPetId, role: 'assistant', content: reply });
    } catch (e) {
      loadingEl.remove();
      appendMessage('error', String(e));
    }
  }

  sending = false;
  sendBtn.disabled = false;
  inputEl.focus();
}

// Called from Rust via eval when switching pets
(window as any).initChat = function (petId: string, petName: string, petEmoji: string): void {
  currentPetId = petId;
  currentPetName = petName;
  currentPetEmoji = petEmoji;
  updateHeader();
  void loadHistory();
};

inputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    void sendMessage();
  }
});

sendBtn.addEventListener('click', () => void sendMessage());

closeBtn.addEventListener('click', () => void getCurrentWindow().close());

expandBtn.addEventListener('click', async () => {
  const win = getCurrentWindow();
  if (!isFullMode) {
    isFullMode = true;
    await win.setSize(new LogicalSize(480, 600));
    await win.setResizable(true);
    containerEl.classList.add('chat-full');
    headerName.style.display = 'none';
    headerSub.style.display = '';
    expandBtn.textContent = '⤢';
    expandBtn.title = '收缩';
    const entries = await invoke<HistoryEntry[]>('load_chat_history', { petId: currentPetId });
    updateSidebar(entries);
  } else {
    isFullMode = false;
    await win.setSize(new LogicalSize(340, 440));
    await win.setResizable(false);
    containerEl.classList.remove('chat-full');
    headerName.style.display = '';
    headerSub.style.display = 'none';
    expandBtn.textContent = '⤡';
    expandBtn.title = '展开';
  }
});

document.getElementById('sidebar-new-btn')?.addEventListener('click', () => {
  messagesEl.innerHTML = '';
  emptyEl.style.display = '';
  sidebarList.innerHTML = '';
});

// Listen for pet change events from main window
void listen<{ petId: string; petName: string; petEmoji: string }>('chat-pet-changed', (event) => {
  currentPetId = event.payload.petId;
  currentPetName = event.payload.petName;
  currentPetEmoji = event.payload.petEmoji;
  updateHeader();
  void loadHistory();
});

// Initialize from Rust-set globals (or defaults)
if ((window as any).__chatPetId) {
  currentPetId = (window as any).__chatPetId;
  currentPetName = (window as any).__chatPetName;
  currentPetEmoji = (window as any).__chatPetEmoji;
}
updateHeader();
void loadHistory();
