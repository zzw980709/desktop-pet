import { beforeEach, describe, expect, it, vi } from 'vitest';

const setSize = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    setSize,
  }),
}));

vi.mock('@tauri-apps/api/dpi', () => ({
  LogicalSize: class LogicalSize {
    constructor(
      public width: number,
      public height: number,
    ) {}
  },
}));

import { ContextMenu, STATE_ITEMS } from '../src/ui/contextmenu';

describe('ContextMenu', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="ctx-menu"></div>';
    setSize.mockReset();
    setSize.mockResolvedValue(undefined);
  });

  it('exposes Codex pet actions in order', () => {
    expect(STATE_ITEMS.map((item) => item.action)).toEqual([
      'waving',
      'review',
      'running',
      'waiting',
      'jumping',
      'running-right',
      'running-left',
      'idle',
    ]);
  });

  it('renders Chinese menu labels', () => {
    const menu = new ContextMenu();
    menu.setPets(
      [
        { id: 'cat', label: '小猫', removable: false },
        { id: 'fox', label: '狐狸', removable: true },
      ],
      'cat',
    );

    const buttons = Array.from(document.querySelectorAll('button')).map((button) =>
      button.textContent?.trim(),
    );

    expect(buttons).toContain('挥手');
    expect(buttons).toContain('思考');
    expect(buttons).toContain('工作');
    expect(buttons).toContain('等待');
    expect(buttons).toContain('跳跃');
    expect(buttons).toContain('向右移动');
    expect(buttons).toContain('向左移动');
    expect(buttons).toContain('重置');
    expect(buttons).toContain('狐狸');
    expect(buttons).toContain('当前：小猫');
    expect(buttons).toContain('添加宠物...');
  });

  it('shows remove button only for removable current pet', () => {
    const menu = new ContextMenu();
    menu.setPets(
      [
        { id: 'cat', label: '小猫', removable: false },
        { id: 'fox', label: '狐狸', removable: true },
      ],
      'fox',
    );

    const buttons = Array.from(document.querySelectorAll('button')).map((button) =>
      button.textContent?.trim(),
    );

    expect(buttons).toContain('移除 "狐狸"');
  });

  it('does not show remove button for built-in pet', () => {
    const menu = new ContextMenu();
    menu.setPets(
      [
        { id: 'cat', label: '小猫', removable: false },
      ],
      'cat',
    );

    const buttons = Array.from(document.querySelectorAll('button')).map((button) =>
      button.textContent?.trim(),
    );

    expect(buttons.filter((b) => b?.startsWith('移除'))).toHaveLength(0);
  });

  it('emits addPet action when add button clicked', async () => {
    const menu = new ContextMenu();
    const handler = vi.fn();
    menu.on(handler);

    const addBtn = Array.from(document.querySelectorAll('button')).find(
      (btn) => btn.textContent?.trim() === '添加宠物...',
    );
    addBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    await vi.waitFor(() => {
      expect(handler).toHaveBeenCalledWith({ type: 'addPet' });
    });
  });

  it('emits removePet action when remove button clicked', async () => {
    const menu = new ContextMenu();
    const handler = vi.fn();
    menu.on(handler);

    menu.setPets(
      [
        { id: 'cat', label: '小猫', removable: false },
        { id: 'fox', label: '狐狸', removable: true },
      ],
      'fox',
    );

    const removeBtn = Array.from(document.querySelectorAll('button')).find(
      (btn) => btn.textContent?.trim() === '移除 "狐狸"',
    );
    removeBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    await vi.waitFor(() => {
      expect(handler).toHaveBeenCalledWith({ type: 'removePet', petId: 'fox' });
    });
  });
});
