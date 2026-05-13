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
