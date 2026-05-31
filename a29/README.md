# 地震波传播模拟系统

一个基于有限元方法（FEM）的2D弹性波方程求解系统，支持可视化波场传播。

## 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend                             │
│              React + WebGL + Three.js                       │
│  可视化：伪彩色图、波场动画、地震波形图                        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                        Backend                              │
│              FastAPI + SQLAlchemy                           │
│  任务管理：提交、查询、删除；结果检索                          │
└─────────────────────────────────────────────────────────────┘
                              │
         ┌────────────────────┼────────────────────┐
         ▼                    ▼                    ▼
┌────────────────┐  ┌────────────────┐  ┌────────────────┐
│   PostgreSQL   │  │     HDF5       │  │  FEM Solver    │
│  参数存储      │  │  波场快照      │  │  弹性波方程    │
│  任务状态      │  │  数据文件      │  │  NumPy/SciPy   │
└────────────────┘  └────────────────┘  └────────────────┘
```

## 功能特性

### 计算后端
- 2D 弹性波方程有限元求解
- 显式时间积分（中心差分法）
- Gmsh API 网格生成
- 支持均匀介质模拟
- 吸收边界条件
- 雷克子波震源
- HDF5 波场数据存储

### 数据服务
- FastAPI RESTful API
- PostgreSQL 参数存储
- 任务调度系统
- 实时进度更新

### 前端可视化
- WebGL 波场伪彩色图
- 波场动画播放
- 地震波形图（时程曲线）
- 参数配置界面
- 任务管理界面

## 快速开始

### 环境要求

- Python 3.11+
- Node.js 20+
- PostgreSQL 15+
- （可选）Docker 和 Docker Compose

### 使用 Docker 启动

```bash
docker-compose up -d
```

访问：
- 前端: http://localhost:3000
- API: http://localhost:8000
- API 文档: http://localhost:8000/docs

### 手动启动

#### 1. 启动 PostgreSQL

```bash
docker run -d \
  --name seismic-postgres \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=password \
  -e POSTGRES_DB=seismic_sim \
  -p 5432:5432 \
  postgres:15
```

#### 2. 启动后端

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

#### 3. 启动前端

```bash
cd frontend
npm install
npm run dev
```

## API 端点

### 任务管理

| 方法 | 路径 | 描述 |
|------|------|------|
| POST | `/api/simulations` | 创建新模拟 |
| GET | `/api/simulations` | 列出所有模拟 |
| GET | `/api/simulations/{id}` | 获取模拟详情 |
| DELETE | `/api/simulations/{id}` | 删除模拟 |
| GET | `/api/simulations/{id}/progress` | 获取进度 |

### 结果检索

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/api/simulations/{id}/snapshots` | 获取快照列表 |
| GET | `/api/simulations/{id}/snapshots/{index}` | 获取单个快照 |
| POST | `/api/simulations/{id}/seismograms` | 获取地震图 |

## 模拟参数说明

### 网格参数
- `width`: 域宽度 (m)
- `height`: 域高度 (m)
- `element_size`: 单元尺寸 (m)

### 材料参数
- `vp`: P波速度 (m/s)
- `vs`: S波速度 (m/s)
- `density`: 密度 (kg/m³)

### 震源参数
- `x`, `y`: 震源位置
- `frequency`: 频率 (Hz)
- `amplitude`: 振幅
- `source_type`: 震源类型（ricker）

### 求解器参数
- `total_time`: 总模拟时间 (s)
- `time_step`: 时间步长（自动计算）
- `output_interval`: 输出间隔
- `courant_number`: CFL数

## 项目结构

```
a29/
├── backend/
│   ├── app/
│   │   ├── simulation/
│   │   │   ├── mesh_generator.py    # 网格生成
│   │   │   ├── material.py          # 材料模型
│   │   │   ├── solver.py            # FEM求解器
│   │   │   └── postprocessing.py    # 后处理
│   │   ├── main.py                  # FastAPI主应用
│   │   ├── database.py              # 数据库连接
│   │   ├── models.py                # ORM模型
│   │   ├── schemas.py               # Pydantic模型
│   │   ├── scheduler.py             # 任务调度
│   │   └── config.py                # 配置
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Layout.tsx
│   │   │   ├── WavefieldVisualization.tsx
│   │   │   └── SeismogramChart.tsx
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx
│   │   │   ├── SimulationCreate.tsx
│   │   │   └── SimulationDetail.tsx
│   │   ├── store/
│   │   ├── api/
│   │   └── types/
│   ├── package.json
│   └── Dockerfile
└── docker-compose.yml
```

## 技术栈

**后端：**
- FastAPI - Web框架
- SQLAlchemy - ORM
- PostgreSQL - 数据库
- NumPy/SciPy - 数值计算
- Gmsh - 网格生成
- HDF5 - 数据存储

**前端：**
- React 18
- TypeScript
- Three.js - WebGL可视化
- Chart.js - 图表
- Zustand - 状态管理
- Tailwind CSS - 样式

## 许可证

MIT License
