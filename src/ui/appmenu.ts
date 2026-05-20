import { Menu } from '@tauri-apps/api/menu';
import type { MenuItemOptions, MenuOptions, PredefinedMenuItemOptions, SubmenuOptions } from '@tauri-apps/api/menu';
import type { MenuAction, PetMenuItem } from './menu-model';
import { STATE_ITEMS } from './menu-model';

export class NativeAppMenu {
  private handlers: Array<(action: MenuAction) => void> = [];
  private pets: PetMenuItem[] = [];
  private currentPetId: string | null = null;

  on(handler: (action: MenuAction) => void): void {
    this.handlers.push(handler);
  }

  async setPets(pets: PetMenuItem[], currentPetId: string): Promise<void> {
    if (!this.isAvailable()) {
      return;
    }

    this.pets = pets;
    this.currentPetId = currentPetId;

    const menu = await Menu.new({
      items: [
        {
          id: 'desktop-pet',
          text: '桌面宠物',
          items: this.buildDesktopPetItems(),
        } satisfies SubmenuOptions,
        {
          id: 'actions',
          text: '动作',
          items: this.buildStateItems(),
        } satisfies SubmenuOptions,
        {
          id: 'switch-pet',
          text: '切换宠物',
          items: this.buildPetItems(),
        } satisfies SubmenuOptions,
        {
          id: 'manage',
          text: '管理',
          items: this.buildManageItems(),
        } satisfies SubmenuOptions,
      ],
    } satisfies MenuOptions);

    await menu.setAsAppMenu();
  }

  private currentPetLabel(): string {
    return this.pets.find((pet) => pet.id === this.currentPetId)?.label ?? '小猫';
  }

  private buildDesktopPetItems(): Array<MenuItemOptions | PredefinedMenuItemOptions> {
    const items: Array<MenuItemOptions | PredefinedMenuItemOptions> = [];
    if (this.currentPetId) {
      items.push({
        id: `current:${this.currentPetId}`,
        text: `当前宠物：${this.currentPetLabel()}`,
        enabled: false,
      });
    }
    items.push({ item: 'Separator' });
    items.push(...this.buildStateItems());
    return items;
  }

  private buildStateItems(): MenuItemOptions[] {
    return STATE_ITEMS.map((item) => ({
      id: `state:${item.action}`,
      text: item.label,
      action: () => this.emit({ type: 'state', state: item.action }),
    }));
  }

  private buildPetItems(): MenuItemOptions[] {
    if (this.pets.length === 0) {
      return [
        {
          id: 'pet:none',
          text: '无可用宠物',
          enabled: false,
        },
      ];
    }

    return this.pets.map((pet): MenuItemOptions => {
      if (pet.id === this.currentPetId) {
        return {
          id: `pet:${pet.id}`,
          text: `当前：${pet.label}`,
          enabled: false,
        };
      }

      return {
        id: `pet:${pet.id}`,
        text: pet.label,
        enabled: true,
        action: () => this.emit({ type: 'pet', petId: pet.id }),
      };
    });
  }

  private buildManageItems(): Array<MenuItemOptions | PredefinedMenuItemOptions> {
    const items: Array<MenuItemOptions | PredefinedMenuItemOptions> = [
      {
        id: 'add-pet',
        text: '添加宠物...',
        enabled: true,
        action: () => this.emit({ type: 'addPet' }),
      },
      { item: 'Separator' },
      {
        id: 'ai-settings',
        text: 'AI 设置...',
        enabled: true,
        action: () => this.emit({ type: 'aiSettings' }),
      },
    ];

    const currentPet = this.pets.find((p) => p.id === this.currentPetId);
    if (currentPet && currentPet.removable) {
      items.push({ item: 'Separator' });
      items.push({
        id: 'remove-pet',
        text: `移除 "${currentPet.label}"`,
        enabled: true,
        action: () => this.emit({ type: 'removePet', petId: currentPet.id }),
      });
    }

    return items;
  }

  private emit(action: MenuAction): void {
    for (const handler of this.handlers) {
      handler(action);
    }
  }

  private isAvailable(): boolean {
    return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
  }
}
