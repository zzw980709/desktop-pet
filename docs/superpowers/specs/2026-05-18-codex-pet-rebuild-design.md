# Codex Pet Rebuild Design

## Goal

将当前桌宠项目完整重构为一套接近 Codex pet 的统一宠物运行时与资源协议，不再参考或兼容旧角色实现语义。

本次重构目标包括：

- 内置默认宠物重做为一只偏 Codex mascot 风格的猫咪
- 运行时状态语义统一为 9 个 Codex pet 状态
- 外部自定义宠物目录直接对齐 `~/.codex/pets/<pet-id>/pet.json + spritesheet.webp`
- `hatch-pet` 产物可被项目直接消费，无需二次转换或复制

## Non-Goals

- 不保留旧 `manifest.json + spritesheet.png` 角色格式兼容层
- 不保留旧 `sleep / sit / feed / alert` 产品动作语义
- 不编写旧角色到新角色的自动迁移脚本
- 不允许每个宠物自定义动画名称、行定义或帧布局协议

## Design Summary

项目切换到“固定运行时协议 + 统一 atlas 解释”的模式。

- 宠物包只声明身份信息和贴图路径
- 运行时统一解释 atlas 中 9 行的状态语义
- 内置默认猫作为无外部宠物时的兜底
- 外部宠物直接从 `~/.codex/pets` 发现并加载

这样可以保证：

- `hatch-pet` 输出可直接运行
- 所有宠物共享一致的状态机和交互语义
- 后续新增宠物时不需要再改运行时代码

## Resource Contract

### Built-in Pet

内置默认宠物放在仓库内：

```text
src/pets/codex-cat/
  pet.json
  spritesheet.webp
```

### External Pets

外部宠物直接扫描真实 Codex 目录：

```text
~/.codex/pets/<pet-id>/
  pet.json
  spritesheet.webp
```

### `pet.json`

运行时只要求最小字段集合：

```json
{
  "id": "codex-cat",
  "displayName": "Codex Cat",
  "description": "A compact mascot-style desktop cat.",
  "spritesheetPath": "spritesheet.webp"
}
```

字段约束：

- `id`: 非空字符串，作为宠物唯一标识
- `displayName`: 非空字符串，作为 UI 展示名
- `description`: 非空字符串，作为描述信息
- `spritesheetPath`: 指向宠物目录内的 `spritesheet.webp`

对于内置宠物，前端直接引用仓库内静态资源；对于外部宠物，Tauri 返回解析后的绝对路径并由前端转换为可加载 URL。

## Atlas Contract

atlas 布局由运行时固定解释，不允许宠物自行定义。

- 文件格式：`spritesheet.webp`
- 总尺寸：`1536x1872`
- 单格尺寸：`192x208`
- 网格布局：8 列 × 9 行

9 行状态固定为：

1. `idle`
2. `running-right`
3. `running-left`
4. `waving`
5. `jumping`
6. `failed`
7. `waiting`
8. `running`
9. `review`

每行帧数和取帧顺序由运行时常量定义，不由宠物包声明。这样运行时协议稳定，资源只负责满足该协议。

## Runtime Model

### State Set

运行时只保留以下状态：

- `idle`
- `running-right`
- `running-left`
- `waving`
- `jumping`
- `failed`
- `waiting`
- `running`
- `review`

拖拽不是宠物资源状态。拖拽期间运行时冻结当前帧，或回退为 `idle` 的静态展示，不要求 atlas 提供专门拖拽动画。

### State Behavior

- 默认进入 `idle`
- 点击宠物进入 `waving`
- 自主随机行为仅从 `idle` 分流到 `running-right`、`running-left`、`jumping`、`running`、`review`
- `waiting` 用于需要用户关注或确认的状态
- `failed` 用于失败、异常或负反馈
- 非循环动作播放完成后回到 `idle`

### No Semantic Adapter Layer

运行时不再存在旧状态名到新状态名的适配层。产品语义、菜单语义、状态机语义、贴图语义全部直接使用 Codex pet 状态名。

## UI And Interaction

右键菜单与交互入口改为新语义：

- `Wave`
- `Think`
- `Work`
- `Wait`
- `Jump`
- `Move Right`
- `Move Left`
- `Reset to Idle`
- `Switch Pet`

动作映射：

- `Wave` -> `waving`
- `Think` -> `review`
- `Work` -> `running`
- `Wait` -> `waiting`
- `Jump` -> `jumping`
- `Move Right` -> `running-right`
- `Move Left` -> `running-left`
- `Reset to Idle` -> `idle`

不再暴露旧的 `sleep / sit / talk / walk / feed` 行为。

## Loader Architecture

### Frontend

前端职责：

- 加载内置默认宠物清单
- 请求 Tauri 扫描外部宠物目录
- 校验 `pet.json`
- 加载 `spritesheet.webp`
- 校验 atlas 尺寸与网格契约

### Tauri

Rust 侧职责：

- 扫描 `~/.codex/pets/*`
- 读取各目录的 `pet.json`
- 解析并返回 `pet.json` 内容与 `spritesheet.webp` 绝对路径
- 过滤缺失文件的目录

Rust 不负责动画语义解释，只负责发现外部宠物包。

## Default Pet Art Direction

默认内置猫咪遵循以下方向：

- 偏 Codex mascot，而非像素猫
- 轮廓简洁、圆润、紧凑
- 高可读性，缩小后仍能看清脸部和姿态
- 工具型、助手型气质，避免过度写实或毛绒玩偶感
- 直接满足 `hatch-pet` 的 9 状态资源契约

## Testing Scope

### Unit Tests

重写或新增以下测试：

- `pet.json` 校验
- 内置宠物元数据解析
- 外部宠物记录解析
- `spritesheet.webp` 尺寸校验
- atlas 行列映射与帧索引逻辑
- 状态机只接受新的 9 状态
- 菜单 action 到状态的映射

### Integration Tests

覆盖以下场景：

- 没有外部宠物时，内置猫可正常启动
- 存在合法外部宠物时，可被发现并切换
- 非法 `pet.json` 被跳过
- 缺失 `spritesheet.webp` 被跳过
- atlas 尺寸错误时加载失败并给出告警

## Migration Strategy

采用一次性协议切换，不做双栈并存：

- 删除旧内置角色协议假设
- 替换为新的内置 Codex mascot 猫
- 外部目录统一切换到 `~/.codex/pets`
- 更新测试到新协议

这是一次有意的“重构式替换”，不是平滑兼容迁移。

## Implementation Areas

预计会修改或新增这些区域：

- `src/types.ts`
- `src/app.ts`
- `src/engine/behavior.ts`
- `src/engine/loader.ts`
- `src/ui/contextmenu.ts`
- `src/characters/` 或重组为 `src/pets/`
- `src-tauri/src/lib.rs`
- 对应测试文件
- 新的内置 `pet.json` 与 `spritesheet.webp`

## Risks And Decisions

### Fixed Atlas Semantics

决定采用固定 atlas 语义而不是宠物自描述动画布局。这样会降低单只宠物的自由度，但显著提升运行时稳定性和可维护性，符合本项目“统一桌宠协议”的目标。

### No Legacy Compatibility

决定不兼容旧角色格式。短期会增加改动面，但能避免长期维护状态适配层和双协议测试负担。

### External Directory Dependency

决定直接读取 `~/.codex/pets`。这让项目与 `hatch-pet` 和真实 Codex pet 目录天然对齐；内置默认猫用于覆盖“目录不存在或为空”的情况。

## Acceptance Criteria

- 项目能在无外部宠物时使用内置默认猫正常运行
- 项目能从 `~/.codex/pets` 发现合法外部宠物
- 运行时只使用新的 9 状态语义
- 右键菜单只暴露新动作集合
- 新默认猫使用 `pet.json + spritesheet.webp` 契约
- 不再依赖旧 `manifest.json + spritesheet.png` 结构
- 测试覆盖新加载协议、状态机、菜单映射和基础集成流程
