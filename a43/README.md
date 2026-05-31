# 数字孪生智慧实验室管理平台

一个基于 Vue3 + Three.js + FastAPI 的数字孪生实验室管理系统，实现实验室设备的3D可视化、实时监控、预约管理和异常告警功能。

## 技术架构

### 前端
- **框架**: Vue 3 + Vite
- **3D渲染**: Three.js
- **UI组件**: Element Plus
- **数据可视化**: ECharts
- **HTTP客户端**: Axios

### 后端
- **Web框架**: FastAPI
- **MQTT客户端**: paho-mqtt
- **数据库**: 
  - PostgreSQL (设备档案、预约信息)
  - SQLite (开发环境，默认启用)
  - TimescaleDB (时序数据，生产环境)
- **ORM**: SQLAlchemy
- **实时通信**: WebSocket

## 功能特性

1. **3D数字孪生场景**
   - Three.js渲染实验室3D模型
   - 实验台、通风橱、仪器设备的3D可视化
   - 设备状态指示灯（运行/待机/故障）
   - 鼠标悬停和点击交互

2. **设备信息面板**
   - 显示设备基本信息（名称、型号、位置）
   - 实时数据展示（温度、湿度、功率、压力）
   - 活动告警提示

3. **MQTT消息接入**
   - 订阅IoT传感器数据
   - 支持单条和批量数据插入
   - 自动设备注册

4. **实验预约管理**
   - 设备预约创建
   - 实时冲突检测
   - 预约取消功能

5. **告警规则引擎**
   - 温度超阈值告警
   - 湿度异常告警
   - 功率超限告警
   - WebSocket实时推送

6. **数据趋势图表**
   - 1小时/24小时/7天时间范围切换
   - 温度、湿度、功率多维度展示
   - 可视化阈值范围

## 项目结构

```
a43/
├── backend/                    # 后端项目
│   ├── requirements.txt       # Python依赖
│   └── app/
│       ├── __init__.py
│       ├── main.py            # FastAPI主入口
│       ├── config.py          # 配置文件
│       ├── database.py        # 数据库连接
│       ├── models.py          # 数据模型
│       ├── schemas.py         # Pydantic模型
│       ├── mqtt_client.py     # MQTT客户端
│       ├── alert_engine.py    # 告警引擎
│       ├── websocket_manager.py # WebSocket管理
│       └── routers/
│           ├── devices.py     # 设备API
│           ├── reservations.py # 预约API
│           ├── sensor_data.py # 传感器数据API
│           └── alerts.py      # 告警API
├── frontend/                  # 前端项目
│   ├── package.json
│   ├── vite.config.js
│   ├── index.html
│   └── src/
│       ├── main.js
│       ├── App.vue            # 主应用组件
│       ├── api/
│       │   └── index.js       # API服务
│       └── components/
│           ├── LabScene.vue      # 3D场景组件
│           ├── DeviceInfoPanel.vue # 设备信息面板
│           └── SensorDataChart.vue # 数据图表
└── README.md
```

## 快速开始

### 后端启动

1. 进入后端目录:
```bash
cd backend
```

2. 安装依赖:
```bash
pip install -r requirements.txt
```

3. 启动服务:
```bash
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

后端服务将在 `http://localhost:8000` 启动

API文档:
- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

### 前端启动

1. 进入前端目录:
```bash
cd frontend
```

2. 安装依赖:
```bash
npm install
```

3. 启动开发服务器:
```bash
npm run dev
```

前端服务将在 `http://localhost:3000` 启动

## 配置说明

### 环境变量

#### 后端配置

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `MQTT_BROKER` | `test.mosquitto.org` | MQTT代理服务器地址 |
| `MQTT_PORT` | `1883` | MQTT端口 |
| `MQTT_TOPIC` | `lab/sensors/#` | 订阅主题 |
| `MQTT_CLIENT_ID` | `lab_backend` | 客户端ID |
| `DATABASE_URL` | `postgresql+psycopg2://postgres:postgres@localhost:5432/lab_platform` | PostgreSQL连接 |
| `USE_SQLITE` | `true` | 是否使用SQLite（开发环境） |

### MQTT消息格式

传感器数据消息格式:
```json
{
  "device_id": "HPLC_001",
  "temperature": 25.5,
  "humidity": 55.2,
  "pressure": 101.3,
  "power": 1200,
  "status": "running",
  "device_type": "HPLC"
}
```

## 测试数据生成

前端应用会自动生成模拟传感器数据，也可以通过MQTT发送真实数据进行测试。

### MQTT测试

使用 mosquitto_pub 发送测试数据:
```bash
mosquitto_pub -h test.mosquitto.org -t "lab/sensors/HPLC_001" -m '{"device_id":"HPLC_001","temperature":25.5,"humidity":55,"pressure":101.3,"power":1500,"status":"running"}'
```

## API接口

### 设备管理
- `GET /api/devices/` - 获取设备列表
- `GET /api/devices/{device_id}` - 获取设备详情
- `GET /api/devices/{device_id}/realtime` - 获取实时数据
- `GET /api/devices/{device_id}/history` - 获取历史数据

### 预约管理
- `GET /api/reservations/` - 获取预约列表
- `POST /api/reservations/` - 创建预约
- `GET /api/reservations/check-conflict` - 检查冲突
- `DELETE /api/reservations/{id}` - 取消预约

### 传感器数据
- `POST /api/sensor-data/` - 插入单条数据
- `POST /api/sensor-data/batch` - 批量插入
- `GET /api/sensor-data/range` - 获取时间范围数据

### 告警管理
- `GET /api/alerts/` - 获取告警列表
- `GET /api/alerts/active` - 获取活动告警
- `PUT /api/alerts/{id}/acknowledge` - 确认告警
- `PUT /api/alerts/acknowledge-all` - 全部确认

### WebSocket
- `ws://localhost:8000/ws/alerts` - 告警实时推送

## 告警规则

内置告警规则:
| 参数 | 条件 | 阈值 | 说明 |
|------|------|------|------|
| 温度 | 范围 | 15-35°C | 正常范围 |
| 温度 | > | 40°C | 高温告警 |
| 温度 | < | 10°C | 低温告警 |
| 湿度 | 范围 | 30-70% | 正常范围 |
| 湿度 | > | 85% | 高湿告警 |
| 湿度 | < | 20% | 低湿告警 |
| 功率 | > | 5000W | 功率告警 |

## 生产环境部署

1. 设置 `USE_SQLITE=false`
2. 配置PostgreSQL和TimescaleDB
3. 配置内部MQTT代理
4. 使用gunicorn或uvicorn workers部署

### 数据库初始化

```sql
-- PostgreSQL + TimescaleDB
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- 将sensor_data转换为超表
SELECT create_hypertable('sensor_data', 'timestamp');
```

## License

MIT
