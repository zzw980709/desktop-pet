# Spec: 简化宠物添加流程

## 目标

用户只需选择一个精灵图文件，输入宠物名称，系统自动生成 pet.json 并完成添加。完全替代现有的"选择 pet.json + spritesheet.webp"流程。

## 设计

### 新增流程

1. 用户点击原生菜单"添加宠物..."
2. 弹出文件选择对话框（图片文件：webp/png）
3. 验证精灵表尺寸（宽度 1536px，高度 208px 倍数且 ≥ 1872px）
4. 显示 HTML modal，让用户输入宠物名称
5. 系统自动生成 pet id（名称小写 + 空格转连字符 + 去特殊字符）
6. 系统自动生成 pet.json，复制精灵表到应用数据目录
7. 刷新宠物列表

### 涉及文件

- `index.html` — 新增宠物导入 modal 的 HTML 和 CSS
- `src/app.ts` — `addPet` 菜单处理改为：打开文件对话框 → 验证 → 显示 modal → 调用 Rust 命令
- `src-tauri/src/lib.rs` — 替换 `add_pet` 命令为 `add_pet_from_spritesheet(source_path, display_name)`，新增 `pick_spritesheet` 命令

### 移除

- 旧的 `add_pet` Rust 命令（选择 pet.json 流程）
- `AddPetResult` 类型，替换为新的

## 边界

- Always: 服务端验证精灵表尺寸（前端预检 + Rust 命令二次校验）
- Ask first: 无
- Never: 接受不符合尺寸要求的精灵表
