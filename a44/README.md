# CFD Platform - Pre & Post Processing Web Platform

一个完整的计算流体力学（CFD）预处理与后处理Web平台。

## 功能特性

### 后端 (Python FastAPI)
- **网格生成**: 集成 OpenFOAM 的 blockMesh 和 snappyHexMesh
- **求解器接口**: 支持 simpleFoam、pisoFoam、icoFoam 等求解器
- **数据解析**: 使用 NumPy/SciPy 解析 foamData 格式
- **实时监控**: WebSocket 推送求解器残差
- **任务调度**: 异步任务执行和进度查询
- **数据存储**: MongoDB 存储案例配置和元数据

### 前端 (React + VTK.js)
- **3D 可视化**: VTK.js 渲染非结构化网格和流场结果
- **交互功能**: 切片 (Slice)、等值面 (IsoSurface) 交互
- **边界条件**: 速度入口、压力出口、壁面、对称面设置
- **求解器监控**: 实时残差曲线绘制
- **案例管理**: 版本控制和参数对比

## 项目结构

```
a44/
├── backend/
│   ├── main.py                 # FastAPI 主应用
│   ├── config.py               # 配置文件
│   ├── database.py             # MongoDB 连接
│   ├── models.py               # Pydantic 数据模型
│   ├── requirements.txt        # Python 依赖
│   ├── Dockerfile
│   ├── routers/
│   │   ├── cases.py            # 案例管理 API
│   │   └── data.py             # 数据访问 API
│   └── services/
│       ├── openfoam_service.py # OpenFOAM 集成
│       ├── data_parser.py      # foamData 解析
│       ├── websocket_manager.py # WebSocket 管理
│       └── task_scheduler.py   # 任务调度
├── frontend/
│   ├── package.json
│   ├── Dockerfile
│   ├── public/
│   └── src/
│       ├── App.js              # 主应用组件
│       ├── api.js              # API 客户端
│       ├── store.js            # Zustand 状态管理
│       ├── index.js
│       └── components/
│           ├── CaseList.js             # 案例列表
│           ├── VtkViewer.js            # VTK 3D 渲染器
│           ├── BoundaryConditionsPanel.js # 边界条件面板
│           ├── SolverConfigPanel.js    # 求解器配置
│           ├── ViewerControls.js       # 可视化控制
│           ├── ResidualsChart.js       # 残差图表
│           └── ComparePanel.js         # 案例对比
├── docker-compose.yml
└── README.md
```

## 快速开始

### 使用 Docker (推荐)

```bash
# 启动所有服务
docker-compose up -d

# 查看日志
docker-compose logs -f

# 停止服务
docker-compose down
```

### 手动启动

#### 后端

```bash
cd backend

# 创建虚拟环境
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# 安装依赖
pip install -r requirements.txt

# 确保 MongoDB 正在运行
# 配置环境变量 (可选)
cp .env.example .env

# 启动服务
python main.py
```

#### 前端

```bash
cd frontend

# 安装依赖
npm install

# 启动开发服务器
npm start
```

## API 文档

启动后端后访问: `http://localhost:8000/docs`

### 主要接口

#### 案例管理
- `POST /api/cases` - 创建案例
- `GET /api/cases` - 案例列表
- `GET /api/cases/{id}` - 获取案例
- `PUT /api/cases/{id}` - 更新案例
- `DELETE /api/cases/{id}` - 删除案例

#### 网格与求解
- `POST /api/cases/{id}/upload` - 上传 STL 文件
- `POST /api/cases/{id}/generate-mesh` - 生成网格
- `POST /api/cases/{id}/run-solver` - 运行求解器
- `GET /api/cases/tasks/{task_id}/progress` - 任务进度

#### 数据访问
- `GET /api/data/{id}/geometry` - 获取几何数据
- `GET /api/data/{id}/vtk` - 获取 VTK 格式数据
- `GET /api/data/{id}/fields` - 获取可用场
- `GET /api/data/{id}/field/{field}` - 获取场数据
- `GET /api/data/{id}/slices` - 获取切片数据

#### WebSocket
- `ws://localhost:8000/ws/progress/{case_id}` - 进度更新
- `ws://localhost:8000/ws/solver/{case_id}` - 求解器日志

### 边界条件类型

| 类型 | 说明 | 参数 |
|------|------|------|
| velocity_inlet | 速度入口 | velocity, k, epsilon |
| pressure_outlet | 压力出口 | pressure |
| wall | 壁面 | - |
| symmetry | 对称面 | - |

## 技术栈

### 后端
- **FastAPI** - 现代 Python Web 框架
- **Motor** - 异步 MongoDB 驱动
- **Pydantic** - 数据验证
- **NumPy/SciPy** - 科学计算
- **OpenFOAM** - CFD 求解器

### 前端
- **React 18** - UI 框架
- **VTK.js** - 3D 可视化
- **Material-UI** - 组件库
- **Zustand** - 状态管理
- **Recharts** - 图表库
- **Axios** - HTTP 客户端

## OpenFOAM 集成

平台支持以下 OpenFOAM 工具:

- **blockMesh**: 结构化网格生成
- **snappyHexMesh**: 非结构化网格生成 (支持 STL)
- **checkMesh**: 网格质量检查
- **simpleFoam**: 稳态不可压缩流求解器
- **pisoFoam**: 瞬态不可压缩流求解器
- **icoFoam**: 层流求解器

## 配置 OpenFOAM

在 `backend/.env` 中设置:

```
OPENFOAM_ROOT=/usr/lib/openfoam
OPENFOAM_VERSION=openfoam2312
```

确保 OpenFOAM 已正确安装并可执行:

```bash
source /usr/lib/openfoam/openfoam2312/etc/bashrc
blockMesh -help
```

## 数据存储

案例数据按以下结构存储:

```
data/
├── uploads/              # 上传的 STL 文件
│   └── {case_id}_{filename}.stl
├── cases/               # OpenFOAM 案例目录
│   └── {case_id}/
│       ├── 0/           # 初始条件
│       ├── constant/    # 物理属性
│       ├── system/      # 求解器配置
│       └── log.simpleFoam
└── results/            # 结果文件
```

## 开发指南

### 添加新的求解器

1. 在 `frontend/src/components/SolverConfigPanel.js` 的 `SOLVERS` 数组中添加
2. 在 `backend/services/openfoam_service.py` 中添加相应的字典模板

### 添加新的边界条件

1. 在 `frontend/src/components/BoundaryConditionsPanel.js` 的 `BOUNDARY_TYPES` 中添加
2. 在 `_create_boundary_files` 方法中添加处理逻辑

## 许可证

MIT License
