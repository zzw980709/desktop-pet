function emptyFrame(): number[][] {
  return Array.from({ length: 32 }, () => new Array(32).fill(0));
}

function drawCatBase(frame: number[][], x0: number, y0: number): void {
  // Head
  for (let y = 4; y < 12; y++) {
    for (let x = 10; x < 22; x++) {
      if (y >= 5 && y <= 10 && x >= 12 && x <= 19) {
        frame[y0 + y][x0 + x] = 3; // face
      } else if (y >= 4 && y <= 10 && x >= 11 && x <= 20) {
        frame[y0 + y][x0 + x] = 2; // head
      }
    }
  }
  // Eyes
  frame[y0 + 7][x0 + 13] = 1; frame[y0 + 7][x0 + 14] = 1;
  frame[y0 + 7][x0 + 17] = 1; frame[y0 + 7][x0 + 18] = 1;
  // Nose
  frame[y0 + 9][x0 + 15] = 1; frame[y0 + 9][x0 + 16] = 1;
  // Body
  for (let y = 12; y < 22; y++) {
    for (let x = 10; x < 22; x++) {
      frame[y0 + y][x0 + x] = y <= 13 && x >= 12 && x <= 19 ? 3 : 2;
    }
  }
  // Legs
  for (let leg = 0; leg < 2; leg++) {
    const lx = leg === 0 ? 11 : 18;
    for (let y = 22; y < 28; y++) {
      for (let x = lx; x < lx + 3; x++) {
        frame[y0 + y][x0 + x] = 2;
      }
    }
  }
  // Tail
  for (let i = 0; i < 6; i++) {
    frame[y0 + 17 + i][x0 + 22 + (i < 3 ? i : 5 - i)] = 2;
  }
}

export function getCatSpritesheetURL(): string {
  const totalFrames = 14;
  const canvas = document.createElement('canvas');
  canvas.width = 32 * totalFrames;
  canvas.height = 32;
  const ctx = canvas.getContext('2d')!;

  const colors = ['rgba(0,0,0,0)', '#1a1a2e', '#e94560', '#f5e6ca'];

  for (let f = 0; f < totalFrames; f++) {
    const frame = emptyFrame();
    const offsetX = f * 32;

    if (f < 4) {
      drawCatBase(frame, 0, f % 2);
      // ears
      frame[3][11] = 2; frame[3][12] = 2;
      frame[2][12] = 2; frame[2][13] = 2;
      frame[3][19] = 2; frame[3][20] = 2;
      frame[2][19] = 2; frame[2][18] = 2;
    } else if (f < 8) {
      drawCatBase(frame, 0, 0);
      frame[3][11] = 2; frame[3][12] = 2;
      frame[2][12] = 2; frame[2][13] = 2;
      frame[3][19] = 2; frame[3][20] = 2;
      frame[2][19] = 2; frame[2][18] = 2;
      // Alternate legs for walk
      if (f % 2 === 0) {
        frame[24][12] = 1;
        frame[24][20] = 1;
      } else {
        frame[24][11] = 1;
        frame[24][19] = 1;
      }
    } else if (f < 10) {
      drawCatBase(frame, 0, 2);
      // Closed eyes for sleep
      frame[9][13] = 1; frame[9][14] = 1;
      frame[9][17] = 1; frame[9][18] = 1;
    } else if (f < 12) {
      drawCatBase(frame, 0, 4);
      frame[3][11] = 2; frame[3][12] = 2;
      frame[2][12] = 2; frame[2][13] = 2;
      frame[3][19] = 2; frame[3][20] = 2;
      frame[2][19] = 2; frame[2][18] = 2;
      frame[9][14] = 1; frame[9][17] = 1;
    } else {
      // React - surprised
      drawCatBase(frame, 0, f % 2 === 0 ? -1 : 0);
      frame[3][11] = 2; frame[3][12] = 2;
      frame[2][12] = 2; frame[2][13] = 2;
      frame[3][19] = 2; frame[3][20] = 2;
      frame[2][19] = 2; frame[2][18] = 2;
    }

    // Render pixels
    for (let y = 0; y < 32; y++) {
      for (let x = 0; x < 32; x++) {
        const colorIdx = frame[y][x];
        if (colorIdx > 0) {
          ctx.fillStyle = colors[colorIdx];
          ctx.fillRect(offsetX + x, y, 1, 1);
        }
      }
    }
  }

  return canvas.toDataURL();
}
