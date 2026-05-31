# Markdown Notes - 在线协作笔记平台

一个功能完整的全栈在线Markdown笔记平台，支持实时多人协作编辑。

## 技术栈

### 前端
- **React 18** - UI框架
- **TypeScript** - 类型安全
- **Tailwind CSS** - 样式框架
- **CodeMirror 6** - Markdown编辑器
- **Socket.io Client** - 实时通信
- **Axios** - HTTP客户端
- **React Router** - 路由管理
- **Marked** - Markdown渲染

### 后端
- **Node.js** - 运行环境
- **Express** - Web框架
- **Socket.io** - WebSocket实时通信
- **MongoDB** + **Mongoose** - 数据库
- **JWT** - 身份认证
- **bcryptjs** - 密码加密

## 功能特性

### 1. 用户模块
- 用户注册和登录
- JWT Token身份认证
- 三种用户角色：
  - `admin` - 管理员
  - `editor` - 编辑者（默认）
  - `reader` - 只读用户

### 2. 笔记模块
- 创建、删除、重命名笔记
- Markdown实时预览
- 三种视图模式：
  - 编辑模式
  - 预览模式
  - 分屏模式
- 自动保存（2秒延迟）
- 手动保存

### 3. 协作模块
- 多人实时编辑
- 光标位置同步
- 协作者列表显示
- 冲突自动处理（基于操作顺序）
- 在线状态显示

### 4. 版本控制
- 自动记录修改历史
- 每分钟最多创建一个版本
- 支持回退到任意历史版本
- 版本变更摘要

### 5. 权限管理
- 笔记创建者为所有者
- 可设置分享权限：
  - `owner` - 完全控制
  - `editor` - 可编辑
  - `reader` - 仅阅读
- 公开访问设置
- 按用户ID分享

## 项目结构

```
markdown-notes/
├── client/                 # 前端应用
│   ├── src/
│   │   ├── components/    # React组件
│   │   │   ├── MarkdownEditor.tsx
│   │   │   └── MarkdownPreview.tsx
│   │   ├── contexts/      # React Context
│   │   │   └── AuthContext.tsx
│   │   ├── hooks/         # 自定义Hooks
│   │   │   ├── useNotes.ts
│   │   │   └── useSocket.ts
│   │   ├── pages/         # 页面组件
│   │   │   ├── LoginPage.tsx
│   │   │   ├── RegisterPage.tsx
│   │   │   ├── DashboardPage.tsx
│   │   │   └── NoteEditorPage.tsx
│   │   ├── services/      # API和Socket服务
│   │   │   ├── api.ts
│   │   │   └── socket.ts
│   │   ├── types/         # TypeScript类型
│   │   │   └── index.ts
│   │   ├── App.tsx
│   │   ├── index.tsx
│   │   └── index.css
│   ├── package.json
│   ├── tsconfig.json
│   ├── tailwind.config.js
│   └── postcss.config.js
│
├── server/                 # 后端应用
│   ├── src/
│   │   ├── middleware/    # 中间件
│   │   │   └── auth.js
│   │   ├── models/        # 数据模型
│   │   │   ├── User.js
│   │   │   ├── Note.js
│   │   │   └── NoteVersion.js
│   │   ├── routes/        # API路由
│   │   │   ├── auth.js
│   │   │   └── notes.js
│   │   ├── utils/         # 工具函数
│   │   │   └── jwt.js
│   │   ├── index.js       # 入口文件
│   │   └── socket.js      # Socket.io处理
│   ├── package.json
│   └── .env.example
│
├── database/               # 数据库脚本
│   └── init.js            # 初始化脚本
│
├── api-docs.md            # API文档
└── README.md              # 项目说明
```

## 快速开始

### 前置要求
- Node.js >= 16.0.0
- MongoDB >= 4.4
- npm 或 yarn

### 安装依赖

#### 后端依赖
```bash
cd server
npm install
```

#### 前端依赖
```bash
cd ../client
npm install
```

### 配置环境变量

1. 复制环境变量模板：
```bash
cd server
cp .env.example .env
```

2. 编辑 `.env` 文件：
```env
PORT=3001
MONGODB_URI=mongodb://localhost:27017/markdown-notes
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRES_IN=7d
CLIENT_URL=http://localhost:3000
```

**注意：** 请务必修改 `JWT_SECRET` 为强随机字符串！

### 启动MongoDB

确保MongoDB服务正在运行：
```bash
# Windows (如果已安装为服务)
net start MongoDB

# 或手动启动
mongod
```

### 初始化数据库（可选）

创建示例数据和测试用户：
```bash
cd server
npm run init-db
```

这将创建以下测试用户：
| 角色 | 邮箱 | 密码 |
|------|------|------|
| admin | admin@example.com | password123 |
| editor | editor@example.com | password123 |
| reader | reader@example.com | password123 |

### 启动开发服务器

#### 启动后端
```bash
cd server
npm run dev
```
后端将在 http://localhost:3001 运行

#### 启动前端（新终端）
```bash
cd client
npm start
```
前端将在 http://localhost:3000 运行

### 访问应用

打开浏览器访问 http://localhost:3000

## 生产部署

### 构建前端
```bash
cd client
npm run build
```

### 启动生产服务器
```bash
cd server
NODE_ENV=production npm start
```

## API文档

详细的API文档请参考 [api-docs.md](./api-docs.md)

### 主要API端点

**认证**
- `POST /api/auth/register` - 用户注册
- `POST /api/auth/login` - 用户登录
- `GET /api/auth/me` - 获取当前用户

**笔记**
- `GET /api/notes` - 获取所有笔记
- `GET /api/notes/:id` - 获取单个笔记
- `POST /api/notes` - 创建笔记
- `PUT /api/notes/:id` - 更新笔记
- `DELETE /api/notes/:id` - 删除笔记

**版本控制**
- `GET /api/notes/:id/versions` - 获取版本列表
- `GET /api/notes/:id/versions/:versionId` - 获取单个版本
- `POST /api/notes/:id/versions/:versionId/restore` - 恢复版本

**权限**
- `PUT /api/notes/:id/permissions` - 更新权限

### WebSocket事件

**客户端发送**
- `join-note` - 加入笔记
- `leave-note` - 离开笔记
- `doc-update` - 文档更新
- `cursor-update` - 光标更新
- `save-note` - 保存笔记

**服务端发送**
- `note-joined` - 成功加入
- `doc-update` - 远程文档更新
- `title-update` - 标题更新
- `cursor-update` - 远程光标更新
- `users-updated` - 协作者列表更新
- `note-saved` - 笔记已保存
- `save-success` - 保存成功
- `save-error` - 保存失败

## 数据库模型

### User
```javascript
{
  username: String,      // 唯一，3-30字符
  email: String,         // 唯一
  password: String,      // bcrypt加密
  role: String,          // admin | editor | reader
  createdAt: Date,
  updatedAt: Date
}
```

### Note
```javascript
{
  title: String,
  content: String,
  createdBy: ObjectId,   // 引用User
  permissions: Map,      // userId -> permission
  isPublic: Boolean,
  publicPermission: String, // none | reader | editor
  createdAt: Date,
  updatedAt: Date,
  lastModifiedBy: ObjectId
}
```

### NoteVersion
```javascript
{
  noteId: ObjectId,      // 引用Note
  title: String,
  content: String,
  createdBy: ObjectId,
  versionNumber: Number,
  changeSummary: String,
  createdAt: Date
}
```

## 权限系统

### 用户角色（系统级别）
| 角色 | 权限 |
|------|------|
| admin | 完全访问 |
| editor | 可创建和编辑笔记 |
| reader | 只能查看分享的笔记 |

### 笔记权限（笔记级别）
| 权限 | 说明 | 可执行操作 |
|------|------|-----------|
| owner | 所有者 | 编辑、删除、管理权限、版本控制 |
| editor | 编辑者 | 编辑、版本控制 |
| reader | 阅读者 | 仅查看 |
| none | 无权限 | 无 |

## 实时协作机制

### 文档同步
- 使用操作转换（OT）简化版本
- 基于操作顺序的冲突解决
- 最后写入生效（LWW）策略

### 自动保存
- 2秒内无操作自动保存
- 通过Socket.io或REST API保存
- 每分钟自动创建新版本

### 版本控制
- 每次保存检查最近1分钟内是否有版本
- 防止频繁创建版本
- 手动恢复时会先保存当前状态

## 安全建议

1. **修改JWT密钥**：修改 `JWT_SECRET` 为强随机字符串
2. **使用HTTPS**：生产环境必须使用HTTPS
3. **配置CORS**：限制 `CLIENT_URL` 为实际域名
4. **输入验证**：前端已有基本验证，建议在Nginx层添加
5. **速率限制**：建议在Nginx或API网关添加

## 故障排除

### MongoDB连接失败
- 确保MongoDB正在运行
- 检查 `MONGODB_URI` 配置
- 验证MongoDB认证（如果启用）

### WebSocket连接失败
- 检查CORS配置
- 确保JWT Token有效
- 检查防火墙设置

### 前端热更新慢
- 确认使用开发模式
- 检查Node.js内存限制
- 考虑使用yarn或pnpm

## 许可证

MIT License

## 贡献

欢迎提交Issue和Pull Request！
