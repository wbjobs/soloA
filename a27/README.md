# 多人实时协作编辑文档管理后端系统

基于微服务架构的协作文档管理系统，支持多人实时编辑、CRDT 冲突解决、版本控制和细粒度权限管理。

## 项目架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                           API Gateway                               │
│                  (路由转发、限流、JWT认证)                           │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        │                       │                       │
        ▼                       ▼                       ▼
┌───────────────┐     ┌───────────────┐     ┌───────────────┐
│ Auth Service  │     │Document Serv. │     │   CRDT Serv.  │
│  (认证/授权)  │     │ (元数据/权限) │     │(冲突解决/RGA) │
└───────────────┘     └───────────────┘     └───────┬───────┘
                                                    │
                                                    ▼
                                            ┌───────────────┐
                                            │ Version Serv. │
                                            │(快照/版本历史)│
                                            └───────┬───────┘
                                                    │
                                    ┌───────────────┼───────────────┐
                                    ▼               ▼               ▼
                            ┌───────────┐   ┌───────────┐   ┌───────────┐
                            │ PostgreSQL│   │   Redis   │   │   MinIO   │
                            │ (索引/权限)│   │(缓存/CRDT)│   │(对象存储) │
                            └───────────┘   └───────────┘   └───────────┘
```

## 服务组件

### 1. API Gateway (`gateway/`)
- **功能**: 统一入口，路由转发，限流，JWT 认证
- **技术栈**: FastAPI + httpx + Redis
- **端口**: HTTP 8000
- **核心功能**:
  - 请求路由到各微服务
  - 基于 IP 的限流 (默认 60 请求/分钟)
  - JWT Token 验证和解码
  - 用户信息注入到请求头

### 2. Auth Service (`auth-service/`)
- **功能**: 用户认证、JWT 签发、RBAC 权限管理
- **技术栈**: FastAPI + SQLAlchemy + PostgreSQL + gRPC
- **端口**: HTTP 8001, gRPC 50051
- **核心功能**:
  - 用户注册/登录
  - JWT Token 生成与验证
  - RBAC 角色权限模型 (User-Role-Permission)
  - 细粒度权限校验

### 3. Document Service (`document-service/`)
- **功能**: 文档元数据管理、权限控制、生命周期
- **技术栈**: FastAPI + SQLAlchemy + PostgreSQL + gRPC
- **端口**: HTTP 8002, gRPC 50052
- **核心功能**:
  - 文档 CRUD 操作
  - 文档级权限 (owner/editor/viewer)
  - 权限授予/撤销
  - 版本号递增
  - 软删除支持

### 4. CRDT Service (`crdt-service/`)
- **功能**: 实时协作编辑、冲突解决
- **技术栈**: FastAPI + Redis + RGA 算法 + gRPC
- **端口**: HTTP 8003, gRPC 50053
- **核心功能**:
  - RGA (Replicated Growable Array) CRDT 实现
  - Lamport 时钟用于因果排序
  - 插入/删除操作的冲突解决
  - 文档状态快照
  - 客户端同步

### 5. Version Service (`version-service/`)
- **功能**: 版本历史、快照存储
- **技术栈**: FastAPI + PostgreSQL + MinIO + gRPC
- **端口**: HTTP 8004, gRPC 50054
- **核心功能**:
  - 文档快照存储到 MinIO
  - 版本索引到 PostgreSQL
  - 版本历史查询
  - 版本回滚
  - 预签名 URL 下载

## 技术特性

### 微服务通信
- **对外 API**: RESTful API (通过 Gateway)
- **服务间通信**: gRPC
- **协议定义**: Protocol Buffers (在 `protos/` 目录)

### 权限模型
```
系统级 RBAC: User ────► Role ────► Permission
文档级权限: Document ────► DocumentPermission (owner/editor/viewer)
```

### CRDT 算法
- **RGA (Replicated Growable Array)**: 适合文本编辑的 CRDT 类型
- **Tombstone 机制**: 逻辑删除而非物理删除
- **Lamport 时钟**: 保证操作的因果一致性

### 存储架构
- **PostgreSQL**: 结构化数据 (用户、文档元数据、权限、版本索引)
- **Redis**: CRDT 状态缓存、操作队列
- **MinIO**: 文档快照对象存储

## 快速开始

### 前置要求
- Docker & Docker Compose
- Python 3.11+ (本地开发)

### 使用 Docker Compose 启动

```bash
# 1. 克隆项目
cd e:\soloA\a27

# 2. 启动所有服务
docker-compose up -d

# 3. 查看服务状态
docker-compose ps

# 4. 查看日志
docker-compose logs -f <service-name>
```

### 服务端口映射

| 服务 | HTTP 端口 | gRPC 端口 |
|------|-----------|-----------|
| Gateway | 8000 | - |
| Auth | 8001 | 50051 |
| Document | 8002 | 50052 |
| CRDT | 8003 | 50053 |
| Version | 8004 | 50054 |

### 基础使用流程

```python
import httpx

BASE_URL = "http://localhost:8000/api/v1"

# 1. 注册用户
response = httpx.post(f"{BASE_URL}/auth/register", json={
    "username": "testuser",
    "email": "test@example.com",
    "password": "testpass123"
})

# 2. 登录获取 Token
response = httpx.post(f"{BASE_URL}/auth/login", json={
    "username": "testuser",
    "password": "testpass123"
})
token = response.json()["access_token"]
headers = {"Authorization": f"Bearer {token}"}

# 3. 创建文档
response = httpx.post(f"{BASE_URL}/documents/", headers=headers, json={
    "title": "My First Document",
    "content_type": "text/plain"
})
doc_id = response.json()["document_id"]

# 4. 应用编辑操作 (CRDT)
response = httpx.post(f"{BASE_URL}/crdt/apply", headers=headers, json={
    "document_id": doc_id,
    "author_id": "testuser-id",
    "base_version": 1,
    "operations": [
        {"type": "insert", "position": 0, "content": "H"},
        {"type": "insert", "position": 1, "content": "i"}
    ]
})

# 5. 获取文档状态
response = httpx.get(f"{BASE_URL}/crdt/state/{doc_id}", headers=headers)

# 6. 保存版本快照
response = httpx.post(f"{BASE_URL}/versions/snapshot", headers=headers, json={
    "document_id": doc_id,
    "version": 2,
    "content": "Hi",
    "metadata": {"status": "initial"}
})

# 7. 查看版本历史
response = httpx.get(f"{BASE_URL}/versions/list/{doc_id}", headers=headers)
```

## 本地开发

### 运行单元测试

```bash
# Auth Service 测试
cd auth-service
pip install -r requirements.txt
pytest tests/ -v

# CRDT Service 测试
cd ../crdt-service
pip install -r requirements.txt
pytest tests/ -v

# Document Service 测试
cd ../document-service
pip install -r requirements.txt
pytest tests/ -v
```

### 生成 gRPC 代码

```bash
python -m grpc_tools.protoc \
    -I./protos \
    --python_out=. \
    --grpc_python_out=. \
    protos/*.proto
```

## API 端点概览

### Auth Service
- `POST /api/v1/auth/register` - 用户注册
- `POST /api/v1/auth/login` - 用户登录
- `POST /api/v1/auth/validate` - Token 验证
- `POST /api/v1/auth/check-permission` - 权限校验

### Document Service
- `GET /api/v1/documents/` - 文档列表
- `POST /api/v1/documents/` - 创建文档
- `GET /api/v1/documents/{id}` - 获取文档
- `PUT /api/v1/documents/{id}` - 更新文档
- `DELETE /api/v1/documents/{id}` - 删除文档
- `POST /api/v1/documents/{id}/permissions` - 授权
- `DELETE /api/v1/documents/{id}/permissions/{user_id}` - 撤销权限

### CRDT Service
- `POST /api/v1/crdt/apply` - 应用操作
- `GET /api/v1/crdt/state/{doc_id}` - 获取状态
- `POST /api/v1/crdt/sync` - 客户端同步
- `GET /api/v1/crdt/snapshot/{doc_id}` - 获取快照

### Version Service
- `POST /api/v1/versions/snapshot` - 保存快照
- `GET /api/v1/versions/snapshot/{doc_id}/{version}` - 获取快照
- `GET /api/v1/versions/list/{doc_id}` - 版本列表
- `POST /api/v1/versions/revert` - 回滚版本
- `GET /api/v1/versions/url/{doc_id}/{version}` - 下载 URL

## 项目结构

```
a27/
├── docker-compose.yml          # 多服务编排
├── README.md                   # 本文档
│
├── protos/                     # gRPC 协议定义
│   ├── auth.proto
│   ├── document.proto
│   ├── crdt.proto
│   └── version.proto
│
├── gateway/                    # API 网关
│   ├── main.py
│   ├── config.py
│   ├── requirements.txt
│   ├── Dockerfile
│   ├── middleware/
│   │   ├── auth.py            # JWT 认证
│   │   └── rate_limit.py      # 限流
│   └── router/
│       └── proxy.py           # 路由代理
│
├── auth-service/               # 认证服务
│   ├── main.py
│   ├── config.py
│   ├── database.py
│   ├── models.py              # 用户/RBAC 模型
│   ├── schemas.py
│   ├── security.py            # 密码哈希/JWT
│   ├── services.py
│   ├── routes.py
│   ├── grpc_server.py
│   ├── requirements.txt
│   ├── Dockerfile
│   └── tests/
│       └── test_auth.py
│
├── document-service/           # 文档服务
│   ├── main.py
│   ├── config.py
│   ├── database.py
│   ├── models.py              # 文档/权限模型
│   ├── schemas.py
│   ├── services.py
│   ├── routes.py
│   ├── grpc_server.py
│   ├── requirements.txt
│   ├── Dockerfile
│   └── tests/
│       └── test_documents.py
│
├── crdt-service/               # CRDT 服务
│   ├── main.py
│   ├── config.py
│   ├── routes.py
│   ├── grpc_server.py
│   ├── requirements.txt
│   ├── Dockerfile
│   ├── crdt/
│   │   ├── rga.py             # RGA 算法实现
│   │   └── document_manager.py # 文档管理
│   └── tests/
│       └── test_rga.py
│
└── version-service/            # 版本服务
    ├── main.py
    ├── config.py
    ├── database.py
    ├── models.py              # 快照/操作模型
    ├── schemas.py
    ├── services.py
    ├── routes.py
    ├── grpc_server.py
    ├── requirements.txt
    ├── Dockerfile
    ├── storage/
    │   └── minio_client.py    # MinIO 客户端
    └── tests/
```

## 安全注意事项

1. **JWT 密钥**: 生产环境必须修改 `JWT_SECRET`
2. **数据库密码**: 修改 PostgreSQL 默认密码
3. **MinIO 密钥**: 修改 MinIO 访问密钥
4. **HTTPS**: 生产环境启用 HTTPS
5. **gRPC TLS**: 服务间通信启用 TLS

## License

MIT
