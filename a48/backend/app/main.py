from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from .database import engine, Base
from .api import documents, pipeline, ocr, annotations, style_transfer


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(
    title="古籍文档智能修复与OCR平台",
    description="多模态古籍文档智能修复与OCR流水线平台",
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

app.include_router(documents.router)
app.include_router(pipeline.router)
app.include_router(ocr.router)
app.include_router(annotations.router)
app.include_router(style_transfer.router)


@app.get("/")
async def root():
    return {
        "name": "古籍文档智能修复与OCR平台",
        "version": "1.0.0",
        "status": "running"
    }


@app.get("/health")
async def health_check():
    return {"status": "healthy"}
