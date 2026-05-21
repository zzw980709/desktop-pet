import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { emit } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';

const pickBtn = document.getElementById('pick-btn')!;
const fileInfo = document.getElementById('file-info')!;
const nameInput = document.getElementById('name-input') as HTMLInputElement;
const cancelBtn = document.getElementById('cancel-btn')!;
const confirmBtn = document.getElementById('confirm-btn')! as HTMLButtonElement;
const tabDir = document.getElementById('tab-dir')!;
const tabFile = document.getElementById('tab-file')!;
const petPreview = document.getElementById('pet-preview')!;
const petName = document.getElementById('pet-name')!;
const petDesc = document.getElementById('pet-desc')!;

interface AddPetResult {
  success: boolean;
  petId?: string;
  error?: string;
}

let selectedPath: string | null = null;
let isValid = false;
let mode: 'dir' | 'file' = 'dir';

function switchMode(newMode: 'dir' | 'file'): void {
  mode = newMode;
  selectedPath = null;
  isValid = false;
  fileInfo.textContent = '';
  fileInfo.className = 'file-info';
  nameInput.style.display = newMode === 'file' ? '' : 'none';
  nameInput.value = '';
  petPreview.style.display = 'none';
  confirmBtn.disabled = true;

  if (newMode === 'dir') {
    tabDir.classList.add('active');
    tabFile.classList.remove('active');
    pickBtn.textContent = '选择 Petdex 宠物目录...';
    confirmBtn.textContent = '确认导入';
  } else {
    tabFile.classList.add('active');
    tabDir.classList.remove('active');
    pickBtn.textContent = '选择精灵图...';
    confirmBtn.textContent = '确认添加';
  }
}

tabDir.addEventListener('click', () => switchMode('dir'));
tabFile.addEventListener('click', () => switchMode('file'));

function updateConfirm(): void {
  if (mode === 'dir') {
    confirmBtn.disabled = !(isValid && selectedPath !== null);
  } else {
    confirmBtn.disabled = !(isValid && nameInput.value.trim().length > 0);
  }
}

function validateDimensions(img: HTMLImageElement): { ok: boolean; msg: string } {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (w !== 1536) return { ok: false, msg: `宽度须为 1536px，实际 ${w}px` };
  if (h < 1664) return { ok: false, msg: `高度至少 1664px，实际 ${h}px` };
  if (h % 208 !== 0) return { ok: false, msg: `高度须为 208px 的整倍数，实际 ${h}px` };
  return { ok: true, msg: '' };
}

// --- Directory mode ---
pickBtn.addEventListener('click', async () => {
  if (mode === 'dir') {
    await pickDirectory();
  } else {
    await pickFile();
  }
});

async function pickDirectory(): Promise<void> {
  try {
    const path = await invoke<string | null>('pick_petdex_directory');
    if (!path) return;

    selectedPath = path;
    fileInfo.textContent = '检查中...';
    fileInfo.className = 'file-info';

    // Read pet.json from the directory to preview
    const manifestPath = path.replace(/\/$/, '') + '/pet.json';
    const assetUrl = convertFileSrc(manifestPath);
    try {
      const resp = await fetch(assetUrl);
      const json = await resp.json();
      const id = json.id || json.slug || path.split(/[/\\]/).pop() || 'unknown';
      const name = json.displayName || json.name || id;
      petName.textContent = name;
      petDesc.textContent = json.description || '';
      petPreview.style.display = '';
      isValid = true;
      fileInfo.textContent = `目录: ${path.split(/[/\\]/).pop()}`;
      fileInfo.className = 'file-info ok';
      updateConfirm();
    } catch {
      fileInfo.textContent = '无法读取 pet.json，请确认目录包含有效的宠物包';
      fileInfo.className = 'file-info err';
      isValid = false;
      petPreview.style.display = 'none';
      updateConfirm();
    }
  } catch (err) {
    console.error('[pet-import] pick_petdex_directory failed:', err);
  }
}

// --- File mode ---
async function pickFile(): Promise<void> {
  try {
    const path = await invoke<string | null>('pick_spritesheet');
    if (!path) return;

    selectedPath = path;
    const fileName = path.split(/[/\\]/).pop() || path;
    petPreview.style.display = 'none';
    fileInfo.textContent = `检查中: ${fileName}...`;
    fileInfo.className = 'file-info';

    const assetUrl = convertFileSrc(path);
    const img = new Image();
    img.onload = () => {
      const result = validateDimensions(img);
      isValid = result.ok;
      fileInfo.textContent = result.ok ? `${fileName} (${img.naturalWidth}x${img.naturalHeight})` : `${fileName} — ${result.msg}`;
      fileInfo.className = `file-info ${result.ok ? 'ok' : 'err'}`;
      updateConfirm();
    };
    img.onerror = () => {
      isValid = false;
      fileInfo.textContent = `无法读取: ${fileName}`;
      fileInfo.className = 'file-info err';
      updateConfirm();
    };
    img.src = assetUrl;
  } catch (err) {
    console.error('[pet-import] pick_spritesheet failed:', err);
  }
}

nameInput.addEventListener('input', updateConfirm);
cancelBtn.addEventListener('click', () => getCurrentWindow().close());

confirmBtn.addEventListener('click', async () => {
  if (!selectedPath || !isValid) return;

  try {
    let result: AddPetResult;
    if (mode === 'dir') {
      result = await invoke<AddPetResult>('import_petdex_package', {
        sourceDir: selectedPath,
      });
    } else {
      if (!nameInput.value.trim()) return;
      result = await invoke<AddPetResult>('add_pet_from_spritesheet', {
        sourcePath: selectedPath,
        displayName: nameInput.value.trim(),
      });
    }

    if (result.success) {
      await emit('pet-added', result.petId);
    } else {
      fileInfo.textContent = result.error || '添加失败';
      fileInfo.className = 'file-info err';
      return;
    }
  } catch (e) {
    fileInfo.textContent = String(e);
    fileInfo.className = 'file-info err';
    return;
  }
  await getCurrentWindow().close();
});
