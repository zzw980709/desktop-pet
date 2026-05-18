# Multi-Pet Config Design

## Goal

将桌面宠物项目从"单宠物 + 扫描外部目录"改为"内置多宠物支持 + 用户可添加/移除宠物 + 偏好持久化"。不改变运行时动画协议（仍为固定 9 状态 atlas 契约），只扩展宠物管理和配置能力。

## Non-Goals

- 不支持多只宠物同时显示
- 不支持宠物间交互
- 不改变 atlas 契约和状态机语义
- 不引入宠物自定义行为配置（idle 间隔、动画速度等仍为全局常量）

## Storage Architecture

所有宠物文件和配置统一存储在 Tauri 标准应用数据目录下。

```
<app_data_dir>/
  preferences.json
  pets/
    cat/                    # 内置宠物（首次启动写入）
      pet.json
      spritesheet.webp
    <user-pet-id>/          # 用户导入的宠物
      pet.json
      spritesheet.webp
```

- app_data_dir 由 Tauri 的 `app.path().app_data_dir()` 解析
- 应用 identifier 改为 `com.desktop-pet.app`

### preferences.json

```json
{
  "activePetId": "cat",
  "windowPosition": { "x": 800, "y": 400 }
}
```

仅持久化当前激活宠物 ID 和窗口位置。首次启动无文件时默认 `activePetId: "cat"`，窗口居中。

### 初始化

首次启动（`preferences.json` 不存在）时：
1. Tauri `setup()` 将内置 `cat` 宠物从 bundle 资源复制到 `<app_data>/pets/cat/`
2. 写入默认 `preferences.json`
3. 前端通过 `discover_pets` 扫描 `<app_data>/pets/` 获取列表

## Pet Catalog Changes

- 宠物来源不再区分 `built-in` / `user`，统一从 `<app_data>/pets/` 扫描
- `PetCatalogEntry.source` 类型改为 `'built-in' | 'user'`，用于标记是否可删除
- 内置宠物 id 列表硬编码为 `['cat']`，匹配时 `removable: false`
- 前端 `catalog.ts` 不再引用 bundle 内的静态资源，统一走 Tauri 路径

## Add Pet Flow

**入口**：右键菜单和原生 App Menu 中的"添加宠物..."

**流程**：
1. Tauri 弹出原生文件选择对话框，过滤为 `pet.json`
2. 检查同目录下是否存在 `spritesheet.webp`
3. 校验 `pet.json` 格式（复用 `validatePetManifest`）
4. 校验 spritesheet 尺寸是否为预期的 `1536x1872`
5. 通过后复制 `pet.json` + `spritesheet.webp` 到 `<app_data>/pets/<pet-id>/`
6. id 冲突时提示是否覆盖
7. 前端刷新宠物列表
8. 任一校验失败弹出错误提示

**错误提示**：
- pet.json 格式错误 → "无效的 pet.json"，列出具体字段问题
- spritesheet 尺寸不符 → "精灵表尺寸不符"，列出期望 vs 实际
- 缺少 spritesheet.webp → "缺少文件：spritesheet.webp"

## Remove Pet Flow

**入口**：右键菜单和原生 App Menu 中，选中用户添加的宠物时显示"移除 xxx"

**规则**：
- 内置宠物（cat）不可移除
- 当前激活的宠物不可移除
- 移除后如果当前列表变空，自动回退到内置 cat

## UI Changes

所有菜单文案更新为中文。

### 右键菜单结构

```
┌─────────────────────┐
│ 桌面宠物              │
│ 小猫                  │
├─────────────────────┤
│ 动作                  │
│   挥手                │
│   思考                │
│   工作                │
│   等待                │
│   跳跃                │
│   向右移动             │
│   向左移动             │
│   重置                │
├─────────────────────┤
│ 切换宠物              │
│ ● 小猫                │
│ ○ my-pet             │
├─────────────────────┤
│ 添加宠物...           │
│ 移除 "my-pet"        │
└─────────────────────┘
```

### 动作标签映射

| 中文 | 状态 |
|------|------|
| 挥手 | `waving` |
| 思考 | `review` |
| 工作 | `running` |
| 等待 | `waiting` |
| 跳跃 | `jumping` |
| 向右移动 | `running-right` |
| 向左移动 | `running-left` |
| 重置 | `idle` |

### 原生 App Menu

macOS 菜单栏同步上述结构。

## Built-in Pet Rename

内置宠物 `codex-cat` 重命名为 `cat`：
- 目录 `src/pets/codex-cat/` → `src/pets/cat/`
- `pet.json`: `id: "cat"`, `displayName: "小猫"`, `description: "默认桌面宠物猫"`

## Implementation Areas

| 文件 | 改动 |
|------|------|
| `src-tauri/tauri.conf.json` | identifier 改为 `com.desktop-pet.app` |
| `src-tauri/Cargo.toml` | 新增 `tauri-plugin-dialog` 依赖 |
| `src-tauri/src/lib.rs` | 新增 `add_pet`、`remove_pet`、`load_preferences`、`save_preferences` 命令；setup 中复制内置 cat 到 app_data |
| `src-tauri/src/pets.rs` | 微调 discover 接口 |
| `src/pets/codex-cat/` → `src/pets/cat/` | 目录重命名，pet.json 更新 |
| `src/pets/catalog.ts` | 统一扫描 app_data/pets；硬编码内置 pet id 列表判断 `removable` |
| `src/types.ts` | 新增 `Preferences` 类型；`PetCatalogEntry` 加 `removable: boolean` |
| `src/ui/menu-model.ts` | 中文化标签；新增 `addPet`/`removePet` action 类型 |
| `src/ui/contextmenu.ts` | 中文化；渲染 Add Pet / Remove Pet / 来源标记 |
| `src/ui/appmenu.ts` | 中文化；Add Pet / Remove Pet 菜单项 |
| `src/app.ts` | 启动时读 preferences、恢复宠物和位置；写 preferences；处理 add/remove pet 动作 |
| 测试文件 | 跟进更新 |

## Data Flow

```
首次启动:
  Tauri setup() → 内置 cat 复制到 app_data/pets/cat/
                → 写 preferences.json { activePetId: "cat" }
  Frontend → discover_pets() → 扫描 app_data/pets/
           → load_preferences() → 恢复 activePetId

正常启动:
  Frontend → discover_pets() + load_preferences()
           → 恢复上次宠物 + 窗口位置

添加宠物:
  点击"添加宠物..." → Tauri 文件选择对话框
  → 校验文件完整性 + 尺寸 → 复制到 app_data/pets/<id>/
  → 刷新列表

移除宠物:
  点击"移除 xxx" → Tauri 删除 app_data/pets/<id>/
  → 刷新列表
```

## Acceptance Criteria

- 内置宠物 `cat` 首次启动后出现在 app_data 目录
- 应用可从 preferences.json 恢复上次的宠物和窗口位置
- 菜单中可添加宠物（通过文件对话框选择 pet.json）
- 添加时校验 pet.json 格式和 spritesheet 尺寸，校验失败有中文错误提示
- 用户导入的宠物可被移除，内置 cat 不可移除
- 当前激活的宠物不可被移除
- 所有菜单文案为中文
- `com.desktop-pet.app` 替代个人化 identifier
- 测试覆盖新命令和变更的模块
