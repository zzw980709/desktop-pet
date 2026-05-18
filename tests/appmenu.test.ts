import { beforeEach, describe, expect, it, vi } from 'vitest';

const menuNew = vi.hoisted(() => vi.fn());
const setAsAppMenu = vi.hoisted(() => vi.fn().mockResolvedValue(null));

vi.mock('@tauri-apps/api/menu', () => ({
  Menu: {
    new: menuNew,
  },
}));

import { NativeAppMenu } from '../src/ui/appmenu';
import { STATE_ITEMS } from '../src/ui/menu-model';

describe('NativeAppMenu', () => {
  beforeEach(() => {
    vi.stubGlobal('__TAURI_INTERNALS__', {});
    menuNew.mockReset();
    setAsAppMenu.mockReset();
    setAsAppMenu.mockResolvedValue(null);
    menuNew.mockImplementation(async (options: unknown) => ({
      options,
      setAsAppMenu,
    }));
  });

  it('builds a Chinese native app menu', async () => {
    const menu = new NativeAppMenu();

    await menu.setPets(
      [
        { id: 'cat', label: '小猫', removable: false },
        { id: 'fox', label: '狐狸', removable: true },
      ],
      'cat',
    );

    expect(menuNew).toHaveBeenCalledTimes(1);
    const options = menuNew.mock.calls[0]?.[0] as { items: Array<{ text: string; items?: Array<{ text?: string; enabled?: boolean }> }> };
    expect(options.items.map((item) => item.text)).toEqual(['桌面宠物', '动作', '切换宠物', '管理']);
    expect(options.items[1]?.items?.map((item) => item.text)).toEqual(STATE_ITEMS.map((item) => item.label));
    expect(options.items[2]?.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ text: '当前：小猫', enabled: false }),
        expect.objectContaining({ text: '狐狸', enabled: true }),
      ]),
    );
    expect(options.items[3]?.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ text: '添加宠物...', enabled: true }),
      ]),
    );
    expect(setAsAppMenu).toHaveBeenCalledTimes(1);
  });

  it('includes remove pet menu item for removable current pet', async () => {
    const menu = new NativeAppMenu();

    await menu.setPets(
      [
        { id: 'cat', label: '小猫', removable: false },
        { id: 'fox', label: '狐狸', removable: true },
      ],
      'fox',
    );

    const options = menuNew.mock.calls[0]?.[0] as {
      items: Array<{ text: string; items?: Array<{ text?: string; id?: string }> }>;
    };
    const manageItems = options.items[3]?.items ?? [];
    expect(manageItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ text: '添加宠物...' }),
        expect.objectContaining({ text: '移除 "狐狸"' }),
      ]),
    );
  });

  it('emits addPet action from menu', async () => {
    const menu = new NativeAppMenu();
    const handler = vi.fn();
    menu.on(handler);

    await menu.setPets(
      [{ id: 'cat', label: '小猫', removable: false }],
      'cat',
    );

    const options = menuNew.mock.calls[0]?.[0] as {
      items: Array<{ items?: Array<{ id?: string; action?: () => void }> }>;
    };
    const manageItems = options.items[3]?.items ?? [];
    manageItems.find((item) => item.id === 'add-pet')?.action?.();

    expect(handler).toHaveBeenCalledWith({ type: 'addPet' });
  });
});
