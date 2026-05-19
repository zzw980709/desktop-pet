# Robustness Design

## Goal

为桌面宠物项目添加三阶段防御体系（启动、宠物加载、运行时），确保应用在任何异常场景下都能优雅降级而非崩溃。同时引入结构化日志系统用于问题排查。

## Non-Goals

- 不包含设置面板 GUI
- 不包含打包/签名/分发
- 不包含自动更新
- 不包含崩溃报告/Analytics
- 不改变现有功能行为逻辑

## Logging System

Rust 侧引入 `tracing` + `tracing-subscriber` + `tracing-appender`：

- 输出目标：`app_data/logs/pet.log`（文件，滚动保留 5 个文件，每个最大 2MB）+ stdout
- 日志级别：环境变量 `RUST_LOG` 控制，默认 `info`
- 关键路径打 log：preferences 读写、宠物发现/加载/切换、spritesheet 加载、窗口操作
- TS 侧通过 `console.log`/`console.error` 输出，Tauri 会自动捕获

```rust
use tracing_subscriber::{fmt, prelude::*, EnvFilter};
use tracing_appender::rolling::RollingFileAppender;

fn init_logging(app_data: &PathBuf) {
    let log_dir = app_data.join("logs");
    let _ = std::fs::create_dir_all(&log_dir);
    let file_appender = RollingFileAppender::new(
        tracing_appender::rolling::Rotation::DAILY,
        log_dir,
        "pet.log",
    );
    let file_layer = fmt::layer()
        .with_ansi(false)
        .with_writer(file_appender);
    let stdout_layer = fmt::layer()
        .with_writer(std::io::stdout);
    let filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new("info"));
    tracing_subscriber::registry()
        .with(filter)
        .with(file_layer)
        .with(stdout_layer)
        .init();
}
```

## Three-Phase Defense

### Phase 1: Startup

| Scenario | Current | After |
|----------|---------|-------|
| preferences.json 不可解析 | 静默回退默认值 | warn 日志 + 备份损坏文件为 `preferences.json.bak` + 写入新默认值 |
| app_data 目录创建失败 | 吞掉错误 | error 日志 + 弹窗提示，阻止后续操作 |
| 内置 cat 资源 include 失败 | 编译时失败 | 不变（编译时保证资源存在） |
| 窗口位置超出屏幕 | 可能截断 | setup 后 clamp 到可见区域 |

### Phase 2: Pet Loading

| Scenario | Current | After |
|----------|---------|-------|
| pet.json 字段不完整 | 可能 panic | 缺失字段用默认值填充，warn 日志 |
| spritesheet 加载失败 | 空白渲染 | 纯色矩形占位（根据宠物主色调），error 日志，行为引擎暂停 |
| 切换宠物 mid-animation | 无保护 | 切换时停止当前引擎 + 清空渲染状态后再加载新宠物 |
| activePetId 指向已删除宠物 | 可能空屏 | 自动回退到第一个可用宠物，warn 日志 |
| 所有宠物都不可用 | N/A | 纯色无宠物提示，warn 日志 |

### Phase 3: Runtime

| Scenario | Current | After |
|----------|---------|-------|
| 渲染循环异常 | 窗口卡死 | requestAnimationFrame catch → skip 当前帧 + error 日志（限流 1 次/秒） |
| 行为引擎 panic | 宠物不动 | catch 后重置为 idle 状态 + error 日志 |
| 帧索引越界 | 拉伸/撕裂 | bounds check，越界 clamp 到合法范围 |

## Error Display Strategy

- **可恢复错误**（preferences 损坏、宠物加载失败）：控制台日志 + 不打断用户
- **不可恢复错误**（app_data 不可创建）：Rust 侧 `tauri::api::dialog` 弹窗
- 所有面向用户的中文文案简洁明确

## Cargo.toml Changes

```toml
[dependencies]
tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["env-filter"] }
tracing-appender = "0.2"
```

## Implementation Files

| File | Changes |
|------|---------|
| `src-tauri/Cargo.toml` | 新增 tracing 依赖 |
| `src-tauri/src/lib.rs` | 日志初始化、preferences 恢复逻辑、窗口位置 clamp、log 埋点 |
| `src-tauri/src/pets.rs` | 部分字段默认值处理、log 埋点 |
| `src/engine/renderer.ts` | 帧异常 catch |
| `src/engine/behavior.ts` | 状态机异常 catch + 回退 |
| `src/engine/animator.ts` | 帧索引 bounds check |
| `src/engine/loader.ts` | spritesheet 加载失败占位处理 |
| `src/app.ts` | 原子宠物切换、missing pet 回退 |

## Acceptance Criteria

- Preferences 损坏时自动备份并重建，应用正常启动
- 应用在所有已知异常场景下不会崩溃（white screen 或 panic）
- 日志文件正常写入 app_data/logs/
- 现有 67 TS + 7 Rust 测试全部通过
- 新增异常场景测试覆盖
