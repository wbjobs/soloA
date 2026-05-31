# 协同文档系统

一个支持多人实时协同编辑的技术文档系统。

## 技术栈

### 后端
- Node.js + Express
- Socket.io (WebSocket 实时通信)
- PostgreSQL (持久化存储)
- Redis (在线状态与缓存)
- Yjs (CRDT 协同编辑)
- JWT + RBAC (权限控制)

### 前端
- React 18 + TypeScript
- TipTap/ProseMirror (富文本编辑器)
- Yjs (CRDT 协同)
- Tailwind CSS (样式)
- Zustand (状态管理)
- Socket.io Client (实时通信)

## 功能特性

### 富文本编辑
- 标题 (H1/H2/H3)
- 加粗、斜体、下划线
- 有序/无序列表
- 代码块 (带语法高亮)
- 引用块

### 实时协同
- 基于 Yjs (CRDT) 的实时光标与内容同步
- 多人在线用户状态显示
- 远程光标位置展示

### 版本控制
- 文档快照保存
- 版本历史查看
- 一键回滚到历史版本

### 评论系统
- 行内评论与评审线程
- 评论的回复与讨论
- 评论解决/重新打开

### 权限控制
- JWT 认证
- RBAC 角色权限 (读者/编辑者/管理员)
- 文档级别权限管理

## 快速开始

### 前置要求
- Node.js >= 18
- Docker & Docker Compose (用于数据库)

### 1. 启动数据库和 Redis
```bash
docker-compose up -d
```

### 2. 安装后端依赖
```bash
cd server
npm install
```

### 3. 启动后端服务
```bash
npm run dev
```

后端服务运行在 http://localhost:3001

### 4. 安装前端依赖
```bash
cd client
npm install
```

### 5. 启动前端服务
```bash
npm run dev
```

前端服务运行在 http://localhost:3000

## 项目结构

```
.
├── client/                 # 前端 React 应用
│   ├── src/
│   │   ├── api/           # API 调用
│   │   ├── components/    # UI 组件
│   │   │   ├── RichEditor.tsx      # 富文本编辑器
│   │   │   ├── CommentsPanel.tsx   # 评论面板
│   │   │   └── VersionHistoryPanel.tsx  # 版本历史
│   │   ├── hooks/         # 自定义 Hooks
│   │   │   └── useCollaboration.ts    # 协同 Hook
│   │   ├── pages/         # 页面组件
│   │   │   ├── LoginPage.tsx
│   │   │   ├── RegisterPage.tsx
│   │   │   ├── DocumentsPage.tsx
│   │   │   └── EditorPage.tsx
│   │   ├── store/         # 状态管理
│   │   │   └── authStore.ts
│   │   ├── types/         # TypeScript 类型
│   │   └── App.tsx
│   └── package.json
├── server/                 # 后端 Express 应用
│   ├── src/
│   │   ├── config/        # 配置文件
│   │   ├── db/            # 数据库连接与初始化
│   │   ├── middleware/    # 中间件 (认证等)
│   │   ├── redis/         # Redis 客户端与操作
│   │   ├── routes/        # API 路由
│   │   │   ├── auth.ts
│   │   │   ├── documents.ts
│   │   │   └── comments.ts
│   │   ├── socket/        # Socket.io 事件
│   │   │   └── collab.ts    # 协同编辑处理
│   │   └── index.ts
│   ├── .env.example
│   └── package.json
├── docker-compose.yml
└── README.md
```

## API 接口

### 认证接口
- `POST /api/auth/register` - 注册
- `POST /api/auth/login` - 登录
- `GET /api/auth/me` - 获取当前用户

### 文档接口
- `GET /api/documents` - 获取文档列表
- `GET /api/documents/:id` - 获取单个文档
- `POST /api/documents` - 创建文档
- `PUT /api/documents/:id` - 更新文档
- `DELETE /api/documents/:id` - 删除文档
- `GET /api/documents/:id/versions` - 获取版本历史
- `POST /api/documents/:id/versions/:version/rollback` - 回滚版本
- `POST /api/documents/:id/versions/create-snapshot` - 创建快照

### 评论接口
- `GET /api/comments/document/:documentId` - 获取文档评论
- `POST /api/comments` - 创建评论
- `POST /api/comments/:commentId/replies` - 添加回复
- `PATCH /api/comments/:commentId/resolve` - 解决评论
- `PATCH /api/comments/:commentId/reopen` - 重新打开评论

## WebSocket 事件

### 客户端 → 服务器
- `join-document` (documentId, userData) - 加入文档
- `leave-document` - 离开文档
- `doc-update` (update) - 发送文档更新
- `sync-step-1` (stateVector) - 同步步骤1
- `sync-step-2` (update) - 同步步骤2
- `cursor-update` (anchor, head) - 光标更新
- `cursor-selection` (from, to, text) - 选区更新
- `request-save` - 请求保存

### 服务器 → 客户端
- `doc-state` (stateVector) - 文档状态向量
- `doc-update` (update) - 文档更新
- `sync-step-2` (update) - 同步步骤2
- `users-update` (users) - 在线用户更新
- `cursor-update` (cursor) - 远程光标
- `save-confirm` - 保存确认
- `error` - 错误信息

## 权限矩阵

| 权限 | 读者 | 编辑者 | 管理员 |
|------|------|--------|--------|
| 读取文档 | ✓ | ✓ | ✓ |
| 编辑文档 | ✗ | ✓ | ✓ |
| 删除文档 | ✗ | ✗ | ✓ |
| 回滚版本 | ✗ | ✓ | ✓ |
| 查看评论 | ✓ | ✓ | ✓ |
| 发表评论 | ✗ | ✓ | ✓ |
| 解决评论 | ✗ | ✓ | ✓ |
| 管理用户 | ✗ | ✗ | ✓ |

## 数据库架构

### users 表
- id: UUID (主键)
- username: VARCHAR(50) (唯一)
- email: VARCHAR(255) (唯一)
- password_hash: VARCHAR(255)
- role: VARCHAR(20) (reader/editor/admin)
- avatar_color: VARCHAR(7)
- created_at, updated_at

### documents 表
- id: UUID (主键)
- title: VARCHAR(255)
- owner_id: UUID (外键)
- ydoc_state: BYTEA (Yjs 文档状态)
- created_at, updated_at

### document_versions 表
- id: UUID (主键)
- document_id: UUID (外键)
- version_number: INTEGER
- ydoc_state: BYTEA
- content_snapshot: TEXT
- created_by: UUID (外键)
- created_at

### comments 表
- id: UUID (主键)
- document_id: UUID (外键)
- author_id: UUID (外键)
- anchor_from: JSONB
- anchor_to: JSONB
- selected_text: TEXT
- resolved_at, resolved_by
- created_at

### comment_replies 表
- id: UUID (主键)
- comment_id: UUID (外键)
- author_id: UUID (外键)
- content: TEXT
- created_at

## Redis 键结构

- `online_users` - Hash, 存储在线用户 socket ID
- `doc:{documentId}:users` - Hash, 文档在线用户
- `doc:{documentId}:lock` - String, 文档锁

## 开发说明

### 添加新的富文本功能
在 `client/src/components/RichEditor.tsx` 中添加新的 TipTap 扩展。

### 添加新的 API 端点
1. 在 `server/src/routes/` 中创建新路由
2. 在 `client/src/api/index.ts` 中添加对应的 API 调用

### 自定义权限
在 `server/src/config/index.ts` 中修改 `rolePermissions`。

## 生产环境部署建议

1. 使用 Nginx 反向代理
2. 配置 HTTPS
3. 使用连接池优化数据库连接
4. 配置 Redis 持久化
5. 添加日志收集
6. 配置监控告警

## License

MIT
