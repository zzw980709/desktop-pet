import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { PhysicalSize } from '@tauri-apps/api/dpi';

interface HistoryEntry { role: 'user' | 'assistant'; content: string; }

const messagesEl = document.getElementById('chat-messages')!;
const emptyEl = document.getElementById('chat-empty')!;
const inputEl = document.getElementById('chat-input')! as HTMLTextAreaElement;
const sendBtn = document.getElementById('chat-send-btn')! as HTMLButtonElement;
const expandBtn = document.getElementById('chat-expand-btn')!;
const closeBtn = document.getElementById('chat-close-btn')!;

let sending = false;
let isFullMode = false;

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
    div.className = `chat-msg ${e.role}`;
    div.textContent = e.content;
    messagesEl.appendChild(div);
  }
  scrollToBottom();
}

function appendMessage(role: 'user' | 'assistant' | 'error' | 'loading', content: string): HTMLElement {
  emptyEl.style.display = 'none';
  const div = document.createElement('div');
  div.className = `chat-msg ${role}`;
  if (role === 'loading') {
    div.innerHTML = '<span class="dot-pulse"></span><span class="dot-pulse"></span><span class="dot-pulse"></span>';
  } else {
    div.textContent = content;
  }
  messagesEl.appendChild(div);
  scrollToBottom();
  return div;
}

async function loadHistory(): Promise<void> {
  try {
    const entries = await invoke<HistoryEntry[]>('load_chat_history');
    renderMessages(entries);
  } catch {
    renderMessages([]);
  }
}

async function sendMessage(): Promise<void> {
  const msg = inputEl.value.trim();
  if (!msg || sending) return;

  try {
    const config = await invoke<{ apiKey: string } | null>('get_ai_config');
    if (!config || !config.apiKey) {
      emptyEl.style.display = '';
      emptyEl.innerHTML = '<div>⚠️ 请先在 AI 设置中配置 API Key</div><button id="chat-open-settings">打开设置</button>';
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

  if (isFullMode) {
    const loadingEl = appendMessage('loading', '');
    loadingEl.className = 'chat-msg assistant';
    loadingEl.textContent = '';

    const unlisten = await listen<string>('chat-stream-token', (event) => {
      loadingEl.textContent += event.payload;
      scrollToBottom();
    });

    try {
      const reply = await invoke<string>('chat_with_pet_stream', {
        messages: [{ role: 'system', content: '' }, { role: 'user', content: msg }],
      });
      if (!reply) loadingEl.textContent = loadingEl.textContent || '(empty)';
    } catch (e) {
      loadingEl.textContent = String(e);
      loadingEl.className = 'chat-msg error';
    }
    unlisten();
  } else {
    const loadingEl = appendMessage('loading', '');
    try {
      const reply = await invoke<string>('chat_with_pet', {
        messages: [{ role: 'system', content: '' }, { role: 'user', content: msg }],
      });
      loadingEl.remove();
      appendMessage('assistant', reply);
    } catch (e) {
      loadingEl.remove();
      appendMessage('error', String(e));
    }
  }

  sending = false;
  sendBtn.disabled = false;
  inputEl.focus();
}

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
    await win.setSize(new PhysicalSize(480, 600));
    await win.setResizable(true);
    expandBtn.textContent = '⤢';
    expandBtn.title = '收缩';
  } else {
    isFullMode = false;
    await win.setSize(new PhysicalSize(340, 440));
    await win.setResizable(false);
    expandBtn.textContent = '⤡';
    expandBtn.title = '展开';
  }
});

void loadHistory();
