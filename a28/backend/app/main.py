from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.core.config import settings
from app.api import (
    molecules_router,
    reactions_router,
    experiments_router,
    files_router,
    docking_router,
    optimization_router,
    version_control_router,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    from app.core.database import init_db

    try:
        init_db()
    except Exception as e:
        print(f"Warning: Database initialization failed: {e}")
    yield


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.API_VERSION,
    description="Chemical Research Full-Stack Web Application API",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root():
    return {
        "name": settings.APP_NAME,
        "version": settings.API_VERSION,
        "status": "running",
    }


@app.get("/health")
def health_check():
    return {"status": "healthy"}


app.include_router(molecules_router)
app.include_router(reactions_router)
app.include_router(experiments_router)
app.include_router(files_router)
app.include_router(docking_router)
app.include_router(optimization_router)
app.include_router(version_control_router)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
