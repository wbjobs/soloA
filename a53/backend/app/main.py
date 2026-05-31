from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.core.config import STATIC_DIR
from app.routers import map_router, task_router

app = FastAPI(title="像素风地图编辑器 API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

app.include_router(map_router, prefix="/api/maps")
app.include_router(task_router, prefix="/api/tasks")

@app.get("/api/health")
async def health_check():
    return {"status": "healthy"}
