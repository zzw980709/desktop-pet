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
          text: 'Desktop Pet',
          items: this.buildDesktopPetItems(),
        } satisfies SubmenuOptions,
        {
          id: 'actions',
          text: 'Actions',
          items: this.buildStateItems(),
        } satisfies SubmenuOptions,
        {
          id: 'switch-pet',
          text: 'Switch Pet',
          items: this.buildPetItems(),
        } satisfies SubmenuOptions,
      ],
    } satisfies MenuOptions);

    await menu.setAsAppMenu();
  }

  private currentPetLabel(): string {
    return this.pets.find((pet) => pet.id === this.currentPetId)?.label ?? 'Unknown Pet';
  }

  private buildDesktopPetItems(): Array<MenuItemOptions | PredefinedMenuItemOptions> {
    const items: Array<MenuItemOptions | PredefinedMenuItemOptions> = [];
    if (this.currentPetId) {
      items.push({
        id: `current:${this.currentPetId}`,
        text: `Current Pet: ${this.currentPetLabel()}`,
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
          text: 'No pets available',
          enabled: false,
        },
      ];
    }

    return this.pets.map((pet): MenuItemOptions => {
      if (pet.id === this.currentPetId) {
        return {
          id: `pet:${pet.id}`,
          text: `Current Pet: ${pet.label}`,
          enabled: false,
        };
      }

      return {
        id: `pet:${pet.id}`,
        text: `Switch to ${pet.label}`,
        enabled: true,
        action: () => this.emit({ type: 'pet', petId: pet.id }),
      };
    });
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
