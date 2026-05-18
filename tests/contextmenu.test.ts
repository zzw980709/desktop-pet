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

function createDeferred(): {
  promise: Promise<void>;
  resolve: () => void;
} {
  let resolve = () => {};
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function measureTextLikeMenu(text: string): number {
  return Array.from(text).reduce((total, char) => {
    if (/\s/u.test(char)) {
      return total + 4;
    }

    const codePoint = char.codePointAt(0) ?? 0;
    if (codePoint > 0xffff) {
      return total + 14;
    }

    if (/[\u1100-\u115f\u2329\u232a\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe10-\ufe19\ufe30-\ufe6f\uff00-\uff60\uffe0-\uffe6]/u.test(char)) {
      return total + 12;
    }

    if (codePoint <= 0x00ff) {
      return total + 7;
    }

    return total + 8;
  }, 0);
}

function mockCanvasTextMeasurement() {
  return vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((contextId: string) => {
    if (contextId !== '2d') {
      return null;
    }

    return {
      font: '',
      measureText: (text: string) => ({ width: measureTextLikeMenu(text) }),
    } as unknown as CanvasRenderingContext2D;
  });
}

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

  it('renders pet switching entries without legacy labels', () => {
    const menu = new ContextMenu();

    menu.setPets(
      [
        { id: 'codex-cat', label: 'Codex Cat' },
        { id: 'orbit-fox', label: 'Orbit Fox' },
      ],
      'codex-cat',
    );

    const buttons = Array.from(document.querySelectorAll('button')).map((button) =>
      button.textContent?.trim(),
    );

    expect(buttons).toContain('Current Pet: Codex Cat');
    expect(buttons).toContain('Switch to Orbit Fox');
    expect(buttons).toContain('Wave');
    expect(buttons).toContain('Think');
    expect(buttons).toContain('Work');
    expect(buttons).toContain('Wait');
    expect(buttons).toContain('Jump');
    expect(buttons).toContain('Move Right');
    expect(buttons).toContain('Move Left');
    expect(buttons).toContain('Reset to Idle');
    expect(buttons).not.toContain('讲话');
    expect(buttons).not.toContain('睡觉');
    expect(buttons).not.toContain('进食');
  });

  it('emits the selected state action payloads for every Codex state button', async () => {
    const menu = new ContextMenu();
    const handler = vi.fn();
    menu.on(handler);

    for (const item of STATE_ITEMS) {
      const button = Array.from(document.querySelectorAll('button')).find(
        (candidate) => candidate.textContent?.trim() === item.label,
      );
      expect(button).toBeTruthy();
      button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }

    await vi.waitFor(() => {
      expect(handler.mock.calls).toEqual(
        STATE_ITEMS.map((item) => [{ type: 'state', state: item.action }]),
      );
    });
  });

  it('disables the current pet entry and emits only switch actions for other pets', async () => {
    const menu = new ContextMenu();
    const handler = vi.fn();
    menu.on(handler);
    menu.setPets(
      [
        { id: 'codex-cat', label: 'Codex Cat' },
        { id: 'orbit-fox', label: 'Orbit Fox' },
      ],
      'codex-cat',
    );

    const buttons = Array.from(document.querySelectorAll('button'));
    const currentButton = buttons.find((button) => button.textContent?.trim() === 'Current Pet: Codex Cat');
    const otherButton = buttons.find((button) => button.textContent?.trim() === 'Switch to Orbit Fox');

    expect(currentButton).toBeTruthy();
    expect((currentButton as HTMLButtonElement).disabled).toBe(true);
    expect(otherButton).toBeTruthy();
    expect((otherButton as HTMLButtonElement).disabled).toBe(false);

    currentButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();
    expect(handler).not.toHaveBeenCalled();

    otherButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await vi.waitFor(() => {
      expect(handler).toHaveBeenCalledWith({ type: 'pet', petId: 'orbit-fox' });
    });
  });

  it('sizes the menu wide enough for longer Codex pet labels', async () => {
    const getContextSpy = mockCanvasTextMeasurement();
    const menu = new ContextMenu();
    menu.setPetSize(64, 64);
    menu.setPets(
      [
        { id: 'codex-cat', label: 'Codex Cat' },
        { id: 'codex-assistant-cat', label: 'Codex Assistant Cat' },
      ],
      'codex-cat',
    );
    setSize.mockClear();

    try {
      await menu.show();

      const expectedMenuWidth = Math.max(
        ...[
          ...STATE_ITEMS.map((item) => item.label),
          'Current Pet: Codex Cat',
          'Switch to Codex Assistant Cat',
        ].map(measureTextLikeMenu),
      ) + 24;

      expect(setSize).toHaveBeenCalledTimes(1);
      expect(setSize.mock.calls[0]?.[0]).toMatchObject({
        width: 64 + 4 + expectedMenuWidth,
      });
    } finally {
      getContextSpy.mockRestore();
    }
  });

  it('keeps DOM visibility hidden when show and hide overlap', async () => {
    const showResize = createDeferred();
    const hideResize = createDeferred();
    setSize
      .mockImplementationOnce(() => showResize.promise)
      .mockImplementationOnce(() => hideResize.promise);

    const menu = new ContextMenu();
    const menuEl = document.getElementById('ctx-menu');
    const showPromise = menu.show();
    const hidePromise = menu.hide();

    showResize.resolve();
    await showPromise;

    expect(menu.isOpen).toBe(false);
    expect(menuEl?.style.display).toBe('none');

    hideResize.resolve();
    await hidePromise;
  });

  it('recovers the visibility queue after a resize failure so later show and hide calls still work', async () => {
    const menu = new ContextMenu();
    const menuEl = document.getElementById('ctx-menu');
    setSize
      .mockRejectedValueOnce(new Error('resize failed'))
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);

    await expect(menu.show()).rejects.toThrow('resize failed');
    expect(menu.isOpen).toBe(false);
    expect(menuEl?.style.display).toBe('none');

    await expect(menu.show()).resolves.toBeUndefined();
    expect(menu.isOpen).toBe(true);
    expect(menuEl?.style.display).toBe('flex');

    await expect(menu.hide()).resolves.toBeUndefined();
    expect(menu.isOpen).toBe(false);
    expect(menuEl?.style.display).toBe('none');
  });

  it('resizes the open window when pet entries change the menu width', async () => {
    const getContextSpy = mockCanvasTextMeasurement();
    const menu = new ContextMenu();
    menu.setPetSize(64, 64);
    menu.setPets(
      [
        { id: 'codex-cat', label: 'Codex Cat' },
        { id: 'fox', label: 'Fox' },
      ],
      'codex-cat',
    );
    setSize.mockClear();

    try {
      await menu.show();

      menu.setPets(
        [
          { id: 'codex-cat', label: 'Codex Cat' },
          { id: 'codex-assistant-supreme-cat', label: 'Codex Assistant Supreme Cat' },
        ],
        'codex-cat',
      );

      await vi.waitFor(() => {
        expect(setSize).toHaveBeenCalledTimes(2);
      });

      const expectedMenuWidth = Math.max(
        ...[
          ...STATE_ITEMS.map((item) => item.label),
          'Current Pet: Codex Cat',
          'Switch to Codex Assistant Supreme Cat',
        ].map(measureTextLikeMenu),
      ) + 24;

      expect(setSize.mock.calls.at(-1)?.[0]).toMatchObject({
        width: 64 + 4 + expectedMenuWidth,
      });
    } finally {
      getContextSpy.mockRestore();
    }
  });

  it('sizes the menu for non-ASCII pet labels more robustly than raw string length', async () => {
    const getContextSpy = mockCanvasTextMeasurement();
    const menu = new ContextMenu();
    menu.setPetSize(64, 64);
    menu.setPets(
      [
        { id: 'codex-cat', label: 'Cat' },
        { id: 'moon-cat', label: '猫猫猫猫' },
      ],
      'codex-cat',
    );
    setSize.mockClear();

    try {
      await menu.show();

      const expectedMenuWidth = Math.max(
        ...[
          ...STATE_ITEMS.map((item) => item.label),
          'Current Pet: Cat',
          'Switch to 猫猫猫猫',
        ].map(measureTextLikeMenu),
      ) + 24;

      expect(setSize).toHaveBeenCalledTimes(1);
      expect(setSize.mock.calls[0]?.[0]).toMatchObject({
        width: 64 + 4 + expectedMenuWidth,
      });
    } finally {
      getContextSpy.mockRestore();
    }
  });

  it('resizes the window immediately when pet size changes while the menu is closed', async () => {
    const menu = new ContextMenu();

    menu.setPetSize(96, 128);
    await vi.waitFor(() => {
      expect(setSize).toHaveBeenCalledTimes(1);
    });

    expect(setSize.mock.calls[0]?.[0]).toMatchObject({
      width: 96,
      height: 128,
    });
  });

  it('serializes a closed-menu pet resize before a later show resize', async () => {
    const closedResize = createDeferred();
    const openResize = createDeferred();
    let openResizeStarted = false;
    setSize
      .mockImplementationOnce(() => closedResize.promise)
      .mockImplementationOnce(() => {
        openResizeStarted = true;
        return openResize.promise;
      });

    const menu = new ContextMenu();
    const menuEl = document.getElementById('ctx-menu');

    menu.setPetSize(96, 128);
    await vi.waitFor(() => {
      expect(setSize).toHaveBeenCalledTimes(1);
    });

    const showPromise = menu.show();
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    expect(openResizeStarted).toBe(false);
    expect(menu.isOpen).toBe(false);
    expect(menuEl?.style.display).toBe('none');

    closedResize.resolve();
    await vi.waitFor(() => {
      expect(setSize).toHaveBeenCalledTimes(2);
    });

    openResize.resolve();
    await showPromise;

    expect(menu.isOpen).toBe(true);
    expect(menuEl?.style.display).toBe('flex');
  });
});
