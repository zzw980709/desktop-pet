import { validateManifest, loadCharacter } from './engine/loader';
import { Renderer } from './engine/renderer';
import { Animator } from './engine/animator';
import { BehaviorEngine } from './engine/behavior';
import { ReminderSystem } from './engine/bubble';
import { Interactions } from './interactions';
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

  // Register random transitions from idle (weighted by condition probability)
  behavior.addTransition('idle', 'walk', () => true);
  behavior.addTransition('idle', 'sleep', () => Math.random() < 0.25);
  behavior.addTransition('idle', 'sit', () => Math.random() < 0.15);

  // Wire animator -> behavior: when non-looping animation ends, transition to idle
  animator.on(() => {
    behavior.handleAnimationEnd();
  });

  // Wire behavior -> animator: when state changes, play corresponding animation
  behavior.on((newState) => {
    animator.play(newState);
  });

  // Wire reminders -> behavior + animator: reminder triggers reaction
  reminders.on((_message, animation) => {
    animator.play(animation);
    behavior.transitionTo('react');
  });

  // Setup interactions
  new Interactions(canvas, behavior);

  // Right-click menu handler
  window.addEventListener('pet:contextmenu', (() => {
    console.log('[app] context menu triggered');
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
    if (bubble) {
      renderer.drawBubble(bubble.text);
    }

    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);
}
