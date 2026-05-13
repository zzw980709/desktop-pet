import type { CharacterManifest, LoadedCharacter } from '../types';

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private offscreen: HTMLCanvasElement;
  private offCtx: CanvasRenderingContext2D;
  private character: LoadedCharacter | null = null;

  readonly scale: number;
  readonly frameWidth: number;
  readonly frameHeight: number;

  constructor(private canvas: HTMLCanvasElement, manifest: CharacterManifest) {
    this.ctx = canvas.getContext('2d')!;
    this.scale = manifest.scale;
    this.frameWidth = manifest.frameWidth;
    this.frameHeight = manifest.frameHeight;

    canvas.width = manifest.frameWidth * manifest.scale;
    canvas.height = manifest.frameHeight * manifest.scale;

    this.offscreen = document.createElement('canvas');
    this.offscreen.width = manifest.frameWidth;
    this.offscreen.height = manifest.frameHeight;
    this.offCtx = this.offscreen.getContext('2d')!;
    this.offCtx.imageSmoothingEnabled = false;
    this.ctx.imageSmoothingEnabled = false;
  }

  setCharacter(char: LoadedCharacter): void {
    this.character = char;
  }

  drawFrame(frameIndex: number): void {
    // Clear display canvas
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    if (!this.character) return;

    // Clear offscreen
    this.offCtx.clearRect(0, 0, this.offscreen.width, this.offscreen.height);

    // Draw frame from spritesheet to offscreen
    const sx = frameIndex * this.frameWidth;
    this.offCtx.drawImage(
      this.character.spritesheet,
      sx, 0, this.frameWidth, this.frameHeight,
      0, 0, this.frameWidth, this.frameHeight,
    );

    // Scale offscreen onto display canvas
    this.ctx.drawImage(
      this.offscreen,
      0, 0, this.frameWidth, this.frameHeight,
      0, 0, this.canvas.width, this.canvas.height,
    );
  }

  // Pixel heart pattern (7×6), drawn above pet head when clicked
  private static readonly HEART: [number, number][] = [
    [1,0],[2,0],[4,0],[5,0],
    [0,1],[1,1],[2,1],[3,1],[4,1],[5,1],[6,1],
    [0,2],[1,2],[2,2],[3,2],[4,2],[5,2],[6,2],
    [1,3],[2,3],[3,3],[4,3],[5,3],
    [2,4],[3,4],[4,4],
    [3,5],
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

  drawBubble(bubbleText: string): void {
    const fontSize = 8;
    const padding = 4;
    const charWidth = 5;
    const textWidth = bubbleText.length * charWidth;

    const fontCanvas = document.createElement('canvas');
    fontCanvas.width = this.canvas.width;
    fontCanvas.height = 24;

    const fctx = fontCanvas.getContext('2d')!;
    fctx.clearRect(0, 0, fontCanvas.width, fontCanvas.height);

    // Draw bubble background
    const bx = Math.max(0, (this.canvas.width - textWidth - padding * 2) / 2);
    fctx.fillStyle = 'rgba(0,0,0,0.7)';
    fctx.fillRect(bx, 0, textWidth + padding * 2, fontSize + padding * 2);

    // Draw pixel text
    fctx.fillStyle = '#ffffff';
    fctx.font = 'bold 8px monospace';
    fctx.textBaseline = 'top';
    fctx.fillText(bubbleText, bx + padding, padding);

    this.ctx.drawImage(fontCanvas, 0, 0);
  }
}
