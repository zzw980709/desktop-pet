import { getCurrentWindow } from '@tauri-apps/api/window';
import { LogicalSize } from '@tauri-apps/api/dpi';
import type { PetState } from '../types';

const MENU_MIN_W = 96;
const MENU_GAP = 4;
const MENU_HORIZONTAL_PADDING = 24;
const MENU_ASCII_CHAR_W = 7;
const MENU_SPACE_CHAR_W = 4;
const MENU_WIDE_CHAR_W = 12;
const MENU_EMOJI_CHAR_W = 14;
const MENU_FALLBACK_CHAR_W = 8;
const WIDE_CHAR_RE = /[\u1100-\u115f\u2329\u232a\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe10-\ufe19\ufe30-\ufe6f\uff00-\uff60\uffe0-\uffe6]/u;

type StateAction = Extract<
  PetState,
  'waving' | 'review' | 'running' | 'waiting' | 'jumping' | 'running-right' | 'running-left' | 'idle'
>;

export interface PetMenuItem {
  id: string;
  label: string;
}

export type MenuAction =
  | { type: 'state'; state: StateAction }
  | { type: 'pet'; petId: string };

export const STATE_ITEMS = [
  { label: 'Wave', action: 'waving' },
  { label: 'Think', action: 'review' },
  { label: 'Work', action: 'running' },
  { label: 'Wait', action: 'waiting' },
  { label: 'Jump', action: 'jumping' },
  { label: 'Move Right', action: 'running-right' },
  { label: 'Move Left', action: 'running-left' },
  { label: 'Reset to Idle', action: 'idle' },
] as const satisfies ReadonlyArray<{ label: string; action: StateAction }>;

export class ContextMenu {
  private el: HTMLElement;
  private open = false;
  private desiredOpen = false;
  private handlers: ((action: MenuAction) => void)[] = [];
  private petWidth = 64;
  private petHeight = 64;
  private pets: PetMenuItem[] = [];
  private currentPetId: string | null = null;
  private visibilityVersion = 0;
  private visibilityTask: Promise<void> = Promise.resolve();
  private textMeasureContext: CanvasRenderingContext2D | null | undefined;

  constructor() {
    this.el = document.getElementById('ctx-menu')!;
    this.build();
    this.el.style.display = 'none';
    document.addEventListener('mousedown', (e) => {
      if (this.open && !this.el.contains(e.target as Node)) {
        void this.hide();
      }
    });
  }

  private build(): void {
    this.el.replaceChildren();
    this.el.style.width = `${this.getMenuWidth()}px`;

    const actionGroup = document.createElement('div');
    for (const item of STATE_ITEMS) {
      const btn = document.createElement('button');
      btn.className = 'ctx-item';
      btn.textContent = item.label;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const action: MenuAction = { type: 'state', state: item.action };
        void this.hide().catch(() => {}).then(() => {
          for (const h of this.handlers) h(action);
        });
      });
      actionGroup.appendChild(btn);
    }
    this.el.appendChild(actionGroup);

    if (this.pets.length > 0) {
      const divider = document.createElement('div');
      divider.className = 'ctx-divider';
      this.el.appendChild(divider);

      for (const pet of this.pets) {
        const btn = document.createElement('button');
        btn.className = 'ctx-item';
        if (pet.id === this.currentPetId) {
          btn.textContent = `Current Pet: ${pet.label}`;
          btn.disabled = true;
        } else {
          btn.textContent = `Switch to ${pet.label}`;
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const action: MenuAction = { type: 'pet', petId: pet.id };
            void this.hide().catch(() => {}).then(() => {
              for (const h of this.handlers) h(action);
            });
          });
        }
        this.el.appendChild(btn);
      }
    }
  }

  on(handler: (action: MenuAction) => void): void {
    this.handlers.push(handler);
  }

  setPets(pets: PetMenuItem[], currentPetId: string): void {
    this.pets = pets;
    this.currentPetId = currentPetId;
    this.build();
    if (this.open || this.desiredOpen) {
      void this.queueWindowSync().catch(() => {});
    }
  }

  setPetSize(width: number, height: number): void {
    this.petWidth = width;
    this.petHeight = height;
    if (!this.open && !this.desiredOpen) {
      void this.queueWindowSync(true).catch(() => {});
    }
  }

  async show(): Promise<void> {
    this.desiredOpen = true;
    await this.queueWindowSync();
  }

  async hide(): Promise<void> {
    this.desiredOpen = false;
    await this.queueWindowSync();
  }

  get isOpen(): boolean {
    return this.open;
  }

  private getMenuWidth(): number {
    const labels = [
      ...STATE_ITEMS.map((item) => item.label),
      ...this.pets.map((pet) => (
        pet.id === this.currentPetId
          ? `Current Pet: ${pet.label}`
          : `Switch to ${pet.label}`
      )),
    ];
    const widestLabel = Math.max(...labels.map((label) => this.measureTextWidth(label)), 0);
    return Math.max(MENU_MIN_W, widestLabel + MENU_HORIZONTAL_PADDING);
  }

  private async syncWindowSize(): Promise<void> {
    await getCurrentWindow().setSize(new LogicalSize(this.petWidth, this.petHeight));
  }

  private async syncOpenWindowSize(): Promise<void> {
    const menuWidth = this.getMenuWidth();
    const totalItems = STATE_ITEMS.length + this.pets.length;
    const dividerHeight = this.pets.length > 0 ? 6 : 0;
    const menuH = totalItems * 28 + 8 + dividerHeight;
    await getCurrentWindow().setSize(
      new LogicalSize(this.petWidth + MENU_GAP + menuWidth, Math.max(this.petHeight, menuH)),
    );
  }

  private queueWindowSync(forceClosedResize = false): Promise<void> {
    const runVersion = ++this.visibilityVersion;
    const nextTask = this.visibilityTask.catch(() => {}).then(async () => {
      if (runVersion !== this.visibilityVersion) {
        return;
      }

      if (this.desiredOpen) {
        await this.syncOpenWindowSize();

        if (runVersion !== this.visibilityVersion || !this.desiredOpen) {
          return;
        }

        this.open = true;
        this.el.style.display = 'flex';
        return;
      }

      if (!forceClosedResize && !this.open && this.el.style.display === 'none') {
        return;
      }

      this.open = false;
      this.el.style.display = 'none';
      await this.syncWindowSize();
    });

    this.visibilityTask = nextTask.catch(() => {});
    return nextTask;
  }

  private measureTextWidth(text: string): number {
    const context = this.getTextMeasureContext();
    if (context) {
      const width = Math.ceil(context.measureText(text).width);
      if (Number.isFinite(width) && width > 0) {
        return width;
      }
    }

    return Array.from(text).reduce((total, char) => total + this.getFallbackCharWidth(char), 0);
  }

  private getTextMeasureContext(): CanvasRenderingContext2D | null {
    if (this.textMeasureContext !== undefined) {
      return this.textMeasureContext;
    }

    try {
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      if (!context) {
        this.textMeasureContext = null;
        return this.textMeasureContext;
      }

      const style = window.getComputedStyle(this.el);
      context.font = [
        style.fontStyle,
        style.fontVariant,
        style.fontWeight,
        style.fontSize,
        style.fontFamily,
      ].filter(Boolean).join(' ');
      this.textMeasureContext = context;
      return this.textMeasureContext;
    } catch {
      this.textMeasureContext = null;
      return this.textMeasureContext;
    }
  }

  private getFallbackCharWidth(char: string): number {
    if (/\s/u.test(char)) {
      return MENU_SPACE_CHAR_W;
    }

    const codePoint = char.codePointAt(0) ?? 0;
    if (codePoint > 0xffff) {
      return MENU_EMOJI_CHAR_W;
    }

    if (WIDE_CHAR_RE.test(char)) {
      return MENU_WIDE_CHAR_W;
    }

    if (codePoint <= 0x00ff) {
      return MENU_ASCII_CHAR_W;
    }

    return MENU_FALLBACK_CHAR_W;
  }
}
