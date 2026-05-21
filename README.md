# Desktop Pet

Tauri v2 桌面宠物应用 — 一只会陪你写代码、实时反应编程行为的像素宠物。

## 功能特性

### 核心体验
- **透明置顶窗口** — 64×64 像素艺术宠物，悬浮于所有窗口之上，不遮挡任务栏
- **拖拽移动** — 鼠标拖拽宠物到屏幕任意位置，位置自动保存
- **点击交互** — 点击宠物触发不同反应（配置 AI 后点击打开聊天窗口）
- **多状态动画** — idle（呼吸）、walking（行走）、running（快跑）、waving（挥手）、jumping（跳跃）、failed（摔倒）、waiting（等待）、review（思考）

### AI 对话
- **宠物聊天** — 点击宠物打开聊天窗口（需先配置 AI），支持紧凑模式和完整模式切换
- **流式输出** — 完整模式下 AI 回复逐字显示
- **个性化人设** — 可自定义系统 Prompt，让宠物拥有独特性格
- **空闲自动说话** — 宠物在空闲时偶尔冒一句话（可配置间隔和开关）
- **每只宠物独立会话** — 切换宠物后聊天记录独立，互不干扰

### Claude Code 集成（CC Hooks）
- **一键安装/卸载** — 在 AI 设置中一键安装 CC Hooks 到 `~/.claude/hooks/`
- **实时编程反应** — 宠物能感知你的编程行为并做出反应：

| Hook 事件 | 触发时机 | 宠物反应 | 气泡提示 |
|-----------|---------|---------|---------|
| UserPromptSubmit | 你向 Claude 提问 | review（思考状） | "Thinking..." |
| PostToolUse (Bash) | 运行命令行 | running（快跑） | "Running command..." |
| PostToolUse (Edit) | 编辑代码 | review（审视） | "Editing code..." |
| PostToolUse (Write) | 写入文件 | running | "Writing file..." |
| PostToolUse (WebFetch) | 浏览网页 | review | "Browsing..." |
| PermissionRequest | 等待授权 | waiting（等待状） | "Waiting..." |
| PostCompact | 上下文压缩 | failed（摔倒） | "Compacted" |
| SessionEnd | 任务完成 | waving（挥手） | "Done!" |

- **AI 驱动反应文本** — 配置 AI 后，气泡文本由 AI 实时生成（如"主人又在写bug了喵~"），未配置则使用预设文本
- **非侵入式** — 备份原始 `settings.json`，卸载时自动恢复

### 宠物管理
- **内置宠物** — 默认附带小猫 "cat"，开箱即用
- **Petdex 生态兼容** — 自动发现 `~/.petdex/pets/` 目录下的宠物包，无需手动导入
- **目录导入** — 支持从 Petdex 目录（含 `pet.json` + `spritesheet.webp`）一键导入
- **单文件导入** — 支持直接选择精灵图文件导入，输入名称即可添加
- **精灵图格式自动识别** — 根据宠物来源自动匹配动画映射（`desktop-pet` 和 `petdex` 两套行映射），petdex 宠物自动使用 petdex 行布局
- **多宠物切换** — 菜单栏一键切换宠物，各自独立状态
- **宠物删除** — 导入的宠物支持删除（内置猫不可删除）

### 持久化
- **SQLite 存储** — 偏好设置、AI 配置、聊天记录均存入 SQLite
- **窗口位置记忆** — 关闭/重启后宠物回到原位
- **迁移兼容** — 自动从旧版 `preferences.json` 迁移数据

## 快速开始

### 环境要求
- Node.js 18+
- Rust 工具链（[rustup](https://rustup.rs/)）
- macOS / Windows / Linux

### 安装运行

```bash
# 克隆仓库
git clone https://github.com/zzw980709/desktop-pet.git
cd desktop-pet

# 安装依赖
npm install

# 开发模式（热重载）
npm run tauri dev

# 生产构建
npm run tauri build

# 运行测试
npm test                      # 前端 vitest
cd src-tauri && cargo test    # Rust 测试
```

首次运行会在系统应用数据目录自动初始化内置宠物猫，后续重启会记住你的设置。

## 使用指南

### 1. 配置 AI（可选但推荐）

点击菜单栏 **管理 → AI 设置**，或点击宠物弹出聊天窗口后按提示打开设置。

| 配置项 | 说明 | 默认值 |
|-------|------|--------|
| API Key | AI 服务密钥（必填） | - |
| Base URL | API 端点地址 | `https://api.deepseek.com` |
| 模型 | 模型名称 | `DeepSeek-V3` |
| 人设 Prompt | 宠物性格描述 | "你是一只可爱的桌面宠物猫…" |
| 空闲说话 | 开启/关闭自动冒泡 | 开启 |
| 说话间隔 | 空闲说话间隔（秒） | 300 |

支持 DeepSeek API 及所有兼容 OpenAI 接口的服务（如 OpenAI、通义千问、智谱等）。

### 2. 安装 CC Hooks

1. 确保已配置 AI（需要 AI 生成个性化反应文本，未配置则使用默认文本）
2. 在 AI 设置窗口点击 **安装 CC Hooks**
3. 安装后 Claude Code 的 hooks 即生效，宠物会实时反应
4. 如需卸载，点击 **卸载 CC Hooks**，自动恢复原有配置

> 安装时的备份文件位于 `~/.claude/settings.json.desktop-pet.bak`

### 3. 添加宠物

#### 方式一：导入 Petdex 宠物包

1. 将 Petdex 宠物包放入 `~/.petdex/pets/` 目录（应用自动发现），或通过菜单栏 **宠物 → 添加宠物** 手动选择目录
2. 目录需包含 `pet.json`（元信息）和 `spritesheet.webp`（精灵图）
3. 应用自动识别 petdex 格式并使用正确的动画行映射

#### 方式二：直接上传精灵图

1. 菜单栏 **宠物 → 添加宠物**，切换到"上传精灵图"标签
2. 选择 `.webp` 或 `.png` 精灵图文件
3. 输入宠物名称，确认添加
4. 精灵图要求：8 列网格，192×208px 单元，宽度 1536px，高度为 208px 的整倍数（最低 8 行）

#### Petdex 自动发现

应用启动时自动扫描 `~/.petdex/pets/` 目录，所有格式正确的宠物包将自动出现在宠物菜单中，无需手动导入。应用自有宠物优先，同名时以应用内宠物为准。

### 4. 与宠物互动

| 操作 | 效果 |
|------|------|
| **拖拽** | 移动宠物位置 |
| **点击** | 配置 AI 后打开聊天窗口；未配置时触发随机动画 |
| **菜单切换宠物** | 切换到其他宠物，聊天记录独立 |
| **菜单手动状态** | 手动触发特定动画（挥手/跳跃/摔倒等） |

### 5. 聊天窗口

- **紧凑模式**（默认 340×440）— 单次问答，点击发送或 Enter 提交
- **完整模式**（480×600）— 展开后显示对话历史侧边栏、支持流式输出、可新建会话
- 点击 ⊕ 按钮或 ✕ 可切换/关闭窗口

## 精灵图格式

### Desktop Pet 格式（自有宠物）

`spritesheet.webp` — 8 列网格，192×208 px 单元。宽度 1536px，高度为 208px 的整倍数（最低 8 行，最多 11 行）。

| 行 | 状态 | 说明 |
|----|------|------|
| 0 | idle | 呼吸待机，6 帧循环 |
| 1 | running-right | 向右行走，8 帧循环 |
| 2 | running-left | 向左行走，8 帧循环 |
| 3 | waving | 挥手，4 帧不循环 |
| 4 | jumping | 跳跃，5 帧不循环 |
| 5 | failed | 摔倒，8 帧不循环 |
| 6 | waiting | 焦急等待，6 帧循环 |
| 7 | running | 快速奔跑，6 帧循环 |
| 8 | review | 审视思考，6 帧循环 |

### Petdex 格式（第三方生态）

应用自动识别 petdex 来源的宠物，使用以下行映射（与 desktop-pet 不同）：

| 行 | Petdex 状态 | → | 桌面宠物状态 | 帧数 |
|----|-----------|----|-----------|------|
| 0 | idle | → | idle | 6 帧 |
| 1 | wave | → | waving | 8 帧 |
| 2 | run | → | running / running-right | 8 帧 |
| 2 | run (镜像) | → | running-left | 8 帧（水平翻转） |
| 3 | failed | → | failed | 4 帧 |
| 4 | review | → | review | 5 帧 |
| 5 | jump | → | jumping | 8 帧 |
| 6 | extra1 | → | waiting | 6 帧 |

> 格式检测基于**来源路径**自动判定，无需手动配置。`~/.petdex/pets/` 下的宠物自动使用 petdex 映射。

## 项目架构

```
src/                         # 前端 (TypeScript + Vite)
  main.ts                   入口
  app.ts                    运行时（渲染循环、事件处理、菜单分发）
  interactions.ts           点击/拖拽处理
  types.ts                  共享类型定义
  ai-settings-main.ts       AI 设置窗口逻辑
  chat-main.ts              聊天窗口逻辑
  bubble-main.ts            气泡提示窗口逻辑
  pet-import-main.ts        宠物导入窗口逻辑
  engine/
    animator.ts             精灵帧动画（双格式支持）
    behavior.ts             空闲计时 + 随机动作状态机
    loader.ts               宠物加载 + 格式校验
    renderer.ts             Canvas 2D 像素渲染（含水平翻转）
  pets/
    contract.ts             图集几何常量 + manifest 校验
    catalog.ts              宠物发现 + 格式检测
  ai/
    chat.ts                 聊天历史管理
  ui/
    appmenu.ts              macOS 原生菜单栏
    menu-model.ts           菜单 action 类型

src-tauri/src/               # 后端 (Rust)
  lib.rs                    Tauri 命令、SQLite、CC Hooks 管理、宠物导入
  ai.rs                     AI API 调用（DeepSeek + OpenAI 兼容）
  cc_hooks.rs               CC Hook HTTP 服务器（127.0.0.1:18920）
  pets.rs                   宠物文件系统发现 + 精灵图尺寸解析

src-tauri/resources/         # 内置资源
  cat/                      内置猫宠物（pet.json + spritesheet.webp）
```

## 技术栈

- **框架**: Tauri v2（Rust + WebView）
- **前端**: TypeScript + Vite + Canvas 2D
- **存储**: SQLite (rusqlite)
- **AI**: DeepSeek API / OpenAI 兼容接口，支持流式输出
- **CC 集成**: HTTP Server (tiny_http) 接收 Hook 事件 → Tauri Event 通知前端

## 开发命令

| 命令 | 说明 |
|------|------|
| `npm run tauri dev` | 开发模式（Vite + Tauri 窗口） |
| `npm run tauri build` | 生产构建 |
| `npm test` | 前端测试（vitest, 79 个用例） |
| `npx tsc --noEmit` | TypeScript 类型检查 |
| `cd src-tauri && cargo check` | Rust 编译检查 |
| `cd src-tauri && cargo test` | Rust 测试（14 个用例） |

## License

MIT
