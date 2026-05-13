// Color palette
// 0 = transparent
// 1 = #1a1a1a  (outline/black)
// 2 = #f5c89a  (skin/fur light)
// 3 = #e8a870  (fur mid)
// 4 = #c97840  (fur dark/shadow)
// 5 = #ffffff  (white highlight)
// 6 = #2d2d2d  (dark body)
// 7 = #ff9999  (blush / inner ear)
// 8 = #4a9eff  (eyes blue)
// 9 = #ffdd44  (eye highlight / collar)
// A(10) = #ff6644 (nose/mouth)
// B(11) = #88cc44 (collar green variant)
// C(12) = #f0f0f0 (belly white)
// D(13) = #8B5E3C (stripe brown)

const P = {
  _: 0,  // transparent
  K: 1,  // outline
  L: 2,  // fur light (cream/orange-light)
  M: 3,  // fur mid
  D: 4,  // fur dark
  W: 5,  // white
  B: 6,  // dark body
  R: 7,  // blush/inner ear pink
  E: 8,  // eye blue
  Y: 9,  // yellow highlight
  N: 10, // nose orange-red
  G: 11, // green
  C: 12, // belly/chest white
  S: 13, // stripe/shadow brown
};

type Row = number[];

// 32×32 base cat frame — idle pose
// Each row is 32 pixels wide
// Big head Q-version with outline, blush, detailed eyes

function makeFrame(rows: Row[]): number[][] {
  // rows must be exactly 32 entries of length 32
  return rows;
}

// Helper: clone a frame (deep copy)
function cloneFrame(f: number[][]): number[][] {
  return f.map(r => [...r]);
}

const _ = P._;
const K = P.K;
const L = P.L;
const M = P.M;
const D = P.D;
const W = P.W;
const B = P.B;
const R = P.R;
const E = P.E;
const Y = P.Y;
const N = P.N;
const C = P.C;
const _S = P.S; void _S;

// Base idle frame (eyes open, standing)
const BASE: number[][] = makeFrame([
  //0  1  2  3  4  5  6  7  8  9  10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30 31
  [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_], // 0
  [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_], // 1
  [_,_,_,_,_,_,_,_,K,K,_,_,_,_,_,_,_,_,_,_,K,K,_,_,_,_,_,_,_,_,_,_], // 2  ears top
  [_,_,_,_,_,_,_,K,M,M,K,_,_,_,_,_,_,_,_,K,M,M,K,_,_,_,_,_,_,_,_,_], // 3  ears
  [_,_,_,_,_,_,K,M,R,M,M,K,K,K,K,K,K,K,K,M,M,R,M,K,_,_,_,_,_,_,_,_], // 4  ears+head top
  [_,_,_,_,_,_,K,L,L,L,L,L,L,L,L,L,L,L,L,L,L,L,L,K,_,_,_,_,_,_,_,_], // 5  head
  [_,_,_,_,_,_,K,L,L,L,L,L,L,L,L,L,L,L,L,L,L,L,L,K,_,_,_,_,_,_,_,_], // 6  head
  [_,_,_,_,_,_,K,L,L,K,K,L,L,L,L,L,L,L,L,K,K,L,L,K,_,_,_,_,_,_,_,_], // 7  eyes row
  [_,_,_,_,_,_,K,L,K,E,E,K,L,L,L,L,L,L,K,E,E,K,L,K,_,_,_,_,_,_,_,_], // 8  eyes
  [_,_,_,_,_,_,K,L,K,E,W,K,L,L,L,L,L,L,K,E,W,K,L,K,_,_,_,_,_,_,_,_], // 9  eyes highlight
  [_,_,_,_,_,_,K,L,L,K,K,L,L,L,L,L,L,L,L,K,K,L,L,K,_,_,_,_,_,_,_,_], // 10 below eyes
  [_,_,_,_,_,_,K,L,R,L,L,L,L,K,N,N,K,L,L,L,L,R,L,K,_,_,_,_,_,_,_,_], // 11 blush+nose
  [_,_,_,_,_,_,K,L,L,L,L,L,K,L,L,L,L,L,K,L,L,L,L,K,_,_,_,_,_,_,_,_], // 12 mouth area
  [_,_,_,_,_,_,K,M,L,L,L,L,L,L,L,L,L,L,L,L,L,L,M,K,_,_,_,_,_,_,_,_], // 13 chin
  [_,_,_,_,_,_,_,K,K,K,K,K,K,K,K,K,K,K,K,K,K,K,K,_,_,_,_,_,_,_,_,_], // 14 neck/collar top
  [_,_,_,_,_,_,_,K,Y,Y,Y,Y,Y,Y,Y,Y,Y,Y,Y,Y,Y,Y,K,_,_,_,_,_,_,_,_,_], // 15 collar
  [_,_,_,_,_,_,K,B,B,B,B,C,C,C,C,C,C,C,C,B,B,B,B,K,_,_,_,_,_,_,_,_], // 16 body top
  [_,_,_,_,_,_,K,B,B,B,C,C,C,C,C,C,C,C,C,C,B,B,B,K,_,_,_,_,_,_,_,_], // 17 body
  [_,_,_,_,_,_,K,B,B,B,C,C,C,C,C,C,C,C,C,C,B,B,B,K,_,_,K,K,_,_,_,_], // 18 body+tail
  [_,_,_,_,_,_,K,B,B,B,B,C,C,C,C,C,C,C,C,B,B,B,B,K,_,K,M,K,_,_,_,_], // 19 body+tail
  [_,_,_,_,_,_,K,B,B,B,B,B,B,B,B,B,B,B,B,B,B,B,B,K,K,M,M,K,_,_,_,_], // 20 body bottom+tail
  [_,_,_,_,_,_,_,K,K,K,B,B,B,B,B,B,B,B,B,B,K,K,K,K,M,M,M,K,_,_,_,_], // 21 legs top+tail
  [_,_,_,_,_,_,_,_,_,K,B,B,B,K,_,_,_,K,B,B,B,K,_,K,M,L,M,K,_,_,_,_], // 22 legs+tail
  [_,_,_,_,_,_,_,_,_,K,B,B,B,K,_,_,_,K,B,B,B,K,K,M,L,L,M,K,_,_,_,_], // 23 legs+tail
  [_,_,_,_,_,_,_,_,_,K,B,B,B,K,_,_,_,K,B,B,B,K,K,M,M,M,K,_,_,_,_,_], // 24 legs
  [_,_,_,_,_,_,_,_,_,K,B,D,B,K,_,_,_,K,B,D,B,K,_,K,K,K,_,_,_,_,_,_], // 25 paws
  [_,_,_,_,_,_,_,_,K,L,L,L,L,K,_,_,K,L,L,L,L,K,_,_,_,_,_,_,_,_,_,_], // 26 paw light
  [_,_,_,_,_,_,_,_,K,K,K,K,K,_,_,_,_,K,K,K,K,K,_,_,_,_,_,_,_,_,_,_], // 27 paw bottom
  [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_], // 28
  [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_], // 29
  [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_], // 30
  [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_], // 31
]);

// Idle frame B: body shifts down 1px (breathing bob)
function makeIdleB(): number[][] {
  const f = cloneFrame(BASE);
  // shift body/legs down 1 (rows 16-27 → 17-28, clear row 16)
  for (let y = 27; y >= 16; y--) {
    f[y + 1] = [...f[y]];
  }
  f[16] = new Array(32).fill(0);
  return f;
}

// Walk frames: legs alternating
function makeWalkA(): number[][] {
  const f = cloneFrame(BASE);
  // Left leg forward (shift left leg up 1), right leg back (shift down 1)
  // Left leg cols 9-13, right leg cols 17-21
  // Swap row 22-27 offsets
  for (let y = 22; y <= 26; y++) {
    // left leg up 1
    f[y - 1][9] = BASE[y][9]; f[y - 1][10] = BASE[y][10];
    f[y - 1][11] = BASE[y][11]; f[y - 1][12] = BASE[y][12];
    f[y][9] = 0; f[y][10] = 0; f[y][11] = 0; f[y][12] = 0;
    // right leg down 1
    if (y + 1 < 32) {
      f[y + 1][17] = BASE[y][17]; f[y + 1][18] = BASE[y][18];
      f[y + 1][19] = BASE[y][19]; f[y + 1][20] = BASE[y][20];
    }
  }
  return f;
}

function makeWalkB(): number[][] {
  const f = cloneFrame(BASE);
  for (let y = 22; y <= 26; y++) {
    // right leg up 1
    f[y - 1][17] = BASE[y][17]; f[y - 1][18] = BASE[y][18];
    f[y - 1][19] = BASE[y][19]; f[y - 1][20] = BASE[y][20];
    f[y][17] = 0; f[y][18] = 0; f[y][19] = 0; f[y][20] = 0;
    // left leg down 1
    if (y + 1 < 32) {
      f[y + 1][9] = BASE[y][9]; f[y + 1][10] = BASE[y][10];
      f[y + 1][11] = BASE[y][11]; f[y + 1][12] = BASE[y][12];
    }
  }
  return f;
}

// Sleep: eyes closed, body lowered, curled up slightly
function makeSleepA(): number[][] {
  const f = cloneFrame(BASE);
  // Close eyes (replace eye rows with flat lines)
  // Row 8: close eye
  f[8]  = [...BASE[8]];  f[8][9] = K; f[8][10] = K; f[8][19] = K; f[8][20] = K;
  f[8][8] = L; f[8][11] = L; f[8][18] = L; f[8][21] = L;
  // Row 9: erase highlight
  f[9]  = [...BASE[9]];  f[9][9] = K; f[9][10] = K; f[9][19] = K; f[9][20] = K;
  f[9][8] = L; f[9][11] = L; f[9][18] = L; f[9][21] = L;
  // Shift whole sprite down 2 (curled/resting)
  for (let y = 31; y >= 2; y--) {
    f[y] = y >= 2 ? [...f[y - 2]] : new Array(32).fill(0);
  }
  f[0] = new Array(32).fill(0);
  f[1] = new Array(32).fill(0);
  return f;
}

function makeSleepB(): number[][] {
  const f = makeSleepA();
  // Add Z bubble pixel above head
  f[1][22] = K; f[1][23] = K; f[1][24] = K;
  f[2][24] = K;
  f[3][22] = K; f[3][23] = K; f[3][24] = K;
  return f;
}

// Sit: body shifted down, tail wrapped around
function makeSitA(): number[][] {
  const f = cloneFrame(BASE);
  // Shift body down 3
  for (let y = 31; y >= 16; y--) {
    f[y] = y >= 3 ? [...BASE[y - 3]] : new Array(32).fill(0);
  }
  // Remove legs — cat is sitting, replace with wrapped tail / haunches
  for (let y = 22; y <= 31; y++) {
    f[y] = new Array(32).fill(0);
  }
  // Haunches (wider lower body)
  for (let x = 7; x <= 23; x++) f[22][x] = K;
  for (let x = 8; x <= 22; x++) { f[23][x] = B; f[24][x] = B; }
  f[23][8] = K; f[23][22] = K; f[24][8] = K; f[24][22] = K;
  // Paws front
  for (let x = 10; x <= 12; x++) { f[25][x] = B; f[26][x] = L; }
  for (let x = 18; x <= 20; x++) { f[25][x] = B; f[26][x] = L; }
  f[25][9] = K; f[25][13] = K; f[25][17] = K; f[25][21] = K;
  f[26][9] = K; f[26][13] = K; f[26][17] = K; f[26][21] = K;
  f[27][9] = K; f[27][10] = K; f[27][11] = K; f[27][12] = K; f[27][13] = K;
  f[27][17] = K; f[27][18] = K; f[27][19] = K; f[27][20] = K; f[27][21] = K;
  return f;
}

function makeSitB(): number[][] {
  // Identical shape but blink (half-closed eyes)
  const f = makeSitA();
  // Half-close eyes
  f[10][9] = K; f[10][10] = K; f[10][19] = K; f[10][20] = K;
  return f;
}

// React: jump + wide eyes
function makeReactA(): number[][] {
  const f = cloneFrame(BASE);
  // Shift whole sprite up 3 (jump)
  for (let y = 0; y < 32; y++) {
    f[y] = y + 3 < 32 ? [...BASE[y + 3]] : new Array(32).fill(0);
  }
  // Wide eyes — make pupils bigger
  f[5][9] = K; f[5][10] = K; f[5][11] = K;
  f[5][9] = E; f[5][10] = E; f[5][11] = K;
  f[5][19] = E; f[5][20] = E; f[5][21] = K;
  // Exclamation mark above head
  f[0][17] = K; f[1][17] = K; f[2][17] = K;
  f[0][17] = Y; f[1][17] = Y;
  f[3][17] = Y;
  return f;
}

function makeReactB(): number[][] {
  const f = cloneFrame(BASE);
  // Slight crouch (shift body down 1)
  for (let y = 31; y >= 16; y--) {
    f[y] = y >= 1 ? [...BASE[y - 1]] : new Array(32).fill(0);
  }
  return f;
}

export function getCatSpritesheetURL(): string {
  const frames: number[][][] = [
    // idle (0-3): base, bob, base, bob
    BASE,
    makeIdleB(),
    BASE,
    makeIdleB(),
    // walk (4-7): A, B, A, B
    makeWalkA(),
    makeWalkB(),
    makeWalkA(),
    makeWalkB(),
    // sleep (8-9)
    makeSleepA(),
    makeSleepB(),
    // sit (10-11)
    makeSitA(),
    makeSitB(),
    // react (12-13)
    makeReactA(),
    makeReactB(),
  ];

  const totalFrames = frames.length;
  const canvas = document.createElement('canvas');
  canvas.width = 32 * totalFrames;
  canvas.height = 32;
  const ctx = canvas.getContext('2d')!;

  const colors: string[] = [
    'rgba(0,0,0,0)', // 0 transparent
    '#1a1a1a',       // 1 K outline
    '#f5c89a',       // 2 L fur light
    '#e8a870',       // 3 M fur mid
    '#c97840',       // 4 D fur dark
    '#ffffff',       // 5 W white
    '#3a3a5c',       // 6 B body dark blue-grey
    '#ffb3ba',       // 7 R blush/inner ear
    '#4a9eff',       // 8 E eye blue
    '#ffdd44',       // 9 Y yellow/collar
    '#ff6644',       // 10 N nose
    '#88cc44',       // 11 G green
    '#f0f0ee',       // 12 C belly off-white
    '#8B5E3C',       // 13 S stripe brown
  ];

  for (let f = 0; f < totalFrames; f++) {
    const frame = frames[f];
    const ox = f * 32;
    for (let y = 0; y < 32; y++) {
      for (let x = 0; x < 32; x++) {
        const idx = frame[y][x];
        if (idx > 0) {
          ctx.fillStyle = colors[idx];
          ctx.fillRect(ox + x, y, 1, 1);
        }
      }
    }
  }

  return canvas.toDataURL();
}
