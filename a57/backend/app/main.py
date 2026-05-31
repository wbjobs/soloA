from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from .config import settings
from .api.data_routes import router as data_router
from .api.alert_routes import router as alert_router
from .api.rules_routes import router as rules_router
from .api.stats_routes import router as stats_router
from .api.analysis_routes import router as analysis_router
from .services.service_manager import ServiceManager

service_manager = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global service_manager
    service_manager = ServiceManager()
    
    yield
    
    if service_manager:
        service_manager.close()

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.API_VERSION,
    description="Industrial IoT Analytics Platform for Time Series Sensor Data",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(data_router)
app.include_router(alert_router)
app.include_router(rules_router)
app.include_router(stats_router)
app.include_router(analysis_router)

@app.get("/")
async def root():
    return {
        "name": settings.APP_NAME,
        "version": settings.API_VERSION,
        "status": "running",
        "endpoints": {
            "data_ingestion": "/api/data/ingest",
            "data_query": "/api/data/query",
            "alerts": "/api/alerts",
            "association_rules": "/api/rules",
            "statistics": "/api/stats",
            "health": "/api/stats/health",
            "root_cause_analysis": "/api/analysis/root-cause/{alert_id}",
            "notifications": "/api/analysis/notifications",
            "topology": "/api/analysis/topology"
        }
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True
    )
