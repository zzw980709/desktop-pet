import { getCurrentWindow } from '@tauri-apps/api/window';
import { LogicalPosition } from '@tauri-apps/api/dpi';
import type { BehaviorEngine } from './engine/behavior';

export class Interactions {
  private isDragging = false;
  private startX = 0;
  private startY = 0;
  private offsetX = 0;
  private offsetY = 0;
  private accDeltaX = 0;
  private prevScreenX = 0;

  private dragMoved = false;
  private readonly dragThreshold = 5;
  private readonly directionThreshold = 8;

  constructor(
    private canvas: HTMLCanvasElement,
    private behavior: BehaviorEngine,
  ) {
    this.canvas.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('mouseup', this.onMouseUp);
  }

  private onMouseDown = (e: MouseEvent): void => {
    this.isDragging = true;
    this.startX = e.screenX;
    this.startY = e.screenY;
    this.offsetX = e.offsetX;
    this.offsetY = e.offsetY;
    this.prevScreenX = e.screenX;
    this.accDeltaX = 0;
    this.dragMoved = false;
  };

  private onMouseMove = async (e: MouseEvent): Promise<void> => {
    if (!this.isDragging) return;
    const totalDeltaX = e.screenX - this.startX;
    const totalDeltaY = e.screenY - this.startY;

    if (!this.dragMoved && (Math.abs(totalDeltaX) > this.dragThreshold || Math.abs(totalDeltaY) > this.dragThreshold)) {
      this.dragMoved = true;
      this.behavior.suspendRoaming();
      this.behavior.handleDragStart();
    }

    if (this.dragMoved) {
      this.accDeltaX += e.screenX - this.prevScreenX;
      this.prevScreenX = e.screenX;

      if (Math.abs(this.accDeltaX) >= this.directionThreshold) {
        this.behavior.handleDragMove(this.accDeltaX);
        this.accDeltaX = 0;
      }

      try {
        await getCurrentWindow().setPosition(
          new LogicalPosition(e.screenX - this.offsetX, e.screenY - this.offsetY),
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
      this.behavior.resumeRoaming();
    } else {
      this.behavior.handleClick();
    }
  };
}
