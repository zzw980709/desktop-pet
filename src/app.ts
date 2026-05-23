import { invoke } from '@tauri-apps/api/core';
import { emit, listen } from '@tauri-apps/api/event';
import { getCurrentWindow, currentMonitor } from '@tauri-apps/api/window';
import { LogicalPosition } from '@tauri-apps/api/dpi';
import { loadPet } from './engine/loader';
import { Renderer } from './engine/renderer';
import { Animator } from './engine/animator';
import { BehaviorEngine } from './engine/behavior';
import { Interactions } from './interactions';
import { NativeAppMenu } from './ui/appmenu';
import type { MenuAction } from './ui/menu-model';
import { CELL_HEIGHT, CELL_WIDTH } from './pets/contract';
import { discoverPets } from './pets/catalog';
import type { PetCatalogEntry, PetState, Preferences } from './types';
import { setConfig, getConfig, isConfigValid } from './ai/chat';

const DRAG_ANIMATED_STATES = new Set(['running-right', 'running-left']);
const EDGE_DETECT_MARGIN = 40;

function getRenderScale(canvas: HTMLCanvasElement): number {
  const widthScale = (canvas.clientWidth || 64) / CELL_WIDTH;
  const heightScale = (canvas.clientHeight || 64) / CELL_HEIGHT;
  return Math.min(widthScale, heightScale) || 1;
}

function getWindowSize(canvas: HTMLCanvasElement) {
  // Canvas fills the window; use CSS pixel dimensions for screen-bounds clamping
  return {
    w: canvas.clientWidth || 64,
    h: canvas.clientHeight || 64,
  };
}

async function clampToMonitor(x: number, y: number, canvas: HTMLCanvasElement): Promise<{ x: number; y: number }> {
  try {
    const monitor = await currentMonitor().catch(() => null);
    if (monitor) {
      const { w, h } = getWindowSize(canvas);
      const scale = monitor.scaleFactor;
      const maxX = Math.max(0, (monitor.size.width / scale) - w);
      const maxY = Math.max(0, (monitor.size.height / scale) - h);
      return {
        x: Math.max(0, Math.min(x, maxX)),
        y: Math.max(0, Math.min(y, maxY)),
      };
    }
  } catch {
    // fall through to fallback
  }
  // Fallback: always keep position on-screen
  return { x: Math.max(0, x), y: Math.max(0, y) };
}

interface RemovePetResult {
  success: boolean;
  error?: string;
}

export async function initApp(canvas: HTMLCanvasElement): Promise<void> {
  const prefs = await invoke<Preferences>('load_preferences');
  if (prefs.aiConfig) setConfig(prefs.aiConfig);

  if (prefs.windowPosition) {
    const clamped = await clampToMonitor(
      prefs.windowPosition.x,
      prefs.windowPosition.y,
      canvas,
    );
    if (clamped.x !== prefs.windowPosition.x || clamped.y !== prefs.windowPosition.y) {
      console.warn(`[app] clamped off-screen position from (${prefs.windowPosition.x},${prefs.windowPosition.y}) to (${clamped.x},${clamped.y})`);
    }
    await getCurrentWindow().setPosition(
      new LogicalPosition(clamped.x, clamped.y),
    ).catch(() => {});
  }

  let pets = await discoverPets();
  if (pets.length === 0) {
    console.error('No pets available');
    return;
  }

  const preferredPet = pets.find((p) => p.id === prefs.activePetId) ?? pets[0];
  if (!preferredPet) {
    return;
  }

  const behavior = new BehaviorEngine();
  let animator = new Animator();
  const nativeMenu = new NativeAppMenu();
  const renderScale = getRenderScale(canvas);
  let renderer = new Renderer(canvas, renderScale);
  let activePet = preferredPet;
  let petLoadVersion = 0;

  async function savePrefs(): Promise<void> {
    try {
      const pos = await getCurrentWindow().outerPosition();
      const clamped = await clampToMonitor(pos.x, pos.y, canvas);
      const currentAiConfig = getConfig();
      await invoke('save_preferences', {
        preferences: {
          activePetId: activePet.id,
          windowPosition: { x: clamped.x, y: clamped.y },
          aiConfig: currentAiConfig ?? undefined,
        },
      });
    } catch (err) {
      console.warn('[app] failed to save preferences:', err);
    }
  }

  function syncMenuPets(entries: PetCatalogEntry[], currentPetId: string): void {
    const menuPets = entries.map((pet) => ({
      id: pet.id,
      label: pet.manifest.displayName,
      removable: pet.removable,
    }));
    void nativeMenu.setPets(menuPets, currentPetId).catch((error: unknown) => {
      console.error('[app] failed to sync native app menu', error);
    });
  }

  async function switchPet(entry: PetCatalogEntry, availablePets: PetCatalogEntry[] = pets): Promise<boolean> {
    const loadVersion = ++petLoadVersion;
    const loadedPet = await loadPet(entry.manifest, entry.spritesheetUrl);
    if (!loadedPet) {
      console.warn(`[app] failed to load pet ${entry.id}`);
      return false;
    }
    if (loadVersion !== petLoadVersion) {
      return false;
    }

    activePet = entry;
    pets = availablePets;
    renderer = new Renderer(canvas, renderScale);
    renderer.setCharacter(loadedPet);
    animator = new Animator(loadedPet.atlasFormat);
    syncMenuPets(pets, activePet.id);
    animator.play(behavior.currentState);

    void savePrefs();
    return true;
  }

  async function refreshPets(): Promise<void> {
    const discovered = await discoverPets();
    if (discovered.length === 0) return;

    const currentPet = discovered.find((pet) => pet.id === activePet.id);
    if (!currentPet) {
      pets = discovered;
      const fallbackPet = discovered[0];
      if (fallbackPet) {
        await switchPet(fallbackPet, discovered);
        return;
      }
      syncMenuPets(pets, activePet.id);
      return;
    }

    pets = discovered;
    syncMenuPets(pets, activePet.id);
  }

  function openPetImportWindow(): void {
    void invoke('open_pet_import_window');
  }

  animator.on(() => {
    behavior.handleAnimationEnd();
  });

  let switched = await switchPet(preferredPet);
  if (!switched) {
    // Try fallback: iterate through available pets
    const fallback = pets.find((p) => p.id !== preferredPet.id);
    if (fallback) {
      console.warn(`[app] initial pet ${preferredPet.id} failed, falling back to ${fallback.id}`);
      switched = await switchPet(fallback);
    }
    if (!switched) {
      console.error(`[app] failed to load any pet`);
      return;
    }
  }

  // Initialize roaming with screen bounds
  let screenW = 1920;
  let screenH = 1080;
  let cachedRoamX = 0;
  let cachedRoamY = 0;
  const initPos = await getCurrentWindow().outerPosition().catch(() => null);
  if (initPos) {
    cachedRoamX = initPos.x;
    cachedRoamY = initPos.y;
  }
  const mon = await currentMonitor().catch(() => null);
  if (mon) {
    const scale = mon.scaleFactor;
    screenW = mon.size.width / scale;
    screenH = mon.size.height / scale;
  }
  // Roaming disabled — pet stays where placed
  // behavior.setScreenBounds(screenW, screenH);
  // behavior.setCurrentPosition(cachedRoamX, cachedRoamY);
  // behavior.startRoaming();

  let heartAlpha = 0;
  const HEART_DURATION = 600;
  let heartTimer = 0;

  interface CcEventConfig {
    state: PetState;
    bubbleText: string;
    emoji: string;
    bgColor: string;
    borderColor: string;
    persistent: boolean;
  }

  const ccEventConfig: Record<string, CcEventConfig> = {
    'thinking': {
      state: 'review',
      bubbleText: 'Thinking...',
      emoji: '💭',
      bgColor: '#e3f2fd',
      borderColor: '#90caf9',
      persistent: true,
    },
    'tool-bash': {
      state: 'running',
      bubbleText: 'Running command...',
      emoji: '⚡',
      bgColor: '#e1f5fe',
      borderColor: '#4fc3f7',
      persistent: true,
    },
    'tool-edit': {
      state: 'review',
      bubbleText: 'Editing code...',
      emoji: '✏️',
      bgColor: '#e8f5e9',
      borderColor: '#81c784',
      persistent: true,
    },
    'tool-write': {
      state: 'running',
      bubbleText: 'Writing file...',
      emoji: '💾',
      bgColor: '#e8f5e9',
      borderColor: '#66bb6a',
      persistent: true,
    },
    'tool-web': {
      state: 'review',
      bubbleText: 'Browsing...',
      emoji: '🌐',
      bgColor: '#f3e5f5',
      borderColor: '#ce93d8',
      persistent: true,
    },
    'tool-calling': {
      state: 'running',
      bubbleText: 'Using tools...',
      emoji: '🔧',
      bgColor: '#f5f5f5',
      borderColor: '#bdbdbd',
      persistent: true,
    },
    'waiting': {
      state: 'waiting',
      bubbleText: 'Waiting...',
      emoji: '⏳',
      bgColor: '#fff3e0',
      borderColor: '#ffb74d',
      persistent: true,
    },
    'context-compacted': {
      state: 'failed',
      bubbleText: 'Compacted',
      emoji: '📦',
      bgColor: '#fce4ec',
      borderColor: '#e57373',
      persistent: false,
    },
    'completion': {
      state: 'waving',
      bubbleText: 'Done!',
      emoji: '✅',
      bgColor: '#e8f5e9',
      borderColor: '#66bb6a',
      persistent: false,
    },
  };

  let bubbleActive = false;
  let bubbleHideTimer: ReturnType<typeof setTimeout> | null = null;
  const BUBBLE_TRANSIENT_VISIBLE_MS = 2500;

  function showBubble(config: CcEventConfig): void {
    if (bubbleHideTimer) {
      clearTimeout(bubbleHideTimer);
      bubbleHideTimer = null;
    }
    bubbleActive = true;
    void invoke('show_bubble_window', {
      data: {
        text: config.bubbleText,
        emoji: config.emoji,
        bgColor: config.bgColor,
        borderColor: config.borderColor,
      },
    });
    const timeout = config.persistent ? 8000 : BUBBLE_TRANSIENT_VISIBLE_MS;
    bubbleHideTimer = setTimeout(() => {
      void invoke('hide_bubble_window');
      bubbleActive = false;
    }, timeout);
  }

  async function handleCcEvent(eventName: string): Promise<void> {
    const config = ccEventConfig[eventName];
    if (!config) return;

    behavior.forceState(config.state);
    animator.play(config.state);

    // Try AI reaction first, fallback to static text
    if (isConfigValid()) {
      try {
        const reaction = await invoke<string>('generate_event_reaction', { event: eventName, petId: activePet.id });
        showBubble({ ...config, bubbleText: reaction });
        return;
      } catch {
        // Fall through to static text
      }
    }

    showBubble(config);
  }
  let edgeRedirectCooldown = 0;
  let aiIdleAccumulator = 0;

  behavior.on((nextState) => {
    animator.play(nextState);
    if (nextState === 'waving') {
      heartAlpha = 1;
      heartTimer = HEART_DURATION;
    }
  });

  async function handleMenuAction(action: MenuAction): Promise<void> {
    switch (action.type) {
      case 'state':
        behavior.forceState(action.state);
        break;
      case 'pet':
        {
          const nextPet = pets.find((pet) => pet.id === action.petId);
          if (nextPet) {
            const switched = await switchPet(nextPet);
            if (switched) {
              void emit('chat-pet-changed', {
                petId: nextPet.id,
                petName: nextPet.manifest.displayName,
                petEmoji: nextPet.id === 'cat' ? '🐱' : '🐾',
              });
            }
          }
        }
        break;
      case 'addPet':
        openPetImportWindow();
        break;
      case 'removePet':
        {
          const result = await invoke<RemovePetResult>('remove_pet', {
            petId: action.petId,
          });
          if (result.success) {
            await refreshPets();
          } else if (result.error) {
            console.warn('[app] remove pet failed:', result.error);
          }
        }
        break;
      case 'aiSettings':
      case 'openSettings':
        void invoke('open_ai_settings_window');
        break;
    }
  }

  nativeMenu.on(handleMenuAction);

  // Pet added listener (from import window)
  void listen<string>('pet-added', () => {
    try {
      void refreshPets();
    } catch (err) {
      console.error('[app] pet-added error:', err);
    }
  });

  // AI config change listener (from settings window)
  void listen<{ apiKey: string }>('ai-config-changed', (event) => {
    try {
      const config = event.payload as unknown as import('./types').AiConfig;
      setConfig(config);
    } catch (err) {
      console.error('[app] ai-config-changed error:', err);
    }
  });

  // CC Hook event listener with AI-powered reactions
  void listen<string>('cc-event', (event) => {
    try {
      handleCcEvent(event.payload);
    } catch (err) {
      console.error('[app] cc-event error:', err);
    }
  });

  new Interactions(canvas, behavior);

  // Sync bubble position when pet window moves
  void getCurrentWindow().onMoved(() => {
    if (bubbleActive) {
      void invoke('sync_bubble_position');
    }
  });

  // Click-to-chat: when AI configured, click pet to chat
  let chatClickTimer = 0;
  canvas.addEventListener('click', () => {
    if (!isConfigValid()) return;
    if (behavior.isDragging || behavior.recentlyDragged) return;
    const now = performance.now();
    if (now - chatClickTimer < 300) return;
    chatClickTimer = now;
    void invoke('open_chat_window', {
      petId: activePet.id,
      petName: activePet.manifest.displayName,
      petEmoji: activePet.id === 'cat' ? '🐱' : '🐾',
    });
  });

  window.addEventListener('mouseup', () => {
    if (behavior.isDragging) return;
    setTimeout(() => {
      void savePrefs();
    }, 200);
  });

  let lastTime = performance.now();

  let loopErrorCount = 0;
  let loopErrorTime = 0;

  function loop(currentTime: number): void {
    try {
      const deltaMs = currentTime - lastTime;
      lastTime = currentTime;

      // Feed current position before tick so behavior can compute target
      if (behavior.roamingActive) {
        behavior.setCurrentPosition(cachedRoamX, cachedRoamY);
      }

      behavior.tick(deltaMs);

      // Idle AI chatter
      const aiCfg = getConfig();
      if (behavior.currentState === 'idle' && aiCfg?.idleChatEnabled && !bubbleActive) {
        aiIdleAccumulator += deltaMs;
        const intervalMs = aiCfg.idleChatInterval * 1000;
        if (aiIdleAccumulator >= intervalMs) {
          aiIdleAccumulator = 0;
          if (Math.random() < 0.1 && !bubbleActive && behavior.currentState === 'idle') {
            invoke<string>('generate_event_reaction', { event: 'idle' })
              .then((text) => {
                if (bubbleActive) return;
                showBubble({ state: 'idle', bubbleText: text, emoji: '😺', bgColor: '#fff3e0', borderColor: '#ffb74d', persistent: false });
              })
              .catch(() => {});
          }
        }
      } else if (behavior.currentState !== 'idle') {
        // Keep accumulator running — don't reset, so idle chatter
        // triggers after cumulative idle time across actions
      }

      // Apply roaming displacement after tick
      if (behavior.roamingActive) {
        const disp = behavior.roamingDisplacement;
        if (disp.dx !== 0 || disp.dy !== 0) {
          cachedRoamX += disp.dx;
          cachedRoamY += disp.dy;

          // Clamp to screen bounds (account for window size)
          const { w, h } = getWindowSize(canvas);
          cachedRoamX = Math.max(0, Math.min(cachedRoamX, screenW - w));
          cachedRoamY = Math.max(0, Math.min(cachedRoamY, screenH - h));

          // Edge detection with cooldown to prevent rapid-fire retargeting
          edgeRedirectCooldown = Math.max(0, edgeRedirectCooldown - deltaMs);
          if (edgeRedirectCooldown === 0) {
            if (cachedRoamX <= EDGE_DETECT_MARGIN) {
              behavior.redirectFromEdge('left');
              edgeRedirectCooldown = 500;
            } else if (cachedRoamX + w >= screenW - EDGE_DETECT_MARGIN) {
              behavior.redirectFromEdge('right');
              edgeRedirectCooldown = 500;
            }
          }

          getCurrentWindow().setPosition(
            new LogicalPosition(cachedRoamX, cachedRoamY),
          ).catch(() => {});
        }
      }

      const shouldAnimateWhileDragging =
        behavior.isDragging && DRAG_ANIMATED_STATES.has(behavior.currentState);

      if (behavior.isDragging && !shouldAnimateWhileDragging) {
        if (!animator.isPaused) {
          animator.pause();
        }
      } else {
        if (animator.isPaused) {
          animator.resume();
        }
        animator.tick(deltaMs);
      }

      renderer.drawFrame(animator.currentCell, animator.flipHorizontal);

      if (heartAlpha > 0) {
        heartTimer -= deltaMs;
        heartAlpha = Math.max(0, heartTimer / HEART_DURATION);
        renderer.drawHeart(heartAlpha);
      }

    } catch (err) {
      // Rate-limit loop errors to 1 per 2 seconds
      const now = performance.now();
      if (now - loopErrorTime > 2000) {
        loopErrorTime = now;
        loopErrorCount++;
        console.error(`[app] render loop error (count=${loopErrorCount}):`, err);
      }
    }

    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);
}
