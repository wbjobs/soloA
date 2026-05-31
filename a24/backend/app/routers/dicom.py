import io
import uuid
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Request, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from typing import List, Optional
from ..database import get_db
from .. import crud, schemas
from ..auth import get_current_user, require_roles, log_audit
from ..models import User, UserRole, AuditAction, Series
from ..dicom_utils import parse_dicom_metadata, dicom_to_png
from ..minio_client import get_minio_client
from ..config import settings
from ..tasks.dicom_processing import process_dicom_upload
from ..tasks.ai_detection import run_lung_nodule_detection

router = APIRouter(prefix="/api/dicom", tags=["dicom"])


@router.post("/upload", response_model=schemas.UploadResponse)
async def upload_dicom(
    request: Request,
    files: List[UploadFile] = File(...),
    current_user: User = Depends(require_roles(UserRole.DOCTOR, UserRole.TECHNICIAN, UserRole.ADMIN)),
    db: Session = Depends(get_db)
):
    file_info_list = []
    minio_client = get_minio_client()

    for file in files:
        if not file.filename:
            continue

        try:
            file_bytes = await file.read()
            metadata, error = parse_dicom_metadata(file_bytes)
            if error:
                continue

            minio_object_name = f"{metadata['patient']['patient_id']}/{metadata['study']['study_uid']}/{metadata['series']['series_uid']}/{metadata['instance']['instance_uid']}.dcm"

            minio_client.put_object(
                settings.DICOM_BUCKET,
                minio_object_name,
                io.BytesIO(file_bytes),
                length=len(file_bytes),
                content_type="application/dicom"
            )

            file_info_list.append({
                "filename": file.filename,
                "metadata": metadata,
                "minio_object_name": minio_object_name
            })

        except Exception as e:
            print(f"Error processing file {file.filename}: {e}")
            continue

    if not file_info_list:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="没有有效的 DICOM 文件"
        )

    task = process_dicom_upload.delay(file_info_list)

    log_audit(db, current_user, AuditAction.UPLOAD, request, "dicom", task.id,
              {"file_count": len(file_info_list)})

    return schemas.UploadResponse(
        task_id=task.id,
        status="processing",
        message=f"已上传 {len(file_info_list)} 个 DICOM 文件，正在处理..."
    )


@router.get("/patients", response_model=List[schemas.PatientResponse])
async def get_patients(
    request: Request,
    search: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    patients = crud.get_patients(db, search=search, skip=skip, limit=limit)
    log_audit(db, current_user, AuditAction.VIEW, request, "patients", search or "all")
    return [schemas.PatientResponse.model_validate(p) for p in patients]


@router.get("/patients/{patient_id}/studies", response_model=List[schemas.StudyResponse])
async def get_patient_studies(
    request: Request,
    patient_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    studies = crud.get_studies_by_patient(db, patient_id)
    log_audit(db, current_user, AuditAction.VIEW, request, "studies", str(patient_id))
    return [schemas.StudyResponse.model_validate(s) for s in studies]


@router.get("/studies/{study_id}/series", response_model=List[schemas.SeriesResponse])
async def get_study_series(
    request: Request,
    study_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    series_list = crud.get_series_by_study(db, study_id)
    log_audit(db, current_user, AuditAction.VIEW, request, "series", str(study_id))
    return [schemas.SeriesResponse.model_validate(s) for s in series_list]


@router.get("/series/{series_id}/instances", response_model=schemas.PaginatedInstanceResponse)
async def get_series_instances(
    request: Request,
    series_id: int,
    skip: int = 0,
    limit: int = 50,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    total = crud.get_instance_count_by_series(db, series_id)
    instances = crud.get_instances_by_series_paginated(db, series_id, skip=skip, limit=limit)
    log_audit(db, current_user, AuditAction.VIEW, request, "instances", str(series_id))
    return schemas.PaginatedInstanceResponse(
        total=total,
        skip=skip,
        limit=limit,
        data=[schemas.InstanceResponse.model_validate(i) for i in instances]
    )


@router.get("/instance/{instance_id}/image")
async def get_instance_image(
    request: Request,
    instance_id: int,
    window_center: Optional[float] = None,
    window_width: Optional[float] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    instance = db.query(crud.Instance).filter(crud.Instance.id == instance_id).first()
    if not instance:
        raise HTTPException(status_code=404, detail="实例不存在")

    minio_client = get_minio_client()
    try:
        response = minio_client.get_object(settings.DICOM_BUCKET, instance.minio_object_name)
        file_bytes = response.read()
        png_bytes = dicom_to_png(file_bytes, window_center=window_center, window_width=window_width)

        if png_bytes:
            log_audit(db, current_user, AuditAction.VIEW, request, "image", str(instance_id))
            return StreamingResponse(io.BytesIO(png_bytes), media_type="image/png")

        return StreamingResponse(io.BytesIO(file_bytes), media_type="application/dicom")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取图像失败: {str(e)}")


@router.get("/instance/{instance_id}/download")
async def download_instance(
    request: Request,
    instance_id: int,
    current_user: User = Depends(require_roles(UserRole.DOCTOR, UserRole.ADMIN)),
    db: Session = Depends(get_db)
):
    instance = db.query(crud.Instance).filter(crud.Instance.id == instance_id).first()
    if not instance:
        raise HTTPException(status_code=404, detail="实例不存在")

    minio_client = get_minio_client()
    try:
        response = minio_client.get_object(settings.DICOM_BUCKET, instance.minio_object_name)
        file_bytes = response.read()

        log_audit(db, current_user, AuditAction.DOWNLOAD, request, "dicom", str(instance_id))
        return StreamingResponse(
            io.BytesIO(file_bytes),
            media_type="application/dicom",
            headers={"Content-Disposition": f"attachment; filename={instance.instance_uid}.dcm"}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"下载失败: {str(e)}")


@router.post("/ai/detect", response_model=schemas.TaskStatusResponse)
async def run_ai_detection(
    request: Request,
    detection_request: schemas.AIDetectionRequest,
    current_user: User = Depends(require_roles(UserRole.DOCTOR, UserRole.ADMIN)),
    db: Session = Depends(get_db)
):
    series = db.query(Series).filter(Series.id == detection_request.series_id).first()
    if not series:
        raise HTTPException(status_code=404, detail="序列不存在")

    task = run_lung_nodule_detection.delay(detection_request.series_id)

    detection = crud.create_ai_detection(db, detection_request.series_id, task.id)

    log_audit(db, current_user, AuditAction.AI_DETECTION, request, "series",
              str(detection_request.series_id), {"task_id": task.id})

    return schemas.TaskStatusResponse(
        task_id=task.id,
        status=detection.status,
        created_at=detection.created_at,
        started_at=detection.started_at,
        completed_at=detection.completed_at,
        results=detection.results,
        error_message=detection.error_message
    )


@router.get("/ai/detection/{task_id}", response_model=schemas.TaskStatusResponse)
async def get_ai_detection_status(
    task_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    detections = db.query(crud.AIDetection).filter(crud.AIDetection.task_id == task_id).first()
    if not detections:
        raise HTTPException(status_code=404, detail="任务不存在")

    return schemas.TaskStatusResponse(
        task_id=detections.task_id,
        status=detections.status,
        created_at=detections.created_at,
        started_at=detections.started_at,
        completed_at=detections.completed_at,
        results=detections.results,
        error_message=detections.error_message
    )
