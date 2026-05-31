from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings, ensure_directories
from .database import init_db
from .routers import projects, files, analysis, export

ensure_directories()
init_db()

app = FastAPI(
    title=settings.app_name,
    description="Molecular Dynamics Simulation Data Processing and Visualization Platform",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(projects.router)
app.include_router(files.router)
app.include_router(analysis.router)
app.include_router(export.router)


@app.get("/")
def root():
    return {
        "name": settings.app_name,
        "version": "1.0.0",
        "status": "running"
    }


@app.get("/health")
def health():
    return {"status": "healthy"}
