interface BubbleData {
  text: string;
  emoji: string;
  bgColor: string;
  borderColor: string;
}

const wrap = document.getElementById('bubble-wrap')!;
const body = document.getElementById('bubble-body')!;

function showBubble(data: BubbleData): void {
  body.textContent = `${data.emoji} ${data.text}`;
  body.style.background = data.bgColor;
  body.style.borderColor = data.borderColor;
  (wrap.querySelector('.bubble-tail') as HTMLElement).style.borderTopColor = data.borderColor;
  wrap.classList.add('show');
}

function hideBubble(): void {
  wrap.classList.remove('show');
}

// Called from Rust via eval
(window as unknown as Record<string, unknown>).bubbleUpdate = (data: BubbleData | null) => {
  if (data) {
    showBubble(data);
  } else {
    hideBubble();
  }
};
