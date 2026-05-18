import { getCurrentWindow } from '@tauri-apps/api/window';
import { LogicalSize } from '@tauri-apps/api/dpi';
import type { MenuAction, PetMenuItem } from './menu-model';
import { STATE_ITEMS } from './menu-model';

const MENU_MIN_W = 220;
const MENU_GAP = 4;
const MENU_HORIZONTAL_PADDING = 36;
const MENU_HEADER_HEIGHT = 44;
const MENU_SECTION_TITLE_HEIGHT = 20;
const MENU_ITEM_HEIGHT = 32;
const MENU_SECTION_GAP = 10;
const MENU_BOTTOM_PADDING = 14;
const MENU_ASCII_CHAR_W = 7;
const MENU_SPACE_CHAR_W = 4;
const MENU_WIDE_CHAR_W = 12;
const MENU_EMOJI_CHAR_W = 14;
const MENU_FALLBACK_CHAR_W = 8;
const WIDE_CHAR_RE = /[ᄀ-ᅟ〈〉⺀-꓏가-힣豈-﫿︐-︙︰-﹯＀-｠￠-￦]/u;

export { STATE_ITEMS } from './menu-model';

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
    this.el.className = 'ctx-menu-panel';

    const header = document.createElement('div');
    header.className = 'ctx-header';

    const eyebrow = document.createElement('div');
    eyebrow.className = 'ctx-eyebrow';
    eyebrow.textContent = '桌面宠物';

    const title = document.createElement('div');
    title.className = 'ctx-title';
    title.textContent = this.currentPetId ? this.currentPetLabel() : '小猫';

    header.append(eyebrow, title);
    this.el.appendChild(header);

    const actionSection = document.createElement('section');
    actionSection.className = 'ctx-section';
    actionSection.appendChild(this.createSectionTitle('动作'));

    const actionGroup = document.createElement('div');
    actionGroup.className = 'ctx-group';
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
    actionSection.appendChild(actionGroup);
    this.el.appendChild(actionSection);

    if (this.pets.length > 0) {
      const petSection = document.createElement('section');
      petSection.className = 'ctx-section';
      petSection.appendChild(this.createSectionTitle('切换宠物'));

      for (const pet of this.pets) {
        const btn = document.createElement('button');
        btn.className = 'ctx-item';
        if (pet.id === this.currentPetId) {
          btn.textContent = `当前：${pet.label}`;
          btn.disabled = true;
        } else {
          btn.textContent = pet.label;
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const action: MenuAction = { type: 'pet', petId: pet.id };
            void this.hide().catch(() => {}).then(() => {
              for (const h of this.handlers) h(action);
            });
          });
        }
        petSection.appendChild(btn);
      }
      this.el.appendChild(petSection);
    }

    const manageSection = document.createElement('section');
    manageSection.className = 'ctx-section';

    const addBtn = document.createElement('button');
    addBtn.className = 'ctx-item';
    addBtn.textContent = '添加宠物...';
    addBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const action: MenuAction = { type: 'addPet' };
      void this.hide().catch(() => {}).then(() => {
        for (const h of this.handlers) h(action);
      });
    });
    manageSection.appendChild(addBtn);

    const currentPet = this.pets.find((p) => p.id === this.currentPetId);
    if (currentPet && currentPet.removable) {
      const removeBtn = document.createElement('button');
      removeBtn.className = 'ctx-item ctx-item-danger';
      removeBtn.textContent = `移除 "${currentPet.label}"`;
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const action: MenuAction = { type: 'removePet', petId: currentPet.id };
        void this.hide().catch(() => {}).then(() => {
          for (const h of this.handlers) h(action);
        });
      });
      manageSection.appendChild(removeBtn);
    }

    this.el.appendChild(manageSection);
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
      ...this.pets.map((pet) =>
        pet.id === this.currentPetId ? `当前：${pet.label}` : pet.label
      ),
      '添加宠物...',
    ];
    const currentPet = this.pets.find((p) => p.id === this.currentPetId);
    if (currentPet && currentPet.removable) {
      labels.push(`移除 "${currentPet.label}"`);
    }
    const widestLabel = Math.max(...labels.map((label) => this.measureTextWidth(label)), 0);
    return Math.max(MENU_MIN_W, widestLabel + MENU_HORIZONTAL_PADDING);
  }

  private async syncWindowSize(): Promise<void> {
    await getCurrentWindow().setSize(new LogicalSize(this.petWidth, this.petHeight));
  }

  private async syncOpenWindowSize(): Promise<void> {
    const menuWidth = this.getMenuWidth();
    const petSectionHeight = this.pets.length > 0
      ? MENU_SECTION_TITLE_HEIGHT + this.pets.length * MENU_ITEM_HEIGHT + MENU_SECTION_GAP
      : 0;
    const manageSectionHeight = MENU_ITEM_HEIGHT +
      (this.pets.find((p) => p.id === this.currentPetId)?.removable ? MENU_ITEM_HEIGHT : 0);
    const menuH =
      MENU_HEADER_HEIGHT +
      MENU_SECTION_TITLE_HEIGHT +
      STATE_ITEMS.length * MENU_ITEM_HEIGHT +
      MENU_SECTION_GAP +
      petSectionHeight +
      MENU_SECTION_GAP +
      manageSectionHeight +
      MENU_BOTTOM_PADDING;
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

  private currentPetLabel(): string {
    return this.pets.find((pet) => pet.id === this.currentPetId)?.label ?? '小猫';
  }

  private createSectionTitle(text: string): HTMLDivElement {
    const title = document.createElement('div');
    title.className = 'ctx-section-title';
    title.textContent = text;
    return title;
  }
}
