import { initApp } from './app';

const canvas = document.getElementById('pet-canvas') as HTMLCanvasElement;
if (!canvas) {
  throw new Error('Canvas element #pet-canvas not found');
}

initApp(canvas);
