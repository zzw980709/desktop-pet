# Desktop Pet

Tauri v2 桌面宠物应用，一只会陪你写代码的像素小猫。

## 功能

- 透明置顶窗口，64×64 像素艺术小猫
- 拖拽移动、点击交互
- **AI 对话** — 点击宠物打开聊天窗口，支持紧凑/完整双模式、流式输出
- **Claude Code 集成** — 自动安装 CC Hooks，宠物实时反应你的编程行为（thinking、tool-use 等），显示气泡提示
- **空闲自动说话** — 配置 AI 后，宠物偶尔冒一句话
- 多宠物支持、SQLite 持久化

## 运行

```bash
npm install
npm run tauri dev    # 开发模式
npm run tauri build  # 生产构建
npm test             # 运行测试
```

## 架构

```
src/
  main.ts                 入口
  app.ts                  运行时（渲染循环、事件处理、菜单分发）
  interactions.ts         点击/拖拽处理
  types.ts                共享类型
  ai-settings-main.ts     AI 设置窗口逻辑
  chat-main.ts            聊天窗口逻辑
  bubble-main.ts          气泡窗口逻辑
  pet-import-main.ts      宠物导入窗口逻辑
  engine/
    animator.ts           精灵帧动画
    behavior.ts           空闲计时 + 随机动作状态机
    loader.ts             宠物加载
    renderer.ts           Canvas 2D 渲染
  pets/
    contract.ts           图集几何常量
    catalog.ts            宠物发现
  ai/
    chat.ts               聊天历史管理 + SQLite 持久化
  ui/
    appmenu.ts            macOS 菜单栏
    menu-model.ts         菜单 action 类型

src-tauri/src/
  lib.rs                  Tauri 命令、SQLite 初始化、CC Hooks 管理
  ai.rs                   DeepSeek API 调用
  cc_hooks.rs             CC Hook HTTP 服务器
  pets.rs                 宠物文件系统发现
```

## 精灵图集

`spritesheet.webp` — 8 列网格，192×208 px 单元。

| Row | State |
|-----|-------|
| 0 | idle |
| 1 | running-right |
| 2 | running-left |
| 3 | waving |
| 4 | jumping |
| 5 | failed |
| 6 | waiting |
| 7 | running |
| 8 | review |

## AI 配置

点击宠物 → 聊天窗口，或菜单栏 → 管理 → AI 设置。支持 DeepSeek API 及兼容 OpenAI 接口的服务。

配置项：API Key、Base URL、模型、人设 Prompt、空闲说话开关及间隔。

## CC Hooks 集成

在 AI 设置中一键安装/卸载 CC Hooks。安装后，宠物会在以下事件时展示反应：

| Hook 事件 | 宠物反应 |
|-----------|---------|
| UserPromptSubmit | 💭 Thinking... |
| PostToolUse (Bash/Edit/Write/WebFetch) | ⚡ 运行命令/编辑/写文件/浏览 |
| PostCompact | 📦 上下文压缩 |
| SessionEnd | ✅ 完成 |
