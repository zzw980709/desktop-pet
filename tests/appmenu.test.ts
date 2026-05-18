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

  it('builds a native app menu with pet actions and switch items', async () => {
    const menu = new NativeAppMenu();

    await menu.setPets(
      [
        { id: 'codex-cat', label: 'Codex Cat' },
        { id: 'orbit-fox', label: 'Orbit Fox' },
      ],
      'codex-cat',
    );

    expect(menuNew).toHaveBeenCalledTimes(1);
    const options = menuNew.mock.calls[0]?.[0] as { items: Array<{ text: string; items?: Array<{ text?: string; enabled?: boolean }> }> };
    expect(options.items.map((item) => item.text)).toEqual(['Desktop Pet', 'Actions', 'Switch Pet']);
    expect(options.items[1]?.items?.map((item) => item.text)).toEqual(STATE_ITEMS.map((item) => item.label));
    expect(options.items[2]?.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ text: 'Current Pet: Codex Cat', enabled: false }),
        expect.objectContaining({ text: 'Switch to Orbit Fox', enabled: true }),
      ]),
    );
    expect(setAsAppMenu).toHaveBeenCalledTimes(1);
  });

  it('emits shared menu actions from native menu item handlers', async () => {
    const menu = new NativeAppMenu();
    const handler = vi.fn();
    menu.on(handler);

    await menu.setPets(
      [
        { id: 'codex-cat', label: 'Codex Cat' },
        { id: 'orbit-fox', label: 'Orbit Fox' },
      ],
      'codex-cat',
    );

    const options = menuNew.mock.calls[0]?.[0] as {
      items: Array<{ items?: Array<{ id?: string; action?: () => void }> }>;
    };

    const actionsItems = options.items[1]?.items ?? [];
    const switchItems = options.items[2]?.items ?? [];
    actionsItems.find((item) => item.id === 'state:running-right')?.action?.();
    switchItems.find((item) => item.id === 'pet:orbit-fox')?.action?.();

    expect(handler.mock.calls).toEqual([
      [{ type: 'state', state: 'running-right' }],
      [{ type: 'pet', petId: 'orbit-fox' }],
    ]);
  });
});
