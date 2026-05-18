import { CELL_HEIGHT, CELL_WIDTH, getFrameRect } from '../pets/contract';
import type { LoadedPet } from '../types';

export type FrameCell = { row: number; column: number };

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private offscreen: HTMLCanvasElement;
  private offCtx: CanvasRenderingContext2D;
  private pet: LoadedPet | null = null;

  readonly scale: number;
  readonly frameWidth: number;
  readonly frameHeight: number;

  constructor(private canvas: HTMLCanvasElement, scaleOrManifest: number | { scale: number }) {
    this.ctx = canvas.getContext('2d')!;
    this.scale = typeof scaleOrManifest === 'number' ? scaleOrManifest : scaleOrManifest.scale;
    this.frameWidth = CELL_WIDTH;
    this.frameHeight = CELL_HEIGHT;

    canvas.width = this.frameWidth * this.scale;
    canvas.height = this.frameHeight * this.scale;

    this.offscreen = document.createElement('canvas');
    this.offscreen.width = this.frameWidth;
    this.offscreen.height = this.frameHeight;
    this.offCtx = this.offscreen.getContext('2d')!;
    this.offCtx.imageSmoothingEnabled = false;
    this.ctx.imageSmoothingEnabled = false;
  }

  setCharacter(pet: LoadedPet): void {
    this.pet = pet;
  }

  drawFrame(cell: FrameCell): void {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    if (!this.pet) return;

    const { sx, sy, sw, sh } = getFrameRect(cell.row, cell.column);

    this.offCtx.clearRect(0, 0, this.offscreen.width, this.offscreen.height);
    this.offCtx.drawImage(this.pet.spritesheet, sx, sy, sw, sh, 0, 0, sw, sh);
    this.ctx.drawImage(this.offscreen, 0, 0, this.frameWidth, this.frameHeight, 0, 0, this.canvas.width, this.canvas.height);
  }

  private static readonly HEART: [number, number][] = [
    [1, 0], [2, 0], [4, 0], [5, 0],
    [0, 1], [1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1],
    [0, 2], [1, 2], [2, 2], [3, 2], [4, 2], [5, 2], [6, 2],
    [1, 3], [2, 3], [3, 3], [4, 3], [5, 3],
    [2, 4], [3, 4], [4, 4],
    [3, 5],
  ];

  drawHeart(alpha: number): void {
    if (alpha <= 0) return;
    const s = this.scale;
    const cx = Math.floor(this.canvas.width / 2) - 3 * s;
    const cy = 2;
    this.ctx.save();
    this.ctx.globalAlpha = alpha;
    this.ctx.fillStyle = '#ff6699';
    for (const [px, py] of Renderer.HEART) {
      this.ctx.fillRect(cx + px * s, cy + py * s, s, s);
    }
    this.ctx.restore();
  }
}
