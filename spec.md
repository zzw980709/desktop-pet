# 像素虚拟桌宠 — 设计规格

## 概述

一款 macOS 像素风格虚拟桌宠应用。首个角色为像素猫咪，支持观看、拖拽、点击交互、定时陪伴提醒。角色系统设计为可扩展的插件架构，支持用户安装自定义角色包。

**技术栈**：Tauri (Rust 后端 + TypeScript 前端) + HTML5 Canvas 渲染

---

## 一、基础行为

- **窗口**：无边框、透明背景、始终置顶、可拖拽移动
- **渲染**：Canvas 渲染，`image-rendering: pixelated`，整数倍缩放（1×/2×/3×），默认 2×
- **精灵尺寸**：32×32 像素/帧，精灵表水平排列帧
- **默认角色**：像素猫咪，包含 idle/walk/sleep/sit/react 五个动画

## 二、状态机

状态：`idle | walk | sleep | sit | drag | react`

| 当前状态 | 可转换到 | 触发条件 |
|---------|---------|---------|
| idle | walk(60%) / sleep(25%) / sit(15%) | 每 3-8 秒随机 |
| idle | react | 用户点击 |
| 任意 | drag | 用户拖拽 |
| walk/sleep/sit | idle | 动画/超时结束 |
| drag | idle | 拖拽结束 |
| react | idle | react 动画结束 |

- 拖拽打断所有状态；点击只打断 idle/sit
- 状态切换 → Animator.play(对应动画)

## 三、陪伴提醒

提醒配置在 manifest.json 中定义：

```json
"reminders": [
  { "interval": 3600, "message": "该喝水了！", "animation": "react" }
]
```

- interval 单位为秒，从应用启动时计时
- 到达间隔时触发 react 动画 + 像素气泡显示消息文本
- 气泡持续 5 秒后自行消失

## 四、交互

- **拖拽**：mousedown 记录偏移 → mousemove 通过 Tauri API 移动窗口 → mouseup 结束。位移 < 5px 视为点击而非拖拽
- **点击**：触发 react 动画
- **右键菜单**：Tauri 原生菜单 — 切换角色、设置缩放（1×/2×/3×）、退出

## 五、渲染系统

- **Renderer**：加载精灵表 Image，按帧索引 crop 绘制。整数倍缩放，窗口尺寸自动适配
- **Animator**：根据当前状态推进帧索引。循环动画无限播放；非循环动画结束后回到 idle
- **主循环**：`requestAnimationFrame` 驱动，仅状态变化时重绘
- **双缓冲**：离屏 Canvas 合成后整体绘制，避免闪烁
- **透明**：Tauri 窗口 `transparent: true`，Canvas 不绘制背景

动画配置格式：

```json
{
  "animations": {
    "idle":  { "start": 0, "end": 3, "fps": 4, "loop": true },
    "walk":  { "start": 4, "end": 7, "fps": 6, "loop": true },
    "sleep": { "start": 8, "end": 9, "fps": 2, "loop": true },
    "sit":   { "start": 10, "end": 11, "fps": 2, "loop": false },
    "react": { "start": 12, "end": 13, "fps": 8, "loop": false }
  }
}
```

## 六、角色插件系统

每个角色是一个目录，放在 `characters/` 下，包含：

```
<character-name>/
├── spritesheet.png    # 必须，32×32×N 帧水平排列
├── manifest.json      # 必须，元数据 + 动画配置 + 提醒配置
└── behaviors.js       # 可选，自定义状态/转换规则
```

**manifest.json 完整结构**：

```json
{
  "name": "cat",
  "displayName": "小猫咪",
  "version": "1.0.0",
  "author": "",
  "frameWidth": 32,
  "frameHeight": 32,
  "animations": { },
  "defaultState": "idle",
  "scale": 2,
  "reminders": [],
  "behaviorOverrides": "behaviors.js"
}
```

**Loader 行为**：

1. 启动时扫描 `characters/` 目录
2. 校验 manifest.json 必填字段
3. 校验 spritesheet.png 存在且宽度 = frameWidth × 总帧数
4. 校验失败的跳过并打印警告，不影响主程序运行
5. behaviorOverrides 脚本通过动态 `import()` 加载，调用 `register(engine, manifest)` 注入自定义逻辑

**自定义行为脚本接口**：

```ts
interface BehaviorScript {
  register(engine: BehaviorEngine, manifest: CharacterManifest): void;
}
```

`engine` 暴露 `addState()` 和 `addTransition()` 供脚本扩展。

## 七、目录结构

```
desktop-pet/
├── src-tauri/               # Rust 后端
│   └── src/main.rs          # 窗口创建：无边框、透明、置顶
├── src/                     # TypeScript 前端
│   ├── main.ts              # 入口
│   ├── app.ts               # 初始化调度
│   ├── engine/
│   │   ├── renderer.ts      # Canvas 渲染
│   │   ├── animator.ts      # 帧动画控制
│   │   └── behavior.ts      # 状态机引擎
│   ├── plugins/
│   │   └── loader.ts        # 角色包加载与校验
│   ├── interactions.ts      # 拖拽、点击、右键
│   └── characters/
│       └── cat/             # 内置猫咪角色
│           ├── spritesheet.png
│           └── manifest.json
├── characters/              # 用户安装的第三方角色（gitignore，用户自行管理）
└── package.json
```

## 八、数据流

```
启动 → Loader 扫描 characters/ → 校验角色包 → 加载默认角色
  → 初始化 Renderer/Animator/BehaviorEngine
  → requestAnimationFrame 主循环:
      BehaviorEngine.tick()        # 检查定时/随机触发
        → emit('stateChange')
      Animator.play(state)
        → currentFrame 推进
      Renderer.draw(currentFrame)  # 离屏 Canvas → 显示 Canvas
      Interactions 事件处理器      # 独立事件监听
```

Rust 后端仅暴露两个接口给前端：
- `window.set_position(x, y)` — 拖拽移动窗口
- `window.inner_size()` — 获取窗口尺寸

## 九、错误处理

| 场景 | 处理 |
|------|------|
| 角色包无 manifest.json | 跳过，warn 目录名 |
| manifest.json 格式错误 | 跳过，warn 具体错误 |
| spritesheet.png 缺失或尺寸不匹配 | 跳过，warn |
| behaviors.js 加载/执行错误 | 跳过脚本，角色仍可正常使用 |
| Canvas 上下文获取失败 | 致命错误，弹窗提示用户 |
| Tauri API 调用失败 | log 错误，功能降级（如拖拽失效） |

## 十、测试策略

- **单元测试**：BehaviorEngine 状态转换逻辑、Loader 校验逻辑、Animator 帧推进
- **集成测试**：角色加载 → 行为运行 → 渲染输出的完整链路
- **不包含**：像素精灵的视觉回归测试（手工验收）
