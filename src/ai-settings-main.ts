import { invoke } from '@tauri-apps/api/core';
import { emit } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';

const DEFAULT_PROMPT = '你是一只可爱的桌面宠物猫，名叫小橘。你是主人的编程伙伴，用简短可爱的语气回应，每句话不超过30字。偶尔加个喵~';

const keyInput = document.getElementById('ai-key-input') as HTMLInputElement;
const keyToggle = document.getElementById('ai-key-toggle')!;
const urlInput = document.getElementById('ai-url-input') as HTMLInputElement;
const modelInput = document.getElementById('ai-model-input') as HTMLInputElement;
const promptInput = document.getElementById('ai-prompt-input') as HTMLTextAreaElement;
const idleToggle = document.getElementById('ai-idle-toggle')!;
const intervalInput = document.getElementById('ai-interval-input') as HTMLInputElement;
const intervalRow = document.getElementById('ai-interval-row')!;
const testBtn = document.getElementById('ai-test-btn')! as HTMLButtonElement;
const saveBtn = document.getElementById('ai-save-btn')! as HTMLButtonElement;
const statusBar = document.getElementById('ai-status-bar')!;
const statusDot = document.getElementById('ai-settings-status-dot')!;
const promptCount = document.getElementById('ai-prompt-count')!;
const promptReset = document.getElementById('ai-prompt-reset')!;

interface AiConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  systemPrompt: string;
  idleChatEnabled: boolean;
  idleChatInterval: number;
}

let idleEnabled = true;

function updateIdleToggle(): void {
  idleToggle.className = idleEnabled ? 'ai-toggle on' : 'ai-toggle';
}

function updateIntervalVisibility(): void {
  intervalRow.style.display = idleEnabled ? '' : 'none';
}

function updatePromptCount(): void {
  promptCount.textContent = `${promptInput.value.length} / 500`;
}

function setStatus(msg: string, ok: boolean): void {
  statusBar.textContent = msg;
  statusBar.className = `ai-status-bar show ${ok ? 'ok' : 'err'}`;
  statusDot.className = `ai-status-dot ${ok ? 'connected' : 'error'}`;
}

function readForm(): AiConfig {
  return {
    apiKey: keyInput.value.trim(),
    baseUrl: urlInput.value.trim(),
    model: modelInput.value.trim(),
    systemPrompt: promptInput.value.trim(),
    idleChatEnabled: idleEnabled,
    idleChatInterval: parseInt(intervalInput.value, 10) || 300,
  };
}

async function fillForm(): Promise<void> {
  try {
    const config = await invoke<AiConfig | null>('get_ai_config');
    if (config) {
      keyInput.value = config.apiKey ?? '';
      urlInput.value = config.baseUrl ?? 'https://api.deepseek.com';
      modelInput.value = config.model ?? 'DeepSeek-V3';
      promptInput.value = config.systemPrompt ?? DEFAULT_PROMPT;
      idleEnabled = config.idleChatEnabled ?? true;
      intervalInput.value = String(config.idleChatInterval ?? 300);
    }
  } catch {
    // No config yet
  }
  updateIdleToggle();
  updateIntervalVisibility();
  updatePromptCount();
}

keyToggle.addEventListener('click', () => {
  keyInput.type = keyInput.type === 'password' ? 'text' : 'password';
});

idleToggle.addEventListener('click', () => {
  idleEnabled = !idleEnabled;
  updateIdleToggle();
  updateIntervalVisibility();
});

promptInput.addEventListener('input', updatePromptCount);

promptReset.addEventListener('click', () => {
  promptInput.value = DEFAULT_PROMPT;
  updatePromptCount();
});


testBtn.addEventListener('click', async () => {
  const config = readForm();
  if (!config.apiKey) {
    setStatus('请先输入 API Key', false);
    return;
  }
  testBtn.textContent = '测试中...';
  testBtn.disabled = true;
  try {
    await invoke<string>('test_ai_connection', { config });
    setStatus(`连接正常 — ${config.model}`, true);
  } catch (e) {
    setStatus(String(e), false);
  } finally {
    testBtn.textContent = '测试连接';
    testBtn.disabled = false;
  }
});

saveBtn.addEventListener('click', async () => {
  const config = readForm();
  if (!config.apiKey) {
    setStatus('API Key 不能为空', false);
    return;
  }
  try {
    await invoke('set_ai_config', { config });
    await emit('ai-config-changed', config);
    await getCurrentWindow().close();
  } catch (e) {
    setStatus(String(e), false);
  }
});

const hooksDot = document.getElementById('ai-hooks-dot')!;
const hooksText = document.getElementById('ai-hooks-text')!;
const hooksBtn = document.getElementById('ai-hooks-btn')! as HTMLButtonElement;

let hooksInstalled = false;

function updateHooksUI(): void {
  if (hooksInstalled) {
    hooksDot.className = 'ai-status-dot connected';
    hooksText.textContent = '已安装';
    hooksBtn.textContent = '卸载 CC Hooks';
    hooksBtn.className = 'ai-hooks-btn uninstall';
  } else {
    hooksDot.className = 'ai-status-dot';
    hooksText.textContent = '未安装';
    hooksBtn.textContent = '安装 CC Hooks';
    hooksBtn.className = 'ai-hooks-btn install';
  }
}

async function checkHooksStatus(): Promise<void> {
  try {
    const status = await invoke<{ installed: boolean }>('check_cc_hooks_status');
    hooksInstalled = status.installed;
  } catch {
    hooksInstalled = false;
  }
  updateHooksUI();
  hooksBtn.disabled = false;
}

hooksBtn.addEventListener('click', async () => {
  hooksBtn.disabled = true;
  hooksBtn.textContent = hooksInstalled ? '卸载中...' : '安装中...';
  try {
    const result = await invoke<{ success: boolean; error?: string }>(
      hooksInstalled ? 'uninstall_cc_hooks' : 'install_cc_hooks'
    );
    if (result.success) {
      setStatus(hooksInstalled ? 'CC Hooks 已卸载' : 'CC Hooks 已安装', true);
      await checkHooksStatus();
    } else {
      setStatus(result.error ?? '操作失败', false);
      hooksBtn.disabled = false;
      updateHooksUI();
    }
  } catch (e) {
    setStatus(String(e), false);
    hooksBtn.disabled = false;
    updateHooksUI();
  }
});

// Init
fillForm();
checkHooksStatus();
