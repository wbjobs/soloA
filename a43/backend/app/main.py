from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import asyncio
from datetime import datetime

from .database import Base, engine, SessionLocal
from .routers import devices, reservations, sensor_data, alerts, consumables
from .mqtt_client import mqtt_client
from .websocket_manager import ws_manager
from .alert_engine import alert_engine
from .models import Device, AlertRule, Consumable, ConsumableCabinet, ConsumableStock

@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    init_db()
    
    mqtt_client.start()
    
    def on_alert(alert_data):
        asyncio.create_task(
            ws_manager.broadcast({
                "type": "alert",
                "data": alert_data
            })
        )
    
    alert_engine.register_callback(on_alert)
    
    yield
    
    mqtt_client.stop()

def init_db():
    db = SessionLocal()
    try:
        existing = db.query(Device).count()
        if existing == 0:
            sample_devices = [
                Device(
                    device_id="HPLC_001",
                    name="高效液相色谱仪 1号",
                    model="Agilent 1260",
                    device_type="HPLC",
                    location="实验室A区-实验台1",
                    status="standby",
                    description="用于有机物分离分析"
                ),
                Device(
                    device_id="GCMS_001",
                    name="气相色谱质谱联用仪",
                    model="Thermo TSQ 9000",
                    device_type="GCMS",
                    location="实验室A区-实验台2",
                    status="running",
                    description="微量有机物定性定量分析"
                ),
                Device(
                    device_id="ICP_001",
                    name="电感耦合等离子体发射光谱仪",
                    model="PerkinElmer Optima 8000",
                    device_type="ICP",
                    location="实验室B区-实验台1",
                    status="standby",
                    description="金属元素分析"
                ),
                Device(
                    device_id="FTIR_001",
                    name="傅里叶变换红外光谱仪",
                    model="Bruker Tensor II",
                    device_type="FTIR",
                    location="实验室B区-实验台2",
                    status="standby",
                    description="有机化合物结构分析"
                ),
                Device(
                    device_id="INCUBATOR_001",
                    name="恒温培养箱",
                    model="Binder BD 240",
                    device_type="INCUBATOR",
                    location="实验室C区",
                    status="running",
                    description="微生物培养"
                )
            ]
            db.bulk_save_objects(sample_devices)
            db.commit()
        
        rules = db.query(AlertRule).count()
        if rules == 0:
            default_rules = [
                AlertRule(parameter="temperature", min_value=15, max_value=35, operator="range", description="温度正常范围15-35°C"),
                AlertRule(parameter="temperature", max_value=40, operator=">", description="高温告警阈值40°C"),
                AlertRule(parameter="humidity", min_value=30, max_value=70, operator="range", description="湿度正常范围30-70%"),
                AlertRule(parameter="power", max_value=5000, operator=">", description="功率告警阈值5000W"),
            ]
            db.bulk_save_objects(default_rules)
            db.commit()
        
        cabinets = db.query(ConsumableCabinet).count()
        if cabinets == 0:
            sample_cabinets = [
                ConsumableCabinet(
                    cabinet_id="CAB_001",
                    name="试剂柜A",
                    location="实验室西区",
                    description="存放常用化学试剂"
                ),
                ConsumableCabinet(
                    cabinet_id="CAB_002",
                    name="耗材柜B",
                    location="实验室东区",
                    description="存放实验耗材和玻璃器皿"
                ),
                ConsumableCabinet(
                    cabinet_id="CAB_003",
                    name="样品柜C",
                    location="实验室南区",
                    description="存放标准样品和对照品"
                )
            ]
            db.bulk_save_objects(sample_cabinets)
            db.commit()
        
        consumables = db.query(Consumable).count()
        if consumables == 0:
            sample_consumables = [
                Consumable(
                    consumable_id="MAT_001",
                    name="甲醇(色谱纯)",
                    category="试剂",
                    unit="瓶",
                    safety_threshold=5.0,
                    min_order_quantity=10.0,
                    lead_time_days=3,
                    description="HPLC级甲醇"
                ),
                Consumable(
                    consumable_id="MAT_002",
                    name="乙腈(色谱纯)",
                    category="试剂",
                    unit="瓶",
                    safety_threshold=5.0,
                    min_order_quantity=10.0,
                    lead_time_days=3,
                    description="HPLC级乙腈"
                ),
                Consumable(
                    consumable_id="MAT_003",
                    name="一次性注射器",
                    category="耗材",
                    unit="盒",
                    safety_threshold=20.0,
                    min_order_quantity=50.0,
                    lead_time_days=7,
                    description="1mL注射器"
                ),
                Consumable(
                    consumable_id="MAT_004",
                    name="移液枪头",
                    category="耗材",
                    unit="盒",
                    safety_threshold=30.0,
                    min_order_quantity=100.0,
                    lead_time_days=5,
                    description="1000μL枪头"
                ),
                Consumable(
                    consumable_id="MAT_005",
                    name="一次性手套",
                    category="耗材",
                    unit="盒",
                    safety_threshold=10.0,
                    min_order_quantity=20.0,
                    lead_time_days=7,
                    description="无粉乳胶手套"
                ),
                Consumable(
                    consumable_id="MAT_006",
                    name="超纯水",
                    category="试剂",
                    unit="瓶",
                    safety_threshold=3.0,
                    min_order_quantity=6.0,
                    lead_time_days=2,
                    description="HPLC级超纯水"
                )
            ]
            db.bulk_save_objects(sample_consumables)
            db.commit()
        
        stocks = db.query(ConsumableStock).count()
        if stocks == 0:
            sample_stocks = [
                ConsumableStock(consumable_id="MAT_001", cabinet_id="CAB_001", quantity=15.0, reserved_quantity=0.0),
                ConsumableStock(consumable_id="MAT_002", cabinet_id="CAB_001", quantity=8.0, reserved_quantity=0.0),
                ConsumableStock(consumable_id="MAT_003", cabinet_id="CAB_002", quantity=25.0, reserved_quantity=0.0),
                ConsumableStock(consumable_id="MAT_004", cabinet_id="CAB_002", quantity=15.0, reserved_quantity=0.0),
                ConsumableStock(consumable_id="MAT_005", cabinet_id="CAB_002", quantity=5.0, reserved_quantity=0.0),
                ConsumableStock(consumable_id="MAT_006", cabinet_id="CAB_003", quantity=2.0, reserved_quantity=0.0)
            ]
            db.bulk_save_objects(sample_stocks)
            db.commit()
    finally:
        db.close()

app = FastAPI(
    title="数字孪生智慧实验室管理平台",
    description="基于Vue3+Three.js和FastAPI的实验室IoT管理系统",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(devices.router)
app.include_router(reservations.router)
app.include_router(sensor_data.router)
app.include_router(alerts.router)
app.include_router(consumables.router)

@app.websocket("/ws/alerts")
async def websocket_endpoint(websocket: WebSocket):
    await ws_manager.connect(websocket)
    try:
        await ws_manager.send_personal_message({
            "type": "connection",
            "data": {"status": "connected", "timestamp": datetime.utcnow().isoformat()}
        }, websocket)
        
        while True:
            data = await websocket.receive_text()
            try:
                message = eval(data) if '{' in data else {}
                if message.get("type") == "ping":
                    await ws_manager.send_personal_message({
                        "type": "pong",
                        "timestamp": datetime.utcnow().isoformat()
                    }, websocket)
            except:
                pass
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)

@app.get("/")
async def root():
    return {
        "message": "数字孪生智慧实验室管理平台 API",
        "version": "1.0.0",
        "docs": "/docs",
        "mqtt_status": "connected" if mqtt_client.connected else "disconnected"
    }

@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "mqtt": "connected" if mqtt_client.connected else "disconnected",
        "timestamp": datetime.utcnow().isoformat()
    }
