import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { emit } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';

const pickBtn = document.getElementById('pick-btn')!;
const fileInfo = document.getElementById('file-info')!;
const nameInput = document.getElementById('name-input') as HTMLInputElement;
const cancelBtn = document.getElementById('cancel-btn')!;
const confirmBtn = document.getElementById('confirm-btn')! as HTMLButtonElement;

interface AddPetResult {
  success: boolean;
  petId?: string;
  error?: string;
}

let selectedPath: string | null = null;
let isValid = false;

function updateConfirm(): void {
  confirmBtn.disabled = !(isValid && nameInput.value.trim().length > 0);
}

function validateDimensions(img: HTMLImageElement): { ok: boolean; msg: string } {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (w !== 1536) return { ok: false, msg: `宽度须为 1536px，实际 ${w}px` };
  if (h < 1872) return { ok: false, msg: `高度至少 1872px，实际 ${h}px` };
  if (h % 208 !== 0) return { ok: false, msg: `高度须为 208px 的整倍数，实际 ${h}px` };
  return { ok: true, msg: '' };
}

pickBtn.addEventListener('click', async () => {
  try {
    const path = await invoke<string | null>('pick_spritesheet');
    if (!path) return;

    selectedPath = path;
    const fileName = path.split(/[/\\]/).pop() || path;
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
});

nameInput.addEventListener('input', updateConfirm);

cancelBtn.addEventListener('click', () => getCurrentWindow().close());

confirmBtn.addEventListener('click', async () => {
  if (!selectedPath || !isValid || !nameInput.value.trim()) return;
  try {
    const result = await invoke<AddPetResult>('add_pet_from_spritesheet', {
      sourcePath: selectedPath,
      displayName: nameInput.value.trim(),
    });
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
