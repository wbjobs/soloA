from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from .database import engine, Base, SessionLocal
from .minio_client import ensure_bucket
from .models import User, UserRole
from . import crud
from .routers import auth, dicom, report, audit, volume, annotation, report_template


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)

    try:
        ensure_bucket()
    except Exception as e:
        print(f"Warning: Could not ensure MinIO bucket: {e}")

    db = SessionLocal()
    try:
        admin_user = crud.get_user_by_username(db, "admin")
        if not admin_user:
            crud.create_user(
                db,
                username="admin",
                email="admin@example.com",
                password="admin123",
                full_name="系统管理员",
                role=UserRole.ADMIN
            )
        doctor_user = crud.get_user_by_username(db, "doctor")
        if not doctor_user:
            crud.create_user(
                db,
                username="doctor",
                email="doctor@example.com",
                password="doctor123",
                full_name="张医生",
                role=UserRole.DOCTOR
            )
        tech_user = crud.get_user_by_username(db, "technician")
        if not tech_user:
            crud.create_user(
                db,
                username="technician",
                email="technician@example.com",
                password="tech123",
                full_name="李技师",
                role=UserRole.TECHNICIAN
            )
    finally:
        db.close()

    yield


app = FastAPI(
    title="医学影像 PACS 管理与 AI 辅助诊断平台",
    description="支持 DICOM 管理、AI 辅助诊断的 PACS 系统",
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

app.include_router(auth.router)
app.include_router(dicom.router)
app.include_router(report.router)
app.include_router(audit.router)
app.include_router(volume.router)
app.include_router(annotation.router)
app.include_router(report_template.router)


@app.get("/")
async def root():
    return {"message": "医学影像 PACS 管理与 AI 辅助诊断平台 API"}


@app.get("/health")
async def health_check():
    return {"status": "healthy"}
