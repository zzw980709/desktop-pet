import { listen } from '@tauri-apps/api/event';

interface BubbleData {
  text: string;
  emoji: string;
  bgColor: string;
  borderColor: string;
}

const wrap = document.getElementById('bubble-wrap')!;
const body = document.getElementById('bubble-body')!;
let hideTimer: ReturnType<typeof setTimeout> | null = null;

function showBubble(data: BubbleData): void {
  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }
  body.textContent = `${data.emoji} ${data.text}`;
  body.style.background = data.bgColor;
  body.style.borderColor = data.borderColor;
  (wrap.querySelector('.bubble-tail') as HTMLElement).style.borderTopColor = data.borderColor;
  wrap.classList.add('show');
}

function hideBubble(): void {
  wrap.classList.remove('show');
}

void listen<BubbleData | null>('bubble-update', (event) => {
  if (event.payload) {
    showBubble(event.payload);
  } else {
    hideBubble();
  }
});
