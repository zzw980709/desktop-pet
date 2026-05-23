import { invoke } from '@tauri-apps/api/core';
import type { PetState } from '../types';

export interface CcEventConfig {
  state: PetState;
  bubbleText: string;
  emoji: string;
  bgColor: string;
  borderColor: string;
  persistent: boolean;
}

export const CC_EVENT_CONFIG: Record<string, CcEventConfig> = {
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

const BUBBLE_TRANSIENT_VISIBLE_MS = 2500;

export interface CcEventDeps {
  forceState: (state: PetState) => void;
  playAnimation: (state: PetState) => void;
  isConfigValid: () => boolean;
  activePetId: string;
}

let bubbleActive = false;
let bubbleHideTimer: ReturnType<typeof setTimeout> | null = null;

export function isBubbleActive(): boolean {
  return bubbleActive;
}

export function showBubble(config: CcEventConfig): void {
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

export async function handleCcEvent(eventName: string, deps: CcEventDeps): Promise<void> {
  const config = CC_EVENT_CONFIG[eventName];
  if (!config) return;

  deps.forceState(config.state);
  deps.playAnimation(config.state);

  if (deps.isConfigValid()) {
    try {
      const reaction = await invoke<string>('generate_event_reaction', { event: eventName, petId: deps.activePetId });
      showBubble({ ...config, bubbleText: reaction });
      return;
    } catch {
      // Fall through to static text
    }
  }

  showBubble(config);
}
