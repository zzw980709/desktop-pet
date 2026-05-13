import { getCurrentWindow } from '@tauri-apps/api/window';
import { LogicalSize } from '@tauri-apps/api/dpi';

const PET_SIZE = 64;
const MENU_W = 96;
const MENU_GAP = 4;

export type MenuAction = 'pet' | 'sleep' | 'sit' | 'walk' | 'feed';

const ITEMS: { label: string; action: MenuAction }[] = [
  { label: '摸摸头', action: 'pet' },
  { label: '睡觉', action: 'sleep' },
  { label: '坐下', action: 'sit' },
  { label: '散步', action: 'walk' },
  { label: '喂食', action: 'feed' },
];

export class ContextMenu {
  private el: HTMLElement;
  private open = false;
  private handlers: ((action: MenuAction) => void)[] = [];

  constructor() {
    this.el = document.getElementById('ctx-menu')!;
    this.build();
    document.addEventListener('mousedown', (e) => {
      if (this.open && !this.el.contains(e.target as Node)) {
        void this.hide();
      }
    });
  }

  private build(): void {
    for (const item of ITEMS) {
      const btn = document.createElement('button');
      btn.className = 'ctx-item';
      btn.textContent = item.label;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const { action } = item;
        void this.hide().then(() => {
          for (const h of this.handlers) h(action);
        });
      });
      this.el.appendChild(btn);
    }
  }

  on(handler: (action: MenuAction) => void): void {
    this.handlers.push(handler);
  }

  async show(): Promise<void> {
    if (this.open) return;
    this.open = true;
    const menuH = ITEMS.length * 28 + 8;
    await getCurrentWindow().setSize(
      new LogicalSize(PET_SIZE + MENU_GAP + MENU_W, Math.max(PET_SIZE, menuH)),
    );
    this.el.style.display = 'flex';
  }

  async hide(): Promise<void> {
    if (!this.open) return;
    this.open = false;
    this.el.style.display = 'none';
    await getCurrentWindow().setSize(new LogicalSize(PET_SIZE, PET_SIZE));
  }

  get isOpen(): boolean {
    return this.open;
  }
}
