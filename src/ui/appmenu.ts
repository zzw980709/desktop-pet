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
    if (!this.isAvailable()) return;
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
          id: 'edit',
          text: '编辑',
          items: [
            { item: 'Undo' },
            { item: 'Redo' },
            { item: 'Separator' },
            { item: 'Cut' },
            { item: 'Copy' },
            { item: 'Paste' },
            { item: 'SelectAll' },
          ],
        } satisfies SubmenuOptions,
        {
          id: 'settings',
          text: '设置',
          items: this.buildSettingsItems(),
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

    // Current pet info
    if (this.currentPetId) {
      items.push({
        id: `current:${this.currentPetId}`,
        text: `当前宠物：${this.currentPetLabel()}`,
        enabled: false,
      });
    }
    items.push({ item: 'Separator' });

    // State actions
    for (const item of STATE_ITEMS) {
      items.push({
        id: `state:${item.action}`,
        text: item.label,
        action: () => this.emit({ type: 'state', state: item.action }),
      });
    }

    items.push({ item: 'Separator' });

    // Switch pet submenu
    if (this.pets.length === 0) {
      items.push({ id: 'pet:none', text: '无可用宠物', enabled: false });
    } else {
      for (const pet of this.pets) {
        if (pet.id === this.currentPetId) {
          items.push({
            id: `pet:${pet.id}`,
            text: `● ${pet.label}`,
            enabled: false,
          });
        } else {
          items.push({
            id: `pet:${pet.id}`,
            text: pet.label,
            enabled: true,
            action: () => this.emit({ type: 'pet', petId: pet.id }),
          });
        }
      }
    }

    return items;
  }

  private buildSettingsItems(): Array<MenuItemOptions | PredefinedMenuItemOptions> {
    const items: Array<MenuItemOptions | PredefinedMenuItemOptions> = [
      {
        id: 'ai-settings',
        text: 'AI 设置...',
        enabled: true,
        action: () => this.emit({ type: 'openSettings', tab: 'ai' }),
      },
      {
        id: 'persona-settings',
        text: '宠物人设...',
        enabled: true,
        action: () => this.emit({ type: 'openSettings', tab: 'persona' }),
      },
      { item: 'Separator' },
      {
        id: 'add-pet',
        text: '添加宠物...',
        enabled: true,
        action: () => this.emit({ type: 'addPet' }),
      },
      { item: 'Separator' },
      {
        id: 'hooks-settings',
        text: 'CC Hooks...',
        enabled: true,
        action: () => this.emit({ type: 'openSettings', tab: 'hooks' }),
      },
    ];

    // Remove current pet
    const currentPet = this.pets.find((p) => p.id === this.currentPetId);
    if (currentPet && currentPet.removable) {
      items.push({ item: 'Separator' });
      items.push({
        id: 'remove-pet',
        text: `移除 "${currentPet.label}"...`,
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
