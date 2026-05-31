# ETL 数据集成平台

一个基于低代码的 ETL 数据集成平台，支持拖拽式流程设计、多种数据源连接、版本管理、定时调度和实时监控。

## 功能特性

- **多数据源支持**：MySQL、PostgreSQL、CSV 文件、REST API
- **可视化流程设计**：基于 ReactFlow 的拖拽式流程编辑器
- **多种处理节点**：
  - 数据源输入（Source）
  - 数据过滤（Filter）
  - 字段映射（Mapping）
  - 数据聚合（Aggregate）
  - 数据输出（Sink）
- **流程版本管理**：保存历史版本、对比差异、版本回滚
- **发布上线**：草稿态和发布态分离，确保生产环境稳定
- **定时调度**：基于 Cron 表达式的定时执行
- **实时监控**：WebSocket 实时推送执行进度和日志
- **数据预览**：执行后展示前 100 条数据

## 技术栈

### 后端
- Node.js + NestJS
- TypeORM + PostgreSQL
- Bull Queue + Redis
- Socket.IO

### 前端
- React 18 + TypeScript
- ReactFlow（可视化流程编辑）
- Ant Design（UI 组件库）
- Zustand（状态管理）
- Socket.IO Client（实时通信）

## 项目结构

```
etl-platform/
├── backend/                 # 后端服务
│   ├── src/
│   │   ├── entities/        # 数据库实体
│   │   ├── datasource/      # 数据源模块
│   │   ├── flow/            # 流程管理模块
│   │   ├── etl/             # ETL 执行引擎
│   │   ├── execution/       # 执行记录模块
│   │   ├── scheduler/       # 定时调度模块
│   │   └── websocket/       # WebSocket 模块
│   ├── package.json
│   └── Dockerfile
├── frontend/                # 前端应用
│   ├── src/
│   │   ├── pages/           # 页面组件
│   │   ├── api/             # API 客户端
│   │   ├── store/           # 状态管理
│   │   ├── types/           # 类型定义
│   │   └── App.tsx
│   ├── package.json
│   └── Dockerfile
├── docker-compose.yml       # Docker 编排
└── README.md
```

## 快速开始

### 方式一：使用 Docker（推荐）

```bash
# 启动所有服务
docker-compose up -d

# 查看日志
docker-compose logs -f
```

服务访问地址：
- 前端：http://localhost:5173
- 后端 API：http://localhost:3000

### 方式二：本地开发

#### 1. 启动依赖服务

需要 PostgreSQL 和 Redis：

```bash
# 使用 Docker 启动 PostgreSQL 和 Redis
docker run -d --name etl-postgres -p 5432:5432 -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=etl_platform postgres:15
docker run -d --name etl-redis -p 6379:6379 redis:7
```

#### 2. 安装依赖

```bash
# 后端
cd backend
npm install

# 前端
cd ../frontend
npm install
```

#### 3. 配置环境变量

复制后端的 `.env.example` 为 `.env` 并修改配置：

```bash
cd backend
cp .env.example .env
```

#### 4. 启动服务

```bash
# 启动后端（端口 3000）
cd backend
npm run start:dev

# 启动前端（端口 5173）
cd frontend
npm run dev
```

## API 接口

### 数据源管理
- `GET /api/datasources` - 获取所有数据源
- `POST /api/datasources` - 创建数据源
- `PUT /api/datasources/:id` - 更新数据源
- `DELETE /api/datasources/:id` - 删除数据源
- `POST /api/datasources/test` - 测试连接

### 流程管理
- `GET /api/flows` - 获取所有流程
- `POST /api/flows` - 创建流程
- `GET /api/flows/:id` - 获取流程详情
- `POST /api/flows/:id/versions` - 保存版本
- `GET /api/flows/:id/versions` - 获取版本列表
- `POST /api/flows/:id/versions/:versionId/rollback` - 回滚版本
- `POST /api/flows/:id/publish` - 发布流程
- `PUT /api/flows/:id/schedule` - 设置定时调度
- `DELETE /api/flows/:id/schedule` - 取消定时调度

### 执行管理
- `GET /api/executions` - 获取执行列表
- `POST /api/executions/run/:flowId` - 执行流程
- `GET /api/executions/:id` - 获取执行详情
- `GET /api/executions/:id/logs` - 获取执行日志
- `GET /api/executions/:id/preview` - 获取预览数据

## 使用流程

### 1. 配置数据源
1. 进入「数据源管理」页面
2. 点击「新建数据源」
3. 选择数据源类型（MySQL/PostgreSQL/CSV/REST API）
4. 填写连接配置
5. 点击「测试连接」验证
6. 点击「确定」保存

### 2. 设计流程
1. 进入「流程设计」页面
2. 点击「新建流程」创建新流程
3. 在编辑器中：
   - 从左侧节点面板拖拽节点到画布
   - 连接节点，形成数据流
   - 选中节点，在右侧配置参数
4. 点击「保存版本」保存当前设计
5. 点击「发布」上线流程

### 3. 执行流程
1. 在流程列表中点击「执行」
2. 或在编辑器中点击「执行」按钮
3. 跳转到执行详情页查看进度

### 4. 定时调度
1. 在流程列表中点击「调度」
2. 填写 Cron 表达式（如：`0 0 * * *` 每天 0 点执行）
3. 点击「确定」保存

### 5. 查看执行记录
1. 进入「执行记录」页面
2. 查看历史执行列表
3. 点击「详情」查看详细日志和数据预览

## 节点类型说明

### 数据源输入（Source）
- 从配置的数据源读取数据
- 支持 SQL 查询、CSV 文件、API 调用

### 数据过滤（Filter）
- 根据条件过滤数据行
- 支持多种比较操作（等于、包含、大于、小于等）
- 支持 AND/OR 逻辑组合

### 字段映射（Mapping）
- 字段重命名
- 数据类型转换
- 字符串处理（大小写、去空格）

### 数据聚合（Aggregate）
- 按字段分组
- 支持聚合函数：count、sum、avg、min、max、first、last

### 数据输出（Sink）
- 将数据写入目标数据源
- 支持批量写入

## Cron 表达式

常用表达式示例：
- `0 * * * *` - 每小时执行一次
- `0 0 * * *` - 每天 0 点执行
- `0 0 * * 1` - 每周一 0 点执行
- `0 0 1 * *` - 每月 1 号 0 点执行
- `0 */5 * * *` - 每 5 分钟执行一次

格式：`分 时 日 月 周`

## License

MIT
