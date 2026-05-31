# 股票因子回测系统

一个基于 FastAPI + Vue3 的前后端分离股票回测平台。

## 技术栈

### 后端
- **FastAPI**: Python Web 框架
- **SQLite**: 关系型数据库（通过 SQLAlchemy ORM）
- **Redis**: 缓存层
- **Pandas**: 数据处理与因子计算

### 前端
- **Vue3**: 渐进式 JavaScript 框架
- **Element Plus**: UI 组件库
- **ECharts**: 数据可视化
- **Axios**: HTTP 客户端
- **Pinia**: 状态管理
- **Vite**: 构建工具

## 功能特性

1. **数据导入**
   - 支持 CSV 格式股票历史数据上传
   - 需包含字段：date, open, high, low, close, volume

2. **因子策略**
   - **MA (移动平均线)**: 金叉死叉信号
   - **RSI (相对强弱指标)**: 超买超卖信号
   - **MACD**: 指数平滑异同移动平均线
   - **Bollinger Bands (布林带)**: 价格通道突破

3. **回测分析**
   - 净值曲线对比（策略 vs 基准）
   - 关键指标：总收益率、年化收益率、最大回撤、夏普比率
   - 实时参数调节与图表刷新

## 项目结构

```
.
├── backend/
│   ├── app/
│   │   ├── routers/
│   │   │   └── stocks.py       # 股票相关路由
│   │   ├── services/
│   │   │   └── factors.py      # 因子计算与回测引擎
│   │   ├── __init__.py
│   │   ├── database.py         # 数据库配置
│   │   ├── main.py             # FastAPI 入口
│   │   ├── models.py           # SQLAlchemy 模型
│   │   ├── redis_client.py     # Redis 客户端
│   │   └── schemas.py          # Pydantic 模型
│   ├── requirements.txt
│   └── run.py
├── frontend/
│   ├── src/
│   │   ├── api/
│   │   │   └── index.js        # API 请求封装
│   │   ├── router/
│   │   │   └── index.js        # 路由配置
│   │   ├── views/
│   │   │   └── Backtest.vue    # 主回测页面
│   │   ├── App.vue
│   │   └── main.js
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
├── sample_data/
│   └── sample_stock_data.csv   # 示例数据
└── README.md
```

## 快速开始

### 环境要求
- Python 3.9+
- Node.js 18+
- Redis（可选，没有会自动降级）

### 后端启动

```bash
cd backend

# 创建虚拟环境
python -m venv venv
venv\Scripts\activate  # Windows

# 安装依赖
pip install -r requirements.txt

# 复制环境变量
copy .env.example .env

# 启动服务
python run.py
```

后端启动后访问：http://localhost:8000
- API 文档：http://localhost:8000/docs

### 前端启动

```bash
cd frontend

# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

前端启动后访问：http://localhost:3000

## 使用指南

1. **导入数据**
   - 输入股票代码（如 AAPL）
   - 上传 CSV 文件（可使用 sample_data 下的示例）
   - 点击"导入数据"

2. **配置因子**
   - 从下拉框选择已导入的股票
   - 勾选要使用的因子（可多选）
   - 调节各因子的参数（滑动条实时生效）

3. **查看结果**
   - 策略净值曲线（紫色）与基准（红色）对比
   - 统计指标卡片显示关键绩效数据

## API 接口

### POST /api/stocks/upload/{symbol}
上传股票 CSV 数据

### GET /api/stocks/symbols
获取已导入的股票列表

### GET /api/stocks/data/{symbol}
获取某只股票的历史数据

### POST /api/stocks/backtest
执行回测
- 请求体：symbol, factors, params

## CSV 数据格式

```csv
date,open,high,low,close,volume
2023-01-03,130.28,130.90,124.17,125.07,112117500
2023-01-04,126.89,128.66,125.08,126.36,89113600
...
```

必需字段：
- `date`: 交易日期
- `open`: 开盘价
- `high`: 最高价
- `low`: 最低价
- `close`: 收盘价
- `volume`: 成交量
