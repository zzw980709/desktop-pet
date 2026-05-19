import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Interactions } from '../src/interactions';

const setPosition = vi.fn(async () => undefined);

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    setPosition,
  }),
}));

vi.mock('@tauri-apps/api/dpi', () => ({
  LogicalPosition: class LogicalPosition {
    constructor(
      public x: number,
      public y: number,
    ) {}
  },
}));

type MockBehavior = {
  handleDragStart: ReturnType<typeof vi.fn>;
  handleDragMove: ReturnType<typeof vi.fn>;
  handleDragEnd: ReturnType<typeof vi.fn>;
  handleClick: ReturnType<typeof vi.fn>;
  suspendRoaming: ReturnType<typeof vi.fn>;
  resumeRoaming: ReturnType<typeof vi.fn>;
};

function dispatchMouseEvent(
  target: EventTarget,
  type: string,
  init: MouseEventInit & { offsetX?: number; offsetY?: number } = {},
): void {
  const event = new MouseEvent(type, {
    bubbles: true,
    clientX: init.clientX ?? 0,
    clientY: init.clientY ?? 0,
    screenX: init.screenX ?? 0,
    screenY: init.screenY ?? 0,
    button: init.button ?? 0,
  });
  Object.defineProperty(event, 'offsetX', { configurable: true, value: init.offsetX ?? 0 });
  Object.defineProperty(event, 'offsetY', { configurable: true, value: init.offsetY ?? 0 });
  target.dispatchEvent(event);
}

describe('Interactions', () => {
  let canvas: HTMLCanvasElement;
  let behavior: MockBehavior;

  beforeEach(() => {
    canvas = document.createElement('canvas');
    document.body.appendChild(canvas);
    behavior = {
      handleDragStart: vi.fn(),
      handleDragMove: vi.fn(),
      handleDragEnd: vi.fn(),
      handleClick: vi.fn(),
      suspendRoaming: vi.fn(),
      resumeRoaming: vi.fn(),
    };
    new Interactions(canvas, behavior as never);
  });

  afterEach(() => {
    document.body.innerHTML = '';
    setPosition.mockClear();
  });

  it('forwards positive horizontal drag deltas to the behavior engine', async () => {
    dispatchMouseEvent(canvas, 'mousedown', { screenX: 100, screenY: 100, offsetX: 12, offsetY: 8 });
    dispatchMouseEvent(window, 'mousemove', { screenX: 120, screenY: 102 });

    await vi.waitFor(() => {
      expect(behavior.handleDragStart).toHaveBeenCalledTimes(1);
      expect(behavior.handleDragMove).toHaveBeenCalledWith(20);
    });
  });

  it('forwards negative horizontal drag deltas to the behavior engine', async () => {
    dispatchMouseEvent(canvas, 'mousedown', { screenX: 200, screenY: 100, offsetX: 5, offsetY: 6 });
    dispatchMouseEvent(window, 'mousemove', { screenX: 170, screenY: 98 });

    await vi.waitFor(() => {
      expect(behavior.handleDragStart).toHaveBeenCalledTimes(1);
      expect(behavior.handleDragMove).toHaveBeenCalledWith(-30);
    });
  });
});
