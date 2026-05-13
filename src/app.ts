import { validateManifest, loadCharacter } from './engine/loader';
import { Renderer } from './engine/renderer';
import { Animator } from './engine/animator';
import { BehaviorEngine } from './engine/behavior';
import { ReminderSystem } from './engine/bubble';
import { Interactions } from './interactions';
import { ContextMenu } from './ui/contextmenu';
import { getCatSpritesheetURL } from './characters/cat/generator';
import catManifestRaw from './characters/cat/manifest.json';

export async function initApp(canvas: HTMLCanvasElement): Promise<void> {
  const manifest = validateManifest(catManifestRaw);
  if (!manifest) {
    console.error('Failed to load cat manifest');
    return;
  }

  const spritesheetURL = getCatSpritesheetURL();
  const character = await loadCharacter(manifest, spritesheetURL);
  if (!character) {
    console.error('Failed to load cat character');
    return;
  }

  const renderer = new Renderer(canvas, manifest);
  renderer.setCharacter(character);

  const animator = new Animator(manifest);
  const behavior = new BehaviorEngine();
  const reminders = new ReminderSystem(manifest);
  const menu = new ContextMenu();

  // Register random transitions from idle
  behavior.addTransition('idle', 'walk', () => true);
  behavior.addTransition('idle', 'sleep', () => Math.random() < 0.25);
  behavior.addTransition('idle', 'sit', () => Math.random() < 0.15);

  // Heart effect state
  let heartAlpha = 0;
  const HEART_DURATION = 600;
  let heartTimer = 0;

  // Wire animator -> behavior
  animator.on(() => {
    behavior.handleAnimationEnd();
  });

  // Wire behavior -> animator
  behavior.on((newState) => {
    animator.play(newState);
    if (newState === 'react') {
      heartAlpha = 1;
      heartTimer = HEART_DURATION;
    }
  });

  // Wire reminders -> behavior + animator
  reminders.on((_message, animation) => {
    animator.play(animation);
    behavior.transitionTo('react');
  });

  // Context menu actions
  menu.on((action) => {
    switch (action) {
      case 'pet':
        behavior.forceState('react');
        break;
      case 'sleep':
        behavior.forceState('sleep');
        break;
      case 'sit':
        behavior.forceState('sit');
        break;
      case 'walk':
        behavior.forceState('walk');
        break;
      case 'feed':
        behavior.forceState('react');
        reminders.showBubble('好吃！');
        break;
    }
  });

  // Setup interactions
  new Interactions(canvas, behavior);

  // Right-click opens menu
  window.addEventListener('pet:contextmenu', (() => {
    void menu.show();
  }) as EventListener);

  // Main loop
  let lastTime = performance.now();

  function loop(currentTime: number): void {
    const deltaMs = currentTime - lastTime;
    lastTime = currentTime;

    behavior.tick(deltaMs);
    reminders.tick(deltaMs);
    animator.tick(deltaMs);

    renderer.drawFrame(animator.currentFrame);

    const bubble = reminders.getBubbleToDraw();
    if (bubble) renderer.drawBubble(bubble.text);

    if (heartAlpha > 0) {
      heartTimer -= deltaMs;
      heartAlpha = Math.max(0, heartTimer / HEART_DURATION);
      renderer.drawHeart(heartAlpha);
    }

    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);
}

