import { CELL_HEIGHT, CELL_WIDTH, getFrameRect } from '../pets/contract';
import type { LoadedPet } from '../types';

export type FrameCell = { row: number; column: number };

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private offscreen: HTMLCanvasElement;
  private offCtx: CanvasRenderingContext2D;
  private pet: LoadedPet | null = null;
  private lastErrorTime = 0;

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

    try {
      const { sx, sy, sw, sh } = getFrameRect(cell.row, cell.column);

      this.offCtx.clearRect(0, 0, this.offscreen.width, this.offscreen.height);
      this.offCtx.drawImage(this.pet.spritesheet, sx, sy, sw, sh, 0, 0, sw, sh);
      this.ctx.drawImage(this.offscreen, 0, 0, this.frameWidth, this.frameHeight, 0, 0, this.canvas.width, this.canvas.height);
    } catch (err) {
      // Rate-limit frame errors to 1 per second
      const now = performance.now();
      if (now - this.lastErrorTime > 1000) {
        console.error('[renderer] drawFrame error:', err);
        this.lastErrorTime = now;
      }
    }
  }

  private static readonly HEART: [number, number][] = [
    [1, 0], [2, 0], [4, 0], [5, 0],
    [0, 1], [1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1],
    [0, 2], [1, 2], [2, 2], [3, 2], [4, 2], [5, 2], [6, 2],
    [1, 3], [2, 3], [3, 3], [4, 3], [5, 3],
    [2, 4], [3, 4], [4, 4],
    [3, 5],
  ];

  drawBubble(options: {
    text: string;
    emoji: string;
    bgColor: string;
    borderColor: string;
    scale: number;
    alpha: number;
  }): void {
    const { text, emoji, bgColor, borderColor, scale, alpha } = options;
    if (alpha <= 0 || !text) return;
    const s = Math.max(1, this.scale);
    const ctx = this.ctx;

    ctx.save();
    ctx.globalAlpha = alpha;

    const fontSize = Math.round(10 * s);
    ctx.font = `bold ${fontSize}px monospace`;
    const fullText = `${emoji} ${text}`;
    const textW = ctx.measureText(fullText).width;
    const padX = 8 * s;
    const padY = 5 * s;
    const bubbleW = textW + padX * 2;
    const bubbleH = fontSize + padY * 2;
    const tailH = 5 * s;
    // origin for scale transform: tail point (bottom-center of bubble)
    const originX = this.canvas.width / 2;
    const originY = 2 * s + bubbleH + tailH;

    // Scale transform from tail point
    if (scale !== 1) {
      ctx.translate(originX, originY);
      ctx.scale(scale, scale);
      ctx.translate(-originX, -originY);
    }

    const bubbleX = (this.canvas.width - bubbleW) / 2;
    const bubbleY = 2 * s;
    const radius = 4 * s;

    // Shadow
    ctx.shadowColor = 'rgba(0,0,0,0.15)';
    ctx.shadowBlur = 3 * s;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 1 * s;

    // Background
    ctx.fillStyle = bgColor;
    ctx.beginPath();
    ctx.moveTo(bubbleX + radius, bubbleY);
    ctx.lineTo(bubbleX + bubbleW - radius, bubbleY);
    ctx.quadraticCurveTo(bubbleX + bubbleW, bubbleY, bubbleX + bubbleW, bubbleY + radius);
    ctx.lineTo(bubbleX + bubbleW, bubbleY + bubbleH - radius);
    ctx.quadraticCurveTo(bubbleX + bubbleW, bubbleY + bubbleH, bubbleX + bubbleW - radius, bubbleY + bubbleH);
    ctx.lineTo(bubbleX + radius, bubbleY + bubbleH);
    ctx.quadraticCurveTo(bubbleX, bubbleY + bubbleH, bubbleX, bubbleY + bubbleH - radius);
    ctx.lineTo(bubbleX, bubbleY + radius);
    ctx.quadraticCurveTo(bubbleX, bubbleY, bubbleX + radius, bubbleY);
    ctx.closePath();
    ctx.fill();

    // Border
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = Math.max(1, 1.5 * s);
    ctx.stroke();

    // Tail
    ctx.fillStyle = bgColor;
    ctx.beginPath();
    const tailX = bubbleX + bubbleW / 2;
    const tailY = bubbleY + bubbleH;
    ctx.moveTo(tailX - 4 * s, tailY);
    ctx.lineTo(tailX, tailY + tailH);
    ctx.lineTo(tailX + 4 * s, tailY);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = borderColor;
    ctx.stroke();

    // Hide border where tail meets bubble
    ctx.strokeStyle = bgColor;
    ctx.beginPath();
    ctx.moveTo(tailX - 4 * s + 1, tailY);
    ctx.lineTo(tailX + 4 * s - 1, tailY);
    ctx.stroke();

    // Text
    ctx.fillStyle = '#333333';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(fullText, bubbleX + bubbleW / 2, bubbleY + bubbleH / 2);

    ctx.restore();
  }

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
