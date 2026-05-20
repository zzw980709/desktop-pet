import type { AiConfig } from '../types';
import { invoke } from '@tauri-apps/api/core';

const DEFAULT_PROMPT = '你是一只可爱的桌面宠物猫，名叫小橘。你是主人的编程伙伴，用简短可爱的语气回应，每句话不超过30字。偶尔加个喵~';

export function showAiSettings(currentConfig: AiConfig | null): Promise<AiConfig | null> {
  return new Promise((resolve) => {
    const overlay = document.getElementById('ai-settings-overlay')!;
    const keyInput = document.getElementById('ai-key-input') as HTMLInputElement;
    const keyToggle = document.getElementById('ai-key-toggle')!;
    const urlInput = document.getElementById('ai-url-input') as HTMLInputElement;
    const modelSelect = document.getElementById('ai-model-select') as HTMLSelectElement;
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
    const backdrop = overlay.querySelector('.ai-settings-backdrop')!;

    let idleEnabled = currentConfig?.idleChatEnabled ?? true;

    function fillForm(config: AiConfig | null): void {
      keyInput.value = config?.apiKey ?? '';
      urlInput.value = config?.baseUrl ?? 'https://api.deepseek.com';
      modelSelect.value = config?.model ?? 'DeepSeek-V3';
      promptInput.value = config?.systemPrompt ?? DEFAULT_PROMPT;
      idleEnabled = config?.idleChatEnabled ?? true;
      intervalInput.value = String(config?.idleChatInterval ?? 300);
      updateIdleToggle();
      updateIntervalVisibility();
      updatePromptCount();
      clearStatus();
    }

    function readForm(): AiConfig {
      return {
        apiKey: keyInput.value.trim(),
        baseUrl: urlInput.value.trim(),
        model: modelSelect.value,
        systemPrompt: promptInput.value.trim(),
        idleChatEnabled: idleEnabled,
        idleChatInterval: parseInt(intervalInput.value, 10) || 300,
      };
    }

    function updateIdleToggle(): void {
      idleToggle.className = idleEnabled ? 'ai-toggle on' : 'ai-toggle';
    }

    function updateIntervalVisibility(): void {
      intervalRow.style.display = idleEnabled ? '' : 'none';
    }

    function updatePromptCount(): void {
      const len = promptInput.value.length;
      promptCount.textContent = `${len} / 500`;
    }

    function setStatus(msg: string, ok: boolean): void {
      statusBar.textContent = msg;
      statusBar.className = `ai-status-bar show ${ok ? 'ok' : 'err'}`;
      statusDot.className = `ai-status-dot ${ok ? 'connected' : 'error'}`;
    }

    function clearStatus(): void {
      statusBar.className = 'ai-status-bar';
      statusDot.className = 'ai-status-dot';
    }

    function cleanup(): void {
      overlay.classList.remove('show');
    }

    fillForm(currentConfig);

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

    intervalInput.addEventListener('input', () => {
      const v = parseInt(intervalInput.value, 10);
      const hint = document.getElementById('ai-interval-hint');
      if (hint && v >= 60) {
        const mins = Math.round(v / 60);
        hint.textContent = `约 ${mins} 分钟`;
      }
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

    saveBtn.addEventListener('click', () => {
      const config = readForm();
      if (!config.apiKey) {
        setStatus('API Key 不能为空', false);
        return;
      }
      cleanup();
      resolve(config);
    });

    backdrop.addEventListener('click', () => {
      cleanup();
      resolve(null);
    });

    overlay.classList.add('show');
  });
}
