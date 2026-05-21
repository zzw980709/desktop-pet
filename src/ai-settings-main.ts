import { invoke } from '@tauri-apps/api/core';
import { emit } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import type { AiConfig, ApiKeyEntry, PetPersona } from './types';

const DEFAULT_PROMPT = '你是一只可爱的桌面宠物猫，名叫小橘。你是主人的编程伙伴，用简短可爱的语气回应，每句话不超过30字。偶尔加个喵~';

// Preset models for well-known providers
const PROVIDER_MODELS: Record<string, string[]> = {
  DeepSeek: ['deepseek-chat', 'deepseek-reasoner'],
  OpenAI: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'o1', 'o3-mini'],
  Anthropic: ['claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5'],
  Google: ['gemini-2.5-pro', 'gemini-2.5-flash'],
  Moonshot: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'],
  Zhipu: ['glm-4-plus', 'glm-4-flash'],
  Qwen: ['qwen-max', 'qwen-plus', 'qwen-turbo'],
};

const ALL_PRESET_MODELS = Object.values(PROVIDER_MODELS).flat();

// ---- Tab switching ----
const tabs = document.querySelectorAll('.tab');
const panels = document.querySelectorAll('.panel');

tabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    const target = (tab as HTMLElement).dataset.tab;
    tabs.forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    panels.forEach((p) => p.classList.remove('active'));
    document.getElementById(`panel-${target}`)?.classList.add('active');
  });
});

// ---- Status bar helpers ----
function setStatus(el: HTMLElement, msg: string, ok: boolean): void {
  el.textContent = msg;
  el.className = `status-bar show ${ok ? 'ok' : 'err'}`;
}

function clearStatus(el: HTMLElement): void {
  el.className = 'status-bar';
}

// ---- Combo box helper ----
function initCombo(comboEl: HTMLElement): void {
  const input = comboEl.querySelector('input')!;
  const dropdown = comboEl.querySelector('.combo-dropdown')!;

  input.addEventListener('focus', () => comboEl.classList.add('open'));
  input.addEventListener('input', () => comboEl.classList.add('open'));

  dropdown.addEventListener('mousedown', (e) => {
    const option = (e.target as HTMLElement).closest('.combo-option');
    if (option) {
      input.value = (option as HTMLElement).dataset.value ?? '';
      comboEl.classList.remove('open');
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });

  input.addEventListener('blur', () => {
    setTimeout(() => comboEl.classList.remove('open'), 150);
  });
}

function setComboOptions(dropdown: HTMLElement, options: string[]): void {
  dropdown.innerHTML = options
    .map((o) => `<div class="combo-option" data-value="${o}">${o}</div>`)
    .join('');
}

// ============================================================
// Panel 1: AI Settings (Key Cards)
// ============================================================
const keyCardsEl = document.getElementById('key-cards')!;
const addKeyBtn = document.getElementById('add-key-btn')!;
const idleToggle = document.getElementById('idle-toggle')!;
const idleInterval = document.getElementById('ai-idle-interval') as HTMLInputElement;
const saveAiBtn = document.getElementById('save-ai-btn')! as HTMLButtonElement;
const testAllBtn = document.getElementById('test-all-btn')! as HTMLButtonElement;
const aiStatusBar = document.getElementById('ai-status-bar')!;

let apiKeys: ApiKeyEntry[] = [];
let idleEnabled = true;
let nextKeyTempId = -1;

function renderKeyCards(): void {
  keyCardsEl.innerHTML = apiKeys.map((key, idx) => {
    const isDefault = key.isDefault;
    return `
      <div class="key-card ${isDefault ? 'default' : ''}" data-key-idx="${idx}">
        <div class="key-card-header">
          <input class="key-provider-input" value="${escapeHtml(key.provider)}" placeholder="Provider" style="font-weight:600;font-size:12px;background:transparent;border:none;color:var(--text);width:100px;" data-field="provider" data-idx="${idx}" />
          ${isDefault ? '<span class="default-badge">默认</span>' : ''}
          <div class="key-card-actions">
            ${!isDefault ? `<button class="btn btn-sm btn-secondary set-default-btn" data-idx="${idx}">设默认</button>` : ''}
            ${!isDefault ? `<button class="btn btn-sm btn-danger del-key-btn" data-idx="${idx}">删除</button>` : ''}
          </div>
        </div>
        <div class="field-row">
          <div class="field">
            <label>API Key</label>
            <div style="position:relative;">
              <input type="password" class="key-field" value="${escapeHtml(key.apiKey)}" placeholder="sk-..." data-field="apiKey" data-idx="${idx}" style="padding-right:32px;" />
              <span class="key-toggle" data-idx="${idx}" style="position:absolute;right:8px;top:50%;transform:translateY(-50%);cursor:pointer;font-size:12px;color:var(--overlay0);">👁️</span>
            </div>
          </div>
          <div class="field">
            <label>Base URL</label>
            <input class="key-field" value="${escapeHtml(key.baseUrl)}" placeholder="https://api.deepseek.com" data-field="baseUrl" data-idx="${idx}" />
          </div>
        </div>
        <div class="field">
          <label>默认模型</label>
          <div class="combo key-model-combo">
            <input class="key-field" value="${escapeHtml(key.defaultModel)}" placeholder="选择或输入模型名" data-field="defaultModel" data-idx="${idx}" />
            <span class="combo-arrow">▼</span>
            <div class="combo-dropdown key-model-dropdown"></div>
          </div>
        </div>
      </div>`;
  }).join('');

  // Bind events
  keyCardsEl.querySelectorAll('.key-toggle').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = Number((btn as HTMLElement).dataset.idx);
      const input = keyCardsEl.querySelector(`input[data-field="apiKey"][data-idx="${idx}"]`) as HTMLInputElement;
      if (input) {
        input.type = input.type === 'password' ? 'text' : 'password';
      }
    });
  });

  keyCardsEl.querySelectorAll('.set-default-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = Number((btn as HTMLElement).dataset.idx);
      apiKeys.forEach((k, i) => (k.isDefault = i === idx));
      renderKeyCards();
    });
  });

  keyCardsEl.querySelectorAll('.del-key-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = Number((btn as HTMLElement).dataset.idx);
      apiKeys.splice(idx, 1);
      if (apiKeys.length > 0 && !apiKeys.some((k) => k.isDefault)) {
        apiKeys[0].isDefault = true;
      }
      renderKeyCards();
    });
  });

  keyCardsEl.querySelectorAll('.key-field').forEach((input) => {
    input.addEventListener('input', () => {
      const el = input as HTMLInputElement;
      const idx = Number(el.dataset.idx);
      const field = el.dataset.field;
      if (idx >= 0 && idx < apiKeys.length && field) {
        (apiKeys[idx] as unknown as Record<string, unknown>)[field] = el.value;
      }
    });
  });

  keyCardsEl.querySelectorAll('.key-provider-input').forEach((input) => {
    input.addEventListener('input', () => {
      const el = input as HTMLInputElement;
      const idx = Number(el.dataset.idx);
      if (idx >= 0 && idx < apiKeys.length) {
        apiKeys[idx].provider = el.value;
      }
    });
  });

  // Init combo boxes
  keyCardsEl.querySelectorAll('.key-model-combo').forEach((combo) => {
    const dropdown = combo.querySelector('.key-model-dropdown')!;
    setComboOptions(dropdown as HTMLElement, ALL_PRESET_MODELS);
    initCombo(combo as HTMLElement);
  });
}

addKeyBtn.addEventListener('click', () => {
  apiKeys.push({
    id: nextKeyTempId--,
    provider: '',
    apiKey: '',
    baseUrl: 'https://api.deepseek.com',
    defaultModel: '',
    isDefault: apiKeys.length === 0,
  });
  renderKeyCards();
});

function updateIdleToggleUI(): void {
  idleToggle.className = idleEnabled ? 'toggle on' : 'toggle';
}

idleToggle.addEventListener('click', () => {
  idleEnabled = !idleEnabled;
  updateIdleToggleUI();
});

function collectKeysFromDOM(): ApiKeyEntry[] {
  // Keys are updated in-place via input events, just return the array
  return apiKeys.map((k) => ({ ...k }));
}

async function loadAiConfig(): Promise<void> {
  try {
    const config = await invoke<AiConfig | null>('get_ai_config');
    if (config) {
      apiKeys = config.apiKeys.length > 0
        ? config.apiKeys.map((k) => ({ ...k }))
        : [];
      idleEnabled = config.idleChatEnabled ?? true;
      idleInterval.value = String(config.idleChatInterval ?? 300);
    }
  } catch {
    // no config
  }
  if (apiKeys.length === 0) {
    apiKeys = [];
  }
  updateIdleToggleUI();
  renderKeyCards();
}

saveAiBtn.addEventListener('click', async () => {
  const config: AiConfig = {
    apiKeys: collectKeysFromDOM(),
    idleChatEnabled: idleEnabled,
    idleChatInterval: parseInt(idleInterval.value, 10) || 300,
  };
  try {
    await invoke('set_ai_config', { config });
    await emit('ai-config-changed', config);
    await getCurrentWindow().close();
  } catch (e) {
    setStatus(aiStatusBar, String(e), false);
  }
});

testAllBtn.addEventListener('click', async () => {
  const keys = collectKeysFromDOM();
  if (keys.length === 0) {
    setStatus(aiStatusBar, '请先添加 API Key', false);
    return;
  }
  testAllBtn.textContent = '测试中...';
  testAllBtn.disabled = true;
  clearStatus(aiStatusBar);

  for (const key of keys) {
    if (!key.apiKey) continue;
    try {
      await invoke<string>('test_ai_connection', {
        apiKey: key.apiKey,
        baseUrl: key.baseUrl,
        model: key.defaultModel || 'gpt-3.5-turbo',
      });
      setStatus(aiStatusBar, `${key.provider || 'Key'}: 连接正常`, true);
    } catch (e) {
      setStatus(aiStatusBar, `${key.provider || 'Key'}: ${String(e)}`, false);
    }
  }
  testAllBtn.textContent = '测试全部连接';
  testAllBtn.disabled = false;
});

// ============================================================
// Panel 2: Persona
// ============================================================
const personaPetList = document.getElementById('persona-pet-list')!;
const personaKeySelect = document.getElementById('persona-key-select') as HTMLSelectElement;
const personaModelInput = document.getElementById('persona-model') as HTMLInputElement;
const personaModelDropdown = document.getElementById('persona-model-dropdown')!;
const personaPrompt = document.getElementById('persona-prompt') as HTMLTextAreaElement;
const personaCount = document.getElementById('persona-count')!;
const personaReset = document.getElementById('persona-reset')!;
const savePersonaBtn = document.getElementById('save-persona-btn')! as HTMLButtonElement;
const personaStatusBar = document.getElementById('persona-status-bar')!;

interface PetInfo { id: string; displayName: string; }
let personaPets: PetInfo[] = [];
let selectedPersonaPetId: string | null = null;

setComboOptions(personaModelDropdown, ALL_PRESET_MODELS);
initCombo(document.getElementById('persona-model-combo')!);

personaPrompt.addEventListener('input', () => {
  personaCount.textContent = `${personaPrompt.value.length} / 500`;
});

personaReset.addEventListener('click', () => {
  personaPrompt.value = DEFAULT_PROMPT;
  personaCount.textContent = `${personaPrompt.value.length} / 500`;
});

async function loadPersonaPets(): Promise<void> {
  try {
    const records = await invoke<Array<{ manifest: unknown }>>('discover_pets');
    personaPets = records
      .map((r) => {
        const m = r.manifest as Record<string, unknown>;
        return {
          id: (m.id as string) ?? (m.slug as string) ?? '',
          displayName: (m.displayName as string) ?? (m.name as string) ?? (m.id as string) ?? '',
        };
      })
      .filter((p) => p.id);
  } catch {
    personaPets = [];
  }
  renderPersonaPetList();
}

function renderPersonaPetList(): void {
  personaPetList.innerHTML = personaPets.map((pet) => {
    const selected = pet.id === selectedPersonaPetId ? ' selected' : '';
    const emoji = pet.id === 'cat' ? '🐱' : '🐾';
    return `
      <div class="pet-select-card${selected}" data-pet-id="${pet.id}">
        <span class="emoji">${emoji}</span>
        <span class="name">${escapeHtml(pet.displayName)}</span>
        <div class="check-circle">✓</div>
      </div>`;
  }).join('');

  personaPetList.querySelectorAll('.pet-select-card').forEach((card) => {
    card.addEventListener('click', () => {
      const petId = (card as HTMLElement).dataset.petId!;
      selectPersonaPet(petId);
    });
  });
}

async function selectPersonaPet(petId: string): Promise<void> {
  selectedPersonaPetId = petId;
  renderPersonaPetList();
  clearStatus(personaStatusBar);

  // Load persona for this pet
  try {
    const persona = await invoke<PetPersona | null>('get_pet_persona', { petId });
    if (persona) {
      personaKeySelect.value = persona.apiKeyId != null ? String(persona.apiKeyId) : '';
      personaModelInput.value = persona.modelOverride ?? '';
      personaPrompt.value = persona.systemPrompt || DEFAULT_PROMPT;
    } else {
      personaKeySelect.value = '';
      personaModelInput.value = '';
      personaPrompt.value = DEFAULT_PROMPT;
    }
  } catch {
    personaKeySelect.value = '';
    personaModelInput.value = '';
    personaPrompt.value = DEFAULT_PROMPT;
  }
  personaCount.textContent = `${personaPrompt.value.length} / 500`;
}

function updatePersonaKeySelect(): void {
  const keys = collectKeysFromDOM();
  const currentVal = personaKeySelect.value;
  personaKeySelect.innerHTML = '<option value="">跟随默认</option>' +
    keys.map((k, i) => {
      const label = k.provider || `Key ${i + 1}`;
      const keyId = k.id != null ? String(k.id) : `temp_${i}`;
      return `<option value="${keyId}">${escapeHtml(label)} (${escapeHtml(k.defaultModel || 'N/A')})</option>`;
    }).join('');
  // Try to restore selection
  if (currentVal && personaKeySelect.querySelector(`option[value="${currentVal}"]`)) {
    personaKeySelect.value = currentVal;
  }
}

savePersonaBtn.addEventListener('click', async () => {
  if (!selectedPersonaPetId) {
    setStatus(personaStatusBar, '请先选择一个宠物', false);
    return;
  }
  const keys = collectKeysFromDOM();
  const rawKeyId = personaKeySelect.value;
  let apiKeyId: number | null = null;
  if (rawKeyId && rawKeyId !== '') {
    if (rawKeyId.startsWith('temp_')) {
      // Temp key not yet saved — save keys first
      setStatus(personaStatusBar, '请先在 AI 设置中保存 API Keys', false);
      return;
    }
    apiKeyId = parseInt(rawKeyId, 10);
    // Validate keyId exists in current keys
    if (!keys.some((k) => k.id === apiKeyId)) {
      apiKeyId = null;
    }
  }

  try {
    await invoke('set_pet_persona', {
      persona: {
        petId: selectedPersonaPetId,
        apiKeyId,
        modelOverride: personaModelInput.value.trim(),
        systemPrompt: personaPrompt.value.trim(),
      },
    });
    setStatus(personaStatusBar, '人设已保存', true);
  } catch (e) {
    setStatus(personaStatusBar, String(e), false);
  }
});

// Refresh key select when switching to persona tab
document.querySelector('[data-tab="persona"]')?.addEventListener('click', () => {
  updatePersonaKeySelect();
});

// ============================================================
// Panel 3: Import
// ============================================================
const importTabs = document.querySelectorAll('#import-tabs .import-tab');
const importDirPanel = document.getElementById('import-dir')!;
const importFilePanel = document.getElementById('import-file')!;
let importMode: 'dir' | 'file' = 'dir';

importTabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    importTabs.forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    importMode = (tab as HTMLElement).dataset.importMode as 'dir' | 'file';
    importDirPanel.style.display = importMode === 'dir' ? '' : 'none';
    importFilePanel.style.display = importMode === 'file' ? '' : 'none';
  });
});

// Dir import
const importDirPath = document.getElementById('import-dir-path') as HTMLInputElement;
const importDirPreview = document.getElementById('import-dir-preview')!;
const importDirName = document.getElementById('import-dir-name')!;
const importDirInfo = document.getElementById('import-dir-info')!;
const importDirStatus = document.getElementById('import-dir-status')!;
const importDirConfirm = document.getElementById('import-dir-confirm')! as HTMLButtonElement;
const importStatusBar = document.getElementById('import-status-bar')!;

let selectedDirPath: string | null = null;

importDirPath.addEventListener('click', async () => {
  try {
    const path = await invoke<string | null>('pick_petdex_directory');
    if (path) {
      selectedDirPath = path;
      importDirPath.value = path;
      importDirPreview.style.display = '';
      const parts = path.split('/').filter(Boolean);
      const dirName = parts[parts.length - 1] ?? path;
      importDirName.textContent = dirName;
      importDirInfo.textContent = '点击确认导入前请检查目录内容';
      importDirStatus.textContent = '已选择';
      importDirConfirm.disabled = false;
    }
  } catch (e) {
    setStatus(importStatusBar, String(e), false);
  }
});

importDirConfirm.addEventListener('click', async () => {
  if (!selectedDirPath) return;
  importDirConfirm.disabled = true;
  importDirConfirm.textContent = '导入中...';
  clearStatus(importStatusBar);
  try {
    const result = await invoke<{ success: boolean; petId?: string; error?: string }>(
      'import_petdex_package',
      { sourceDir: selectedDirPath },
    );
    if (result.success) {
      setStatus(importStatusBar, `导入成功: ${result.petId ?? ''}`, true);
      importDirPreview.style.display = 'none';
      importDirPath.value = '';
      selectedDirPath = null;
      // Refresh persona pet list
      await loadPersonaPets();
    } else {
      setStatus(importStatusBar, result.error ?? '导入失败', false);
    }
  } catch (e) {
    setStatus(importStatusBar, String(e), false);
  }
  importDirConfirm.disabled = false;
  importDirConfirm.textContent = '确认导入';
});

// File import
const importFilePath = document.getElementById('import-file-path') as HTMLInputElement;
const importFileName = document.getElementById('import-file-name') as HTMLInputElement;
const importFileConfirm = document.getElementById('import-file-confirm')! as HTMLButtonElement;
const importFileStatusBar = document.getElementById('import-file-status-bar')!;

let selectedFilePath: string | null = null;

importFilePath.addEventListener('click', async () => {
  try {
    const path = await invoke<string | null>('pick_spritesheet');
    if (path) {
      selectedFilePath = path;
      importFilePath.value = path;
      importFileConfirm.disabled = false;
    }
  } catch (e) {
    setStatus(importFileStatusBar, String(e), false);
  }
});

importFileConfirm.addEventListener('click', async () => {
  if (!selectedFilePath) return;
  const name = importFileName.value.trim();
  if (!name) {
    setStatus(importFileStatusBar, '请输入宠物名称', false);
    return;
  }
  importFileConfirm.disabled = true;
  importFileConfirm.textContent = '添加中...';
  clearStatus(importFileStatusBar);
  try {
    const result = await invoke<{ success: boolean; petId?: string; error?: string }>(
      'add_pet_from_spritesheet',
      { sourcePath: selectedFilePath, displayName: name },
    );
    if (result.success) {
      setStatus(importFileStatusBar, `添加成功: ${result.petId ?? ''}`, true);
      importFilePath.value = '';
      importFileName.value = '';
      selectedFilePath = null;
      await loadPersonaPets();
    } else {
      setStatus(importFileStatusBar, result.error ?? '添加失败', false);
    }
  } catch (e) {
    setStatus(importFileStatusBar, String(e), false);
  }
  importFileConfirm.disabled = false;
  importFileConfirm.textContent = '确认添加';
});

// ============================================================
// Panel 4: CC Hooks
// ============================================================
const hooksDot = document.getElementById('hooks-dot')!;
const hooksBadge = document.getElementById('hooks-badge')!;
const hooksStatusText = document.getElementById('hooks-status-text')!;
const hooksBtn = document.getElementById('hooks-btn')! as HTMLButtonElement;
const hooksStatusMsg = document.getElementById('hooks-status-msg')!;

let hooksInstalled = false;

function updateHooksUI(): void {
  if (hooksInstalled) {
    hooksDot.className = 'status-dot on';
    hooksBadge.style.background = 'var(--green)';
    hooksStatusText.textContent = '已安装';
    hooksBtn.textContent = '卸载 CC Hooks';
    hooksBtn.className = 'btn btn-danger';
  } else {
    hooksDot.className = 'status-dot';
    hooksBadge.style.background = 'var(--surface2)';
    hooksStatusText.textContent = '未安装';
    hooksBtn.textContent = '安装 CC Hooks';
    hooksBtn.className = 'btn btn-primary';
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
  clearStatus(hooksStatusMsg);
  try {
    const result = await invoke<{ success: boolean; error?: string }>(
      hooksInstalled ? 'uninstall_cc_hooks' : 'install_cc_hooks',
    );
    if (result.success) {
      setStatus(hooksStatusMsg, hooksInstalled ? 'CC Hooks 已卸载' : 'CC Hooks 已安装', true);
      await checkHooksStatus();
    } else {
      setStatus(hooksStatusMsg, result.error ?? '操作失败', false);
      hooksBtn.disabled = false;
      updateHooksUI();
    }
  } catch (e) {
    setStatus(hooksStatusMsg, String(e), false);
    hooksBtn.disabled = false;
    updateHooksUI();
  }
});

// ============================================================
// Init
// ============================================================
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

loadAiConfig();
loadPersonaPets();
checkHooksStatus();
