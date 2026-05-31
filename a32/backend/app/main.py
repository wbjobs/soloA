from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .database import init_db
from .routers import samples, tasks, variants, visualization, structural_variants, comparison


settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(
    title="Bioinformatics Analysis Platform",
    description="Genomic data analysis platform with variant detection and visualization",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(samples.router)
app.include_router(tasks.router)
app.include_router(variants.router)
app.include_router(visualization.router)
app.include_router(structural_variants.router)
app.include_router(comparison.router)


@app.get("/")
def root():
    return {
        "name": "Bioinformatics Analysis Platform",
        "version": "1.0.0",
        "status": "running",
    }


@app.get("/health")
def health_check():
    return {"status": "healthy"}
