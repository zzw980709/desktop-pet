# Spec: 宠物自主漫游行为

## 目标

宠物不再停在原地随机做动作，而是在整个屏幕上自主走动。它看起来像一个有生命的小动物：走到一个地方、停下来、偶尔跳跃或张望、再走向另一个地方。拖拽、点击、bongo 键盘交互仍然可用，不会与漫游行为冲突。

## 行为状态机

```
            ┌──────────┐
    拖拽结束 │  PAUSED  │ 定时器到期
        ┌───│ (idle)   │──────────┐
        │   │ 2-8s     │          │
        │   └──────────┘          │
        │        ▲                ▼
        │  动画结束│         ┌──────────┐
        │   ┌──────────┐     │WANDERING │
        │   │  ACTING  │     │ 向目标走 │
        │   │jump/wave │◄────│ 移窗口   │
        │   │ review   │10%  │ 放移动   │
        │   │ 2-3s    │触发 │ 动画     │
        │   └──────────┘     └────┬─────┘
        │                         │
        │                   到达目标/遇边缘
        │                         │
        └─────────────────────────┘
```

### 状态说明

| 状态 | 动画 | 窗口位置 | 持续/退出条件 |
|------|------|----------|---------------|
| PAUSED | idle | 原地不动 | 2-8s 随机定时器到期 |
| WANDERING | running-left 或 running-right（依方向） | 每帧向目标移动 | 到达目标（< 10px）或遇屏幕边缘 |
| ACTING | jumping / waiting / review（随机选） | 原地不动 | 动画播放完毕 |

### 转换规则

1. **PAUSED → WANDERING**：选取屏幕内随机目标点（距边缘至少 40px），根据 x 方向决定 left/right
2. **WANDERING → PAUSED**：到达目标点附近（距离 < 10px）或检测到距屏幕边缘 < 20px 时提前转向
3. **WANDERING → ACTING**：10% 概率在到达目标后触发（不是每次到达都做动作）
4. **ACTING → PAUSED**：动画自然结束
5. 拖拽操作暂停漫游（不改变状态只是挂起），松手后从当前位置重新开始 PAUSED
6. 点击/菜单触发的动作覆盖漫游显示，完成后恢复 PAUSED
7. Bongo 不打断漫游状态

## 漫游参数

| 参数 | 值 | 说明 |
|------|-----|------|
| 行走速度 | 60-120 px/s | 每次进入 WANDERING 随机取值 |
| 暂停时间 | 2000-8000 ms | 每次进入 PAUSED 随机取值 |
| 动作触发概率 | 10% | 到达目标后 |
| 边缘检测距离 | 20 px | 距屏幕边缘此距离时转向 |
| 目标到达判定 | 10 px | 距目标点的距离阈值 |
| 屏幕边距 | 40 px | 选取目标点时距边缘的最小距离 |

## 技术方案

### 核心改动：BehaviorEngine 扩展

在 `BehaviorEngine` 中新增漫游相关状态：

```typescript
interface RoamingState {
  mode: 'paused' | 'wandering' | 'acting';
  targetX: number;
  targetY: number;
  speed: number;        // px/s
  pauseTimer: number;   // ms remaining
  direction: 'left' | 'right';
}
```

`tick(deltaMs)` 逻辑增强：
1. 如果被拖拽挂起，跳过漫游逻辑
2. 根据 `mode` 递减定时器/移动向目标
3. 到达目标或遇边缘时切换状态
4. WANDERING 时返回窗口位移量供 app.ts 使用

### 窗口移动

`BehaviorEngine.tick()` 在 WANDERING 模式下返回位移增量 `{ dx: number, dy: number }`。`app.ts` 的渲染循环读取此增量，调用 `getCurrentWindow().setPosition()` 更新窗口位置。

位移计算：`dx = direction_sign * speed * delta_seconds`，dy 暂为 0（水平漫游）。

### 边缘检测

在 `app.ts` 中，每次获取窗口位置后检查是否接近屏幕边缘（距边缘 < 20px）。如果是，通知 BehaviorEngine 转向（选取新的远离边缘的目标点）。

屏幕尺寸通过 `currentMonitor()` API 获取。

### 文件改动

```
src/engine/behavior.ts  — 新增漫游模式、目标选择、位移计算
src/app.ts              — 渲染循环中应用窗口位移、边缘检测
src/interactions.ts     — 拖拽时挂起/恢复漫游
```

无新文件。不改 Rust 代码。

## 交互优先级（从高到低）

1. **拖拽**：暂停漫游，松手后重新开始 PAUSED
2. **Bongo**：不打断漫游，覆盖动画显示，完成后漫游继续
3. **点击挥手**：覆盖动画，完成后漫游继续
4. **菜单切换状态**：手动状态播放完毕后恢复漫游
5. **自主漫游**：最低优先级，被上述任何操作打断后恢复

## 边界

- Always: 窗口始终保持在屏幕可见区域内（通过边缘检测 + 目标点约束）
- Never: 允许窗口部分移出屏幕；单帧移动超过 5px
- Ask first: 无

## 验收标准

1. 宠物在屏幕内自主走动，方向自然变化
2. 不会走出屏幕
3. 停顿时间有随机感（2-8s）
4. 偶尔跳跃/思考
5. 拖拽移动后恢复漫游
6. 点击挥手后恢复漫游
7. Bongo 键盘触发不打断漫游
8. 不引入新的 TypeScript/Rust 编译错误
9. 现有测试全部通过
