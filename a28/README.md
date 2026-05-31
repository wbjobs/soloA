# ChemViz - 化学研究全栈Web应用

面向化学研究人员的全栈Web应用，支持分子式3D可视化、化学反应路径模拟与实验数据管理。

## 技术栈

### 前端
- Next.js 14 + React 18
- TypeScript
- Three.js / React Three Fiber (R3F)
- Tailwind CSS

### 后端
- Python 3.11+
- FastAPI
- RDKit (化学信息学库)
- SQLAlchemy (ORM)

### 数据存储
- PostgreSQL (分子数据、反应条件、实验记录)
- MinIO (3D模型文件、实验附件)

## 目录结构

```
chemviz/
├── backend/          # FastAPI 后端
│   ├── app/
│   │   ├── api/      # API 路由
│   │   ├── models/   # 数据库模型
│   │   ├── schemas/  # Pydantic 模型
│   │   ├── services/ # 业务逻辑
│   │   ├── core/     # 配置和工具
│   │   └── main.py
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/         # Next.js 前端
│   ├── app/
│   ├── components/
│   ├── lib/
│   ├── package.json
│   └── Dockerfile
├── docker-compose.yml
└── README.md
```

## 功能模块

### 1. 分子解析模块
- SMILES 字符串解析
- SMILES ↔ 3D 坐标转换
- 分子属性提取

### 2. 3D 可视化模块
- 球棍模型渲染
- 旋转、缩放、平移操作
- 原子选中高亮
- 键级显示

### 3. 反应模拟模块
- 酯化反应路径动画
- 过渡态可视化
- 播放/暂停/进度控制

### 4. 实验管理模块
- 实验记录 CRUD
- 反应条件管理
- 文件附件管理

## 快速开始

### 使用 Docker Compose

```bash
# 启动所有服务
docker-compose up -d

# 访问前端: http://localhost:3000
# 访问API文档: http://localhost:8000/docs
# 访问MinIO控制台: http://localhost:9001
```

### 本地开发

#### 后端
```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

#### 前端
```bash
cd frontend
npm install
npm run dev
```

## 环境变量

### 后端
```
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=chemviz
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres

MINIO_ENDPOINT=localhost:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=chemviz-files
```

### 前端
```
NEXT_PUBLIC_API_URL=http://localhost:8000
```
