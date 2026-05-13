import { getCurrentWindow } from '@tauri-apps/api/window';
import { PhysicalPosition } from '@tauri-apps/api/dpi';
import type { BehaviorEngine } from './engine/behavior';

export class Interactions {
  private isDragging = false;
  private startX = 0;
  private startY = 0;
  private offsetX = 0;
  private offsetY = 0;
  private dragMoved = false;
  private readonly dragThreshold = 5;

  constructor(
    private canvas: HTMLCanvasElement,
    private behavior: BehaviorEngine,
  ) {
    this.canvas.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('mouseup', this.onMouseUp);
    this.canvas.addEventListener('contextmenu', this.onContextMenu);
  }

  private onMouseDown = (e: MouseEvent): void => {
    this.isDragging = true;
    this.startX = e.screenX;
    this.startY = e.screenY;
    const dpr = window.devicePixelRatio || 1;
    this.offsetX = Math.round(e.offsetX * dpr);
    this.offsetY = Math.round(e.offsetY * dpr);
    this.dragMoved = false;
  };

  private onMouseMove = async (e: MouseEvent): Promise<void> => {
    if (!this.isDragging) return;
    const dx = Math.abs(e.screenX - this.startX);
    const dy = Math.abs(e.screenY - this.startY);

    if (!this.dragMoved && (dx > this.dragThreshold || dy > this.dragThreshold)) {
      this.dragMoved = true;
      this.behavior.handleDragStart();
    }

    if (this.dragMoved) {
      try {
        await getCurrentWindow().setPosition(
          new PhysicalPosition(e.screenX - this.offsetX, e.screenY - this.offsetY),
        );
      } catch (err) {
        console.warn('[interactions] window move failed:', err);
      }
    }
  };

  private onMouseUp = (): void => {
    if (!this.isDragging) return;
    this.isDragging = false;

    if (this.dragMoved) {
      this.behavior.handleDragEnd();
    } else {
      this.behavior.handleClick();
    }
  };

  private onContextMenu = (e: MouseEvent): void => {
    e.preventDefault();
    window.dispatchEvent(new CustomEvent('pet:contextmenu', {
      detail: { x: e.clientX, y: e.clientY },
    }));
  };
}
