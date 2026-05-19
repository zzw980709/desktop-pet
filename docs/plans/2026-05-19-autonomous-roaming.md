# 自主漫游行为 Implementation Plan

> **For agentic workers:** Use inline implementation for this plan. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 让宠物在屏幕内自主走动，走到随机目标点，停下来，偶尔跳跃/思考，碰边缘自动转向。

**Architecture:** 在 BehaviorEngine 中新增 RoamingState（paused/wandering/acting 三模式），tick() 中漫游逻辑驱动动画状态 + 输出窗口位移。app.ts 读取位移并移动窗口，同时负责边缘检测。Interactions 在拖拽时挂起/恢复漫游。不改 Rust。

**Tech Stack:** TypeScript, Tauri v2 window API

---

### Task 1: 扩展 BehaviorEngine — 漫游核心

**Files:**
- Modify: `src/engine/behavior.ts`
- Modify: `tests/behavior.test.ts`

- [ ] **Step 1: 写漫游基础测试**

```typescript
// tests/behavior.test.ts — 追加以下测试

it('roaming starts in paused mode with idle animation', () => {
  const e = new BehaviorEngine(() => 0.5);
  e.startRoaming();
  expect(e.roamingActive).toBe(true);
  // First tick should be in paused mode → idle
  e.tick(16);
  expect(e.currentState).toBe('idle');
});

it('paused transitions to wandering after timeout', () => {
  const e = new BehaviorEngine(() => 0);
  e.startRoaming();
  // rng=0 → pauseTimer = 2000ms
  e.tick(2001);
  expect(e.currentState).toBe('running-right');
});

it('wandering produces non-zero displacement', () => {
  const e = new BehaviorEngine(() => 0.5);
  e.startRoaming();
  // Fast-forward past paused
  e.tick(6000);
  const disp = e.roamingDisplacement;
  expect(disp.dx).not.toBe(0);
});

it('suspended roaming does not produce displacement', () => {
  const e = new BehaviorEngine(() => 0.5);
  e.startRoaming();
  e.tick(6000);
  e.suspendRoaming();
  e.tick(16);
  expect(e.roamingDisplacement.dx).toBe(0);
});

it('resume after suspend goes to paused mode', () => {
  const e = new BehaviorEngine(() => 0.5);
  e.startRoaming();
  e.tick(6000); // now wandering
  e.suspendRoaming();
  e.resumeRoaming();
  expect(e.roamingActive).toBe(true);
  // Should be idle (paused mode)
  expect(e.currentState).toBe('idle');
});

it('acting mode triggers animation and returns to paused', () => {
  const e = new BehaviorEngine(() => 0);
  e.startRoaming();
  // Fast-forward to wandering
  e.tick(2001);
  // Force acting by manipulating target
  // rng=0 → always triggers acting (0 < 0.1)
  e.handleAnimationEnd(); // simulate arrival
  // After acting, animation end → back to idle (paused)
  expect(e.currentState).toBe('idle');
});

it('setScreenBounds updates boundary for target selection', () => {
  const e = new BehaviorEngine(() => 0.5);
  e.setScreenBounds(1920, 1080);
  e.startRoaming();
  // Target should be within bounds (40-1880, 40-1040)
  // We can verify indirectly via displacement direction
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npm test -- --reporter=verbose 2>&1
```
Expected: 新增 7 个测试 FAIL（方法/属性不存在）

- [ ] **Step 3: 实现 RoamingState 和核心方法**

在 `src/engine/behavior.ts` 中添加：

```typescript
// 新增接口（文件顶部，BehaviorEngine 类外部）
interface RoamingState {
  active: boolean;
  suspended: boolean;
  mode: 'paused' | 'wandering' | 'acting';
  targetX: number;
  targetY: number;
  speed: number;       // px/s, 60-120
  pauseTimer: number;  // ms remaining
  direction: 'left' | 'right';
}

const EDGE_MARGIN = 40;
const EDGE_DETECT = 20;
const WANDER_SPEED_MIN = 60;
const WANDER_SPEED_MAX = 120;
const PAUSE_MIN_MS = 2000;
const PAUSE_MAX_MS = 8000;
const ACT_PROBABILITY = 0.1;
const ACT_DURATION_MS = 2500;
const ACT_OPTIONS: State[] = ['jumping', 'waiting', 'review'];
```

在 BehaviorEngine 类中添加字段：

```typescript
private roaming: RoamingState = {
  active: false,
  suspended: false,
  mode: 'paused',
  targetX: 0,
  targetY: 0,
  speed: 60,
  pauseTimer: 0,
  direction: 'right',
};
private screenW = 1920;
private screenH = 1080;
private currentX = 0;
private currentY = 0;
private _roamingDisplacement = { dx: 0, dy: 0 };
```

添加公开方法：

```typescript
get roamingActive(): boolean {
  return this.roaming.active;
}

get roamingDisplacement(): { dx: number; dy: number } {
  return this._roamingDisplacement;
}

setScreenBounds(w: number, h: number): void {
  this.screenW = w;
  this.screenH = h;
}

setCurrentPosition(x: number, y: number): void {
  this.currentX = x;
  this.currentY = y;
}

startRoaming(): void {
  this.roaming.active = true;
  this.roaming.mode = 'paused';
  this.roaming.pauseTimer = PAUSE_MIN_MS + this.rng() * (PAUSE_MAX_MS - PAUSE_MIN_MS);
  this._roamingDisplacement = { dx: 0, dy: 0 };
  this.transitionTo('idle');
}

suspendRoaming(): void {
  this.roaming.suspended = true;
  this._roamingDisplacement = { dx: 0, dy: 0 };
}

resumeRoaming(): void {
  this.roaming.suspended = false;
  this.roaming.mode = 'paused';
  this.roaming.pauseTimer = PAUSE_MIN_MS + this.rng() * (PAUSE_MAX_MS - PAUSE_MIN_MS);
  this.transitionTo('idle');
}
```

实现 tickRoaming：

```typescript
private tickRoaming(deltaMs: number): void {
  this._roamingDisplacement = { dx: 0, dy: 0 };

  if (this.roaming.suspended) {
    // Still count down pause timer so pet doesn't immediately walk after drag
    if (this.roaming.mode === 'paused') {
      this.roaming.pauseTimer -= deltaMs;
    }
    return;
  }

  switch (this.roaming.mode) {
    case 'paused':
      this.roaming.pauseTimer -= deltaMs;
      if (this.roaming.pauseTimer <= 0) {
        this.pickRandomTarget();
        this.roaming.mode = 'wandering';
        this.roaming.speed = WANDER_SPEED_MIN + this.rng() * (WANDER_SPEED_MAX - WANDER_SPEED_MIN);
        this.roaming.direction = this.roaming.targetX > (this.screenW / 2) ? 'right' : 'left';
        this.transitionTo(this.roaming.direction === 'right' ? 'running-right' : 'running-left');
      }
      break;

    case 'wandering': {
      const dx = (this.roaming.direction === 'right' ? 1 : -1) * this.roaming.speed * (deltaMs / 1000);
      // Clamp single-frame movement
      this._roamingDisplacement = { dx: Math.max(-5, Math.min(5, dx)), dy: 0 };

      // Check if we're near edge — handled by app.ts via edge check
      // App.ts will call redirectFromEdge when needed
      break;
    }

    case 'acting':
      // Animation plays; handleAnimationEnd transitions back to paused
      break;
  }
}

private pickRandomTarget(): void {
  this.roaming.targetX = EDGE_MARGIN + this.rng() * (this.screenW - 2 * EDGE_MARGIN);
  this.roaming.targetY = EDGE_MARGIN + this.rng() * (this.screenH - 2 * EDGE_MARGIN);
}

/** Called by app.ts when pet reaches target or hits edge */
notifyArrived(): void {
  if (this.roaming.mode !== 'wandering') return;
  if (this.rng() < ACT_PROBABILITY) {
    this.roaming.mode = 'acting';
    const act = ACT_OPTIONS[Math.floor(this.rng() * ACT_OPTIONS.length)] ?? 'jumping';
    this.transitionTo(act);
  } else {
    this.roaming.mode = 'paused';
    this.roaming.pauseTimer = PAUSE_MIN_MS + this.rng() * (PAUSE_MAX_MS - PAUSE_MIN_MS);
    this.transitionTo('idle');
  }
  this._roamingDisplacement = { dx: 0, dy: 0 };
}

/** Called by app.ts when pet is near screen edge */
redirectFromEdge(edge: 'left' | 'right' | 'top' | 'bottom'): void {
  if (this.roaming.mode !== 'wandering') return;
  // Pick a new target away from the edge
  switch (edge) {
    case 'left':
      this.roaming.targetX = EDGE_MARGIN + this.rng() * (this.screenW * 0.5);
      break;
    case 'right':
      this.roaming.targetX = this.screenW * 0.5 + this.rng() * (this.screenW * 0.5 - EDGE_MARGIN);
      break;
    default:
      this.pickRandomTarget();
      break;
  }
  this.roaming.direction = this.roaming.targetX > (this.screenW / 2) ? 'right' : 'left';
  this.transitionTo(this.roaming.direction === 'right' ? 'running-right' : 'running-left');
}
```

修改 tick() 方法，在 dragSettleTimer 检查后插入漫游逻辑：

```typescript
tick(deltaMs: number): void {
  try {
    if (this.dragging) return;
    if (this.dragSettleTimer > 0) {
      this.dragSettleTimer = Math.max(0, this.dragSettleTimer - deltaMs);
      if (this.dragSettleTimer === 0 && DIRECTIONAL_DRAG_STATES.includes(this._currentState)) {
        this.transitionTo('idle');
      }
      return;
    }

    // 漫游模式优先
    if (this.roaming.active) {
      this.tickRoaming(deltaMs);
      return;
    }

    // 原有 idle → random 逻辑保持不变
    if (this._currentState !== 'idle') {
      if (!RESET_TO_IDLE_ON_END.includes(this._currentState)) {
        this.stateElapsed += deltaMs;
        if (this.stateElapsed >= MAX_RANDOM_ACTION_MS) {
          this.transitionTo('idle');
        }
      }
      return;
    }

    this.idleTimer -= deltaMs;
    if (this.idleTimer > 0) return;
    this.tryRandomTransition();
    this.resetIdleTimer();
  } catch (err) {
    console.error('[behavior] tick error, resetting to idle:', err);
    this._currentState = 'idle';
    this.dragging = false;
    this.resetIdleTimer();
  }
}
```

修改 handleAnimationEnd() — 支持 acting 模式下的返回：

```typescript
handleAnimationEnd(): void {
  if (this.dragging) return;

  // Roaming acting → back to paused
  if (this.roaming.active && this.roaming.mode === 'acting') {
    this.roaming.mode = 'paused';
    this.roaming.pauseTimer = PAUSE_MIN_MS + this.rng() * (PAUSE_MAX_MS - PAUSE_MIN_MS);
    this.transitionTo('idle');
    return;
  }

  if (RESET_TO_IDLE_ON_END.includes(this._currentState)) {
    this.transitionTo('idle');
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npm test -- --reporter=verbose 2>&1
```
Expected: 全部测试 PASS（原有 24 + 新增 7 = 31）

- [ ] **Step 5: 提交**

```bash
git add src/engine/behavior.ts tests/behavior.test.ts
git commit -m "feat: add roaming state machine to BehaviorEngine"
```

---

### Task 2: Interactions — 拖拽挂起/恢复漫游

**Files:**
- Modify: `src/interactions.ts`
- Modify: `tests/interactions.test.ts`

- [ ] **Step 1: 写测试**

```typescript
// tests/interactions.test.ts — 追加测试

it('drag start suspends roaming', () => {
  const behavior = new BehaviorEngine(() => 0.5);
  behavior.startRoaming();
  const canvas = document.createElement('canvas');
  new Interactions(canvas, behavior);

  canvas.dispatchEvent(new MouseEvent('mousedown', { screenX: 100, screenY: 200 }));
  // Trigger drag threshold
  window.dispatchEvent(new MouseEvent('mousemove', { screenX: 120, screenY: 200 }));
  expect(behavior.roamingActive).toBe(true);
  // roaming displacement should be 0 during drag
  behavior.tick(16);
  expect(behavior.roamingDisplacement.dx).toBe(0);
});

it('drag end resumes roaming', () => {
  const behavior = new BehaviorEngine(() => 0.5);
  behavior.startRoaming();
  const canvas = document.createElement('canvas');
  new Interactions(canvas, behavior);

  canvas.dispatchEvent(new MouseEvent('mousedown', { screenX: 100, screenY: 200 }));
  window.dispatchEvent(new MouseEvent('mousemove', { screenX: 120, screenY: 200 }));
  window.dispatchEvent(new MouseEvent('mouseup'));
  expect(behavior.roamingActive).toBe(true);
  expect(behavior.currentState).toBe('idle'); // reset to paused
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npm test -- tests/interactions.test.ts 2>&1
```

- [ ] **Step 3: 实现**

在 Interactions 构造函数中，behavior 参数现在需要调用 `suspendRoaming/resumeRoaming`：

onMouseDown 中（dragMoved 触发后）：
```typescript
if (!this.dragMoved && (Math.abs(totalDeltaX) > this.dragThreshold || Math.abs(totalDeltaY) > this.dragThreshold)) {
  this.dragMoved = true;
  this.behavior.suspendRoaming();
  this.behavior.handleDragStart();
}
```

onMouseUp 中（dragMoved 分支）：
```typescript
if (this.dragMoved) {
  this.behavior.handleDragEnd();
  this.behavior.resumeRoaming();
} else {
  this.behavior.handleClick();
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npm test -- tests/interactions.test.ts 2>&1
```

- [ ] **Step 5: 提交**

```bash
git add src/interactions.ts tests/interactions.test.ts
git commit -m "feat: suspend/resume roaming during drag in Interactions"
```

---

### Task 3: app.ts — 窗口移动与边缘检测

**Files:**
- Modify: `src/app.ts`

- [ ] **Step 1: 在 initApp 中启动漫游**

在 pet 加载成功后，初始化 roaming：

```typescript
// 在 switched = await switchPet(fallback); 成功后，initApp 中
// 约 line 184 附近，before behavior.on(...) 那一段

// 启动自主漫游
behavior.setScreenBounds(screen.width, screen.height);
behavior.startRoaming();
```

- [ ] **Step 2: 在渲染循环中应用位移**

在 loop() 函数中，`behavior.tick(deltaMs)` 之后，animator tick 之前：

```typescript
behavior.tick(deltaMs);

// 应用漫游窗口位移
if (behavior.roamingActive) {
  const disp = behavior.roamingDisplacement;
  if (disp.dx !== 0 || disp.dy !== 0) {
    const pos = await getCurrentWindow().outerPosition().catch(() => null);
    if (pos) {
      const newX = pos.x + disp.dx;
      const newY = pos.y + disp.dy;

      // 边缘检测
      const edgeMargin = 20;
      if (newX <= edgeMargin) {
        behavior.redirectFromEdge('left');
      } else if (newX >= screen.width - edgeMargin) {
        behavior.redirectFromEdge('right');
      }

      // Clamp to monitor via existing helper
      const clamped = await clampToMonitor(newX, newY, canvas);
      await getCurrentWindow().setPosition(
        new LogicalPosition(clamped.x, clamped.y),
      ).catch(() => {});
    }
  }

  // 检查是否接近目标点
  if (pos) {
    // This check happens naturally as the pet walks
    // notifyArrived is called when displacement slows near target
  }
}
```

Wait — 上面的实现有问题。`loop` 是同步的 requestAnimationFrame 回调，但 `getCurrentWindow().outerPosition().catch()` 返回 Promise。需要改成 async。

让我重新设计：把 loop 改成 async：

```typescript
async function loop(currentTime: number): Promise<void> {
  try {
    const deltaMs = currentTime - lastTime;
    lastTime = currentTime;

    behavior.tick(deltaMs);

    // 读取漫游位移并移动窗口
    if (behavior.roamingActive) {
      const disp = behavior.roamingDisplacement;
      if (disp.dx !== 0 || disp.dy !== 0) {
        const win = getCurrentWindow();
        const pos = await win.outerPosition().catch(() => null);
        if (pos) {
          const newX = pos.x + disp.dx;
          const newY = pos.y + disp.dy;

          // 边缘检测 — 提前转向
          if (newX <= 20) {
            behavior.redirectFromEdge('left');
          } else if (newX >= (await screenSize()).w - 20) {
            behavior.redirectFromEdge('right');
          }

          const clamped = await clampToMonitor(newX, newY, canvas);
          await win.setPosition(
            new LogicalPosition(clamped.x, clamped.y),
          ).catch(() => {});
        }
      }
    }

    // ... rest of loop unchanged
  }
}
```

但是 `clampToMonitor` 已经做了边缘 clamp，所以边缘检测需要在 clamp 之前做。而且由于 screen size 需要从 monitor API 获取……

简化方案：在 roaming 开始前获取一次屏幕尺寸，存在变量中。

```typescript
// 在 initApp 中
const monitor = await currentMonitor().catch(() => null);
if (monitor) {
  const scale = monitor.scaleFactor;
  behavior.setScreenBounds(
    monitor.size.width / scale,
    monitor.size.height / scale,
  );
}
behavior.startRoaming();
```

loop 中：
```typescript
if (behavior.roamingActive) {
  const disp = behavior.roamingDisplacement;
  if (disp.dx !== 0 || disp.dy !== 0) {
    const pos = await getCurrentWindow().outerPosition().catch(() => null);
    if (pos) {
      const newX = pos.x + disp.dx;
      const newY = pos.y + disp.dy;
      const { w } = getWindowSize(canvas);
      const edgeLimit = 20;
      if (newX <= edgeLimit) {
        behavior.redirectFromEdge('left');
      } else if (newX + w >= (monitor?.size.width ?? 1920) / (monitor?.scaleFactor ?? 1) - edgeLimit) {
        behavior.redirectFromEdge('right');
      }
      const clamped = await clampToMonitor(newX, newY, canvas);
      await getCurrentWindow().setPosition(
        new LogicalPosition(clamped.x, clamped.y),
      ).catch(() => {});
    }
  }
}
```

但还需要判断是否到达目标。到达目标的判定：距离 < 10px。

在 displacement 输出后，如果当前是 wandering 模式且 dx 很小（即将到达/已到达），在 tick 中就可以判断了。实际上，tickRoaming 已经计算了 dx 和当前位置。问题是 tickRoaming 不知道当前窗口位置。

方案：在 tick() 之前传递当前位置给 behavior。或者让 app.ts 在每次 tick 前设置 behavior 的当前位置。

添加：`behavior.setCurrentPosition(x, y)`，在 tick 前调用。然后在 tickRoaming 的 wandering 分支中：

```typescript
case 'wandering': {
  const dx = (this.roaming.direction === 'right' ? 1 : -1) * this.roaming.speed * (deltaMs / 1000);
  this._roamingDisplacement = { dx: Math.max(-5, Math.min(5, dx)), dy: 0 };

  // 检查是否到达目标
  const estimatedX = this.currentX + this._roamingDisplacement.dx;
  if (Math.abs(estimatedX - this.roaming.targetX) < 10) {
    this.notifyArrived();
  }
  break;
}
```

这样更干净。app.ts 只需要设置位置和读取位移。

- [ ] **Step 3: 实现 app.ts 改动**

完整改动描述：

1. 从 `@tauri-apps/api/window` 导入中已有 `getCurrentWindow, currentMonitor`
2. 在 pet 加载后，获取屏幕尺寸并启动漫游
3. 在 loop 中添加位移应用逻辑
4. loop 函数需改为 async

loop 函数签名从 `function loop(currentTime: number): void` 改为 `async function loop(currentTime: number): Promise<void>`

- [ ] **Step 4: 构建验证**

```bash
npm run build 2>&1
```
Expected: tsc + vite build 成功

- [ ] **Step 5: 提交**

```bash
git add src/app.ts
git commit -m "feat: apply roaming displacement and edge detection in render loop"
```

---

### Task 4: 最终验证

- [ ] **Step 1: 全量测试**

```bash
npm test 2>&1
```
Expected: 全部 test 通过

- [ ] **Step 2: Rust 编译检查**

```bash
cargo build --manifest-path src-tauri/Cargo.toml 2>&1
```
Expected: 编译成功

- [ ] **Step 3: 修改现有测试兼容漫游**

漫游启动后，现有的 tick 测试可能受影响（因为 roaming.active 会改变 tick 行为）。需要确保：
- 未启动漫游时，BehaviorEngine 行为不变
- 漫游相关测试独立验证 roaming 行为

已有的 24 个 behavior 测试中，漫游未启动（`startRoaming()` 未调用），所以 tick 行为应保持原样。因为 tick 中 `if (this.roaming.active)` 只在 startRoaming 后才为 true。

- [ ] **Step 4: 提交**

```bash
git add -A
git commit -m "test: verify existing tests pass with roaming integration"
```

---

### Task 5: 完整构建与发布

- [ ] **Step 1: 完整构建**

```bash
npm run tauri build 2>&1
```

- [ ] **Step 2: 创建 release**

```bash
TAG="v0.2.0-$(date +%Y%m%d)-$(git rev-parse --short HEAD)"
git tag "$TAG"
git push origin "$TAG"
gh release create "$TAG" --title "desktop-pet $TAG" --notes "自主漫游行为：宠物在屏幕内自由走动、暂停、偶尔跳跃。" src-tauri/target/release/bundle/dmg/*.dmg
```
