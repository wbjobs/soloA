# Kerning Adjuster - 字体字距校准工具

一个跨平台的桌面应用程序，用于批量校准字体的字距调整（Kerning）。

## 功能特性

### 核心功能
- **字体解析**: 使用 FreeType 库解析 TrueType (.ttf) 和 OpenType (.otf) 字体
- **字距读取**: 自动读取字体中已有的 kerning 表信息
- **批量校准**: 支持单个字符对调整和批量处理
- **实时预览**: 三种预览模式（上下对比、叠加对比、差异对比）
- **多字体管理**: 支持导入字体文件夹，批量管理多个字体
- **撤销/重做**: 完整的历史记录管理，支持最多 50 步操作

### 导出功能
- **JSON 格式**: 导出完整的字距数据，便于交换和备份
- **CSV 格式**: 导出为表格格式，便于在电子表格中查看和编辑
- **字体导出**: 复制字体文件并生成配套的字距数据文件

### 用户界面
- **字体列表**: 左侧面板显示所有已加载的字体
- **字距表格**: 详细的字距对数据，支持筛选、排序、编辑
- **预览区域**: 实时查看调整前后的对比效果
- **配置管理**: 保存用户偏好设置和最近打开的目录

## 项目结构

```
KerningAdjuster/
├── CMakeLists.txt          # CMake 构建配置
├── vcpkg.json              # vcpkg 依赖清单
├── src/
│   ├── main.cpp            # 程序入口
│   ├── core/               # 核心模块
│   │   ├── FontParser.h/cpp    # 字体解析（FreeType）
│   │   ├── KerningPair.h/cpp   # 字距对数据结构
│   │   ├── KerningAdjuster.h/cpp  # 字距调整逻辑
│   │   ├── FontManager.h/cpp   # 字体管理
│   │   └── HistoryManager.h/cpp # 历史记录（撤销/重做）
│   ├── render/             # 渲染模块
│   │   ├── FontRenderer.h/cpp  # 字体渲染引擎
│   │   └── PreviewRenderer.h/cpp # 预览对比渲染
│   ├── io/                 # IO 模块
│   │   ├── Exporter.h/cpp      # 导出器（JSON/CSV/字体）
│   │   └── ConfigManager.h/cpp # 配置管理
│   └── ui/                 # UI 模块
│       ├── MainWindow.h/cpp    # 主窗口
│       ├── FontListWidget.h/cpp # 字体列表控件
│       ├── KerningTableWidget.h/cpp # 字距表格控件
│       ├── PreviewWidget.h/cpp  # 预览控件
│       └── SettingsDialog.h/cpp # 设置对话框
└── third_party/            # 第三方库（可选）
    └── json/               # nlohmann/json（如未使用 vcpkg）
```

## 构建说明

### 依赖项
- **Qt 5.15+**: 图形用户界面框架
- **FreeType 2**: 字体解析和渲染库
- **nlohmann/json**: JSON 序列化库
- **CMake 3.16+**: 构建系统

### 使用 vcpkg（推荐）

1. 安装 vcpkg：
```bash
git clone https://github.com/microsoft/vcpkg.git
cd vcpkg
./bootstrap-vcpkg.bat  # Windows
# ./bootstrap-vcpkg.sh  # Linux/macOS
```

2. 安装依赖：
```bash
vcpkg install qt5-base freetype nlohmann-json
```

3. 配置和构建：
```bash
mkdir build
cd build
cmake .. -DCMAKE_TOOLCHAIN_FILE=[vcpkg根目录]/scripts/buildsystems/vcpkg.cmake
cmake --build . --config Release
```

### 不使用 vcpkg

1. 手动安装 Qt 5.15+
2. 安装 FreeType 开发库
3. 下载 nlohmann/json 头文件库到 `third_party/json` 目录：
```bash
mkdir -p third_party/json/include/nlohmann
# 下载 json.hpp 到该目录
```

4. 配置和构建：
```bash
mkdir build
cd build
cmake .. -DCMAKE_PREFIX_PATH=[Qt安装路径]
cmake --build . --config Release
```

### Windows 特定说明

确保在构建前设置好环境变量，或使用 Qt Creator 打开 CMakeLists.txt 进行构建。

## 使用指南

### 快速开始

1. **打开字体**: 
   - 点击 "文件" → "打开字体" 选择单个字体文件
   - 或点击 "打开字体文件夹" 批量加载整个目录

2. **调整字距**:
   - 在左侧字体列表中选择要编辑的字体
   - 在中间的字距表格中查看所有字距对
   - 双击当前值单元格进行编辑，或使用底部的 +/- 按钮批量调整

3. **预览效果**:
   - 底部预览区域实时显示调整效果
   - 可修改预览文本、字号和对比模式

4. **导出结果**:
   - 点击 "文件" → "导出" → "导出为 JSON" 保存修改
   - 或导出为 CSV 格式用 Excel 查看

### 快捷键

- `Ctrl+O`: 打开字体文件
- `Ctrl+Shift+O`: 打开字体文件夹
- `Ctrl+S`: 导出为 JSON
- `Ctrl+Z`: 撤销
- `Ctrl+Y` 或 `Ctrl+Shift+Z`: 重做
- `Ctrl+Q`: 退出

## 技术细节

### 字距单位
- 字距值使用字体单位（font units），不是像素
- 转换为像素：`pixel_kerning = kerning_value * font_size / units_per_em`

### 支持的字体格式
- TrueType (.ttf)
- OpenType (.otf)
- TrueType Collection (.ttc) - 仅第一个字体

### 字距数据
- 支持格式 0 kerning 表（最常见）
- 自动检测并解析所有非零字距对
- 可添加新的字距对（原字体中不存在的）

## 许可证

MIT License

## 贡献

欢迎提交 Issue 和 Pull Request！
