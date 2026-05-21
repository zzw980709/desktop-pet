# Settings & Menu Redesign

## Summary

重构菜单结构（"管理"→"设置"），集成 AI 设置、宠物人设、添加宠物、CC Hooks 到一个统一的设置窗口，支持多 API Key 管理和每只宠物独立人设。

## Motivation

当前菜单"管理"过于单薄，AI 设置和 CC Hooks 挤在一个窗口，缺少多服务商 Key 支持和每只宠物独立 system prompt。需要让应用更接近成熟作品的体验。

## Design Preview

原型文件：`design-preview.html`（Catppuccin Mocha 配色，已在浏览器中确认）

## Menu Structure

```
桌面宠物              编辑                 设置
├── 当前宠物：小橘      ├── 撤销 ⌘Z        ├── 🤖 AI 设置 ⌘,
│   (cat)             ├── 重做 ⌘⇧Z      ├── ✨ 宠物人设
├── ─────────         ├── ─────────       ├── ─────────
├── 状态动作            ├── 剪切 ⌘X         ├── ➕ 添加宠物
│   ├── 挥手 👋        ├── 复制 ⌘C         ├── ─────────
│   ├── 思考 💭        ├── 粘贴 ⌘V         ├── 🪝 CC Hooks  ●
│   ├── 工作 ⚡        └── 全选 ⌘A         └── ─────────
│   ├── 等待 ⏳                             └── 🗑 移除 "小橘"
│   ├── 跳跃 🦘
│   ├── 向右 ➡️
│   ├── 向左 ⬅️
│   └── 重置 🔄
├── ─────────
└── 切换宠物
    ├── ● 小橘 🐱
    ├── Boba 🐶
    └── Pixel Frog 🐸
```

变化：
- "动作"菜单合并到"桌面宠物"下，"管理"→"设置"
- 菜单栏右侧显示 CC Hooks 状态指示灯
- "移除宠物"仅在非内置宠物时显示，操作前需确认

## Settings Window

统一设置窗口（540×640，4 个标签页），通过菜单栏"设置"或 ⌘, 快捷键打开。

### Tab 1: AI 设置

**多 API Key 卡片列表：**

每张 Key 卡片包含：
- 服务商名称（DeepSeek / OpenAI / Anthropic / 自定义）
- 默认标记（★），只有一组为默认
- API Key（密码输入，可切换显示/隐藏）
- Base URL（自定义端点）
- 默认模型：**combo box**（提供预设选项 + 允许自由输入）— 如 DeepSeek 预设 DeepSeek-V3、DeepSeek-R1、deepseek-chat，用户可输入任意模型名
- 操作按钮：★ 设默认 / ✕ 删除

约束：
- 默认 Key 不可删除（至少保留一组）
- 删除前如果只有一组 Key，按钮 disabled
- 底部"+ 添加 API Key"按钮，弹出服务商选择后创建新卡片

**空闲说话设置（全局）：**
- 开关 toggle
- 间隔时间（秒）

底部按钮：测试全部连接 / 保存设置

### Tab 2: 宠物人设

- 宠物选择列表（卡片式，选中高亮边框，显示宠物 emoji + 名称 + 当前使用的 Key 服务商标签）
- 选择使用的 API Key（下拉，列出所有已配置的 Key，默认使用"默认 Key"）
- 模型覆盖（combo box，可选，留空则使用该 Key 的默认模型）
- 人设 Prompt（textarea，显示字符计数，可重置默认）
- 切换宠物时自动加载该宠物的人设，保存时只保存当前选中宠物

每只宠物有独立的：api_key_id（引用）、model_override（可选）、system_prompt。

### Tab 3: 添加宠物

双模式标签切换（与现有逻辑一致）：
- Petdex 目录导入：选择目录 → 读取 pet.json 预览 → 确认导入
- 精灵图上传：选择文件 → 输入名称 → 验证尺寸 → 确认添加

### Tab 4: CC Hooks

- 安装状态指示（绿色圆点 + "已安装"，灰色 + "未安装"）
- 安装路径显示
- Hook 事件映射表（事件 → 宠物反应 → 气泡文本）
- 安装/卸载按钮（已安装时显示"卸载"，未安装时显示"安装"）

## Data Model

### New Tables

```sql
CREATE TABLE api_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider TEXT NOT NULL DEFAULT '',
    api_key TEXT NOT NULL DEFAULT '',
    base_url TEXT NOT NULL DEFAULT '',
    default_model TEXT NOT NULL DEFAULT '',
    is_default INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE pet_personas (
    pet_id TEXT PRIMARY KEY,
    api_key_id INTEGER,
    model_override TEXT NOT NULL DEFAULT '',
    system_prompt TEXT NOT NULL DEFAULT '',
    FOREIGN KEY (api_key_id) REFERENCES api_keys(id)
);
```

### Migration from existing ai_config

1. 读取现有 `ai_config` 单行记录（api_key, base_url, model, system_prompt）
2. 创建 `api_keys` 表，将旧 Key 数据插入为第一行（provider='Default', is_default=1）
3. 创建 `pet_personas` 表，为 'cat' 宠物插入旧 system_prompt
4. 保留 `ai_config` 表，仅使用 idle_chat_enabled 和 idle_chat_interval 字段
5. 旧字段（api_key, base_url, model, system_prompt）在 ai_config 中保留但不再读取

### ai_config table (simplified)

保留 `ai_config` 表但仅维护全局设置：
- `idle_chat_enabled` — 空闲说话开关
- `idle_chat_interval` — 说话间隔（秒）

`api_key`, `base_url`, `model`, `system_prompt` 迁移后不再使用。

## Rust Commands

### New / Modified Commands

| Command | Change | Description |
|---------|--------|-------------|
| `get_ai_config` | modified | 返回 api_keys 列表 + 空闲设置，不再返回单组 key |
| `set_ai_config` | modified | 保存 api_keys 列表 + 空闲设置 |
| `get_pet_persona` | new | 根据 pet_id 返回人设配置 |
| `set_pet_persona` | new | 保存某只宠物的人设配置 |
| `get_all_personas` | new | 返回所有宠物的人设（用于设置面板初始化） |
| `test_ai_connection` | modified | 接受 api_key + base_url + model 参数（而非完整 config） |
| `chat_with_pet` | modified | 根据 pet_id 查找对应 api_key + model |
| `chat_with_pet_stream` | modified | 同上 |
| `generate_event_reaction` | modified | 根据 active_pet_id 查找对应 api_key + model |

### DB Access Pattern

AI 对话时获取 pet 的配置：
```
pet_personas.pet_id → api_key_id → api_keys 行（获取 key, base_url）
                 → model_override (非空则用，否则用 api_keys.default_model)
                 → system_prompt
若 pet 无 persona 记录 → 使用 is_default=1 的 api_key + 默认 system_prompt
```

## Frontend Changes

| File | Change |
|------|--------|
| `src/ui/menu-model.ts` | 新增 `MenuAction` 类型 'openSettings'，'persona' |
| `src/ui/appmenu.ts` | 重构菜单结构（合并动作到桌面宠物，管理→设置），添加 CC Hooks 状态指示 |
| `src/app.ts` | `handleMenuAction` 新增 'openSettings' 和 'persona' 处理 |
| `src/ai-settings-main.ts` | 大幅重写：多 Key 卡片管理、空闲设置、标签页切换逻辑 |
| `ai-settings.html` | 重写为 4 标签页布局，新增 Key 卡片、combo box、宠物选择卡片样式 |
| `src/ai/chat.ts` | `buildMessages` 接受 `petId` 参数查找对应 system_prompt |
| `src/chat-main.ts` | 已支持 per-pet（前次迭代），无需改动 |
| `src/types.ts` | 新增 `ApiKeyEntry`, `PetPersona` 类型 |

## Verification

1. `npx tsc --noEmit` — TypeScript 类型检查通过
2. `cd src-tauri && cargo check` — Rust 编译通过
3. `cd src-tauri && cargo test` — 所有 Rust 测试通过
4. `npm test` — 所有前端 vitest 测试通过
5. `npm run tauri dev` — 手动验证：
   - 菜单结构符合设计
   - CC Hooks 状态指示灯正确
   - 设置窗口 4 标签页切换正常
   - 添加/删除/切换默认 Key 正常工作
   - 删除最后一组 Key 被阻止
   - Combo box 可选预设也可自由输入
   - 每只宠物独立的 system_prompt 保存和加载
   - 切换宠物后 AI 对话使用对应 Key + 人设
   - 空闲说话使用当前宠物的配置

## Not in Scope

- CC Hooks 事件自定义（本次不改）
- 宠物元信息（pet.json）中的默认人设字段
- 聊天记录跨设备同步
- Key 使用量统计/计费显示
