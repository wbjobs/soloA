# 古籍文档智能修复与OCR平台

一个多模态古籍文档智能修复与OCR流水线平台，集成了图像预处理、墨迹修复、版面分析、古文字OCR和知识图谱构建等功能。

## 功能特性

### 后端 (Python FastAPI)
1. **文档图像预处理**
   - 去噪 (Non-Local Means Denoising)
   - 自适应二值化 (Adaptive Thresholding)
   - 倾斜校正 (Deskewing)
   - 对比度增强 (CLAHE)
   - 古籍纸张老化污渍去除

2. **墨迹修复**
   - 损伤区域检测
   - 混合修复算法 (Telea + Navier-Stokes)
   - 墨迹增强
   - 针对古籍墨迹扩散特征优化

3. **版面分析**
   - 文本区域检测 (支持竖排)
   - 插图检测
   - 表格检测
   - 印章检测 (红色印章识别)
   - Bounding Box + 类别标签

4. **古文字OCR**
   - Tesseract OCR 集成 (支持简体/繁体)
   - 竖排文本支持
   - 置信度评估
   - 可扩展至TrOCR等深度学习模型

5. **知识图谱构建**
   - 人名提取 (PERSON)
   - 地名提取 (GPE)
   - 官职提取 (Position)
   - 朝代提取 (Dynasty)
   - 实体关系构建

### 前端 (React)
1. **古籍图像查看器**
   - 缩放控制 (25% - 500%)
   - 旋转功能
   - 平移模式
   - 分屏对比 (原始/处理后/修复后)
   - 滑块对比模式

2. **版面分析可视化**
   - Bounding Box叠加显示
   - 类别标签
   - 置信度显示
   - 竖排文本标识

3. **OCR文本校对编辑器**
   - 原文对比显示
   - 校对文本编辑
   - 通过/驳回操作
   - 竖排文本特殊渲染
   - 校对进度追踪

### 数据存储
- **PostgreSQL**: 文档元数据、OCR结果、实体关系
- **MinIO**: 图像文件和模型输出

## 快速开始

### 使用 Docker Compose (推荐)

```bash
# 克隆项目
cd ancient-documents-platform

# 复制环境变量
cp .env.example .env

# 启动所有服务
docker-compose up -d --build

# 访问服务
# 前端: http://localhost:3000
# 后端API: http://localhost:8000
# API文档: http://localhost:8000/docs
# MinIO控制台: http://localhost:9001 (minioadmin/minioadmin)
```

### 手动运行

#### 后端

```bash
cd backend

# 创建虚拟环境
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# 安装依赖
pip install -r requirements.txt

# 安装系统依赖 (Ubuntu/Debian)
sudo apt-get install tesseract-ocr tesseract-ocr-chi-sim tesseract-ocr-chi-tra

# 复制环境变量
cp .env.example .env

# 确保PostgreSQL和MinIO正在运行

# 启动服务
python run.py
```

#### 前端

```bash
cd frontend

# 安装依赖
npm install

# 启动开发服务器
npm start
```

## API 端点

### 文档管理
- `POST /api/documents/` - 上传文档
- `GET /api/documents/` - 获取文档列表
- `GET /api/documents/{id}` - 获取文档详情
- `PUT /api/documents/{id}` - 更新文档
- `DELETE /api/documents/{id}` - 删除文档
- `GET /api/documents/{id}/images` - 获取文档图像URL

### 处理流水线
- `POST /api/pipeline/{id}/preprocess` - 图像预处理
- `POST /api/pipeline/{id}/inpaint` - 墨迹修复
- `POST /api/pipeline/{id}/analyze-layout` - 版面分析
- `POST /api/pipeline/{id}/ocr` - OCR识别
- `POST /api/pipeline/{id}/knowledge-graph` - 知识图谱构建
- `POST /api/pipeline/{id}/full` - 完整流水线

### OCR校对
- `GET /api/ocr/document/{id}` - 获取文档OCR结果
- `GET /api/ocr/{id}` - 获取单个OCR结果
- `PUT /api/ocr/{id}` - 更新OCR结果
- `POST /api/ocr/{id}/approve` - 通过OCR结果
- `POST /api/ocr/{id}/reject` - 驳回OCR结果

## 项目结构

```
ancient-documents-platform/
├── backend/
│   ├── app/
│   │   ├── api/              # API路由
│   │   │   ├── documents.py  # 文档管理
│   │   │   ├── ocr.py        # OCR校对
│   │   │   └── pipeline.py   # 处理流水线
│   │   ├── models/           # 数据库模型
│   │   ├── schemas/          # Pydantic schemas
│   │   ├── services/         # 业务逻辑
│   │   │   ├── image_preprocessing.py
│   │   │   ├── inpainting_service.py
│   │   │   ├── layout_analysis.py
│   │   │   ├── ocr_service.py
│   │   │   ├── knowledge_graph.py
│   │   │   └── storage_service.py
│   │   ├── config.py         # 配置
│   │   ├── database.py       # 数据库连接
│   │   └── main.py           # FastAPI入口
│   ├── requirements.txt
│   ├── run.py
│   └── Dockerfile
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── components/       # UI组件
│   │   │   ├── ImageViewer.tsx
│   │   │   ├── LayoutOverlay.tsx
│   │   │   ├── Navbar.tsx
│   │   │   └── SplitView.tsx
│   │   ├── pages/            # 页面
│   │   │   ├── DocumentList.tsx
│   │   │   ├── DocumentViewer.tsx
│   │   │   └── OCREditor.tsx
│   │   ├── services/         # API服务
│   │   ├── types/            # TypeScript类型
│   │   ├── App.tsx
│   │   └── index.tsx
│   ├── package.json
│   ├── tsconfig.json
│   ├── nginx.conf
│   └── Dockerfile
├── docker-compose.yml
└── README.md
```

## 数据流

1. **上传文档**: 用户上传古籍图像，存储到MinIO，元数据保存到PostgreSQL
2. **图像预处理**: 去噪、二值化、倾斜校正、污渍去除
3. **墨迹修复**: 检测破损区域，使用混合算法修复
4. **版面分析**: 检测文本、插图、表格、印章区域
5. **OCR识别**: 对文本区域进行OCR，支持竖排文本
6. **知识图谱**: 从OCR文本中提取实体和关系
7. **校对编辑**: 用户可在前端校对OCR结果

## 扩展指南

### 集成LaMa Inpainting模型

```python
# 在 inpainting_service.py 中替换当前实现
from lama_cleaner.model_manager import ModelManager
from lama_cleaner.schema import Config

class LaMaInpainting:
    def __init__(self):
        self.model = ModelManager(name="lama", device="cuda")
    
    def inpaint(self, image, mask):
        # 使用LaMa模型进行修复
        pass
```

### 集成TrOCR模型

```python
# 在 ocr_service.py 中
from transformers import TrOCRProcessor, VisionEncoderDecoderModel

class TrOCRService:
    def __init__(self):
        self.processor = TrOCRProcessor.from_pretrained("microsoft/trocr-base-handwritten")
        self.model = VisionEncoderDecoderModel.from_pretrained("microsoft/trocr-base-handwritten")
```

### 集成NER模型

```python
# 在 knowledge_graph.py 中
from transformers import pipeline

class HFNER:
    def __init__(self):
        self.ner = pipeline("ner", model="bert-base-chinese")
```

## 技术栈

**后端:**
- Python 3.11+
- FastAPI
- SQLAlchemy
- PostgreSQL
- MinIO
- OpenCV
- Pillow
- scikit-image
- Tesseract OCR
- PyTorch (可选，用于深度学习模型)

**前端:**
- React 18+
- TypeScript
- Material-UI (MUI)
- React Router
- Axios

**基础设施:**
- Docker
- Docker Compose
- Nginx

## 许可证

MIT License
