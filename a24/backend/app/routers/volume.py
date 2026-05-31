import io
from fastapi import APIRouter, Depends, HTTPException, Request, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from typing import Optional
from ..database import get_db
from .. import crud, schemas
from ..auth import get_current_user, require_roles, log_audit
from ..models import User, UserRole, AuditAction
from ..config import settings
from ..minio_client import get_minio_client
from ..volume_utils import load_volume_from_files, compute_mip, compute_minip, compute_average, array_to_png

router = APIRouter(prefix="/api/volume", tags=["volume"])


@router.post("/mip")
async def generate_mip(
    request: Request,
    mip_request: schemas.MIPRequest,
    current_user: User = Depends(require_roles(UserRole.DOCTOR, UserRole.ADMIN)),
    db: Session = Depends(get_db)
):
    series = db.query(crud.Series).filter(crud.Series.id == mip_request.series_id).first()
    if not series:
        raise HTTPException(status_code=404, detail="序列不存在")

    instances = crud.get_instances_by_series(db, mip_request.series_id)
    if not instances:
        raise HTTPException(status_code=404, detail="该序列没有实例")

    slice_start = mip_request.slice_start or 0
    slice_end = mip_request.slice_end or len(instances)
    instances = instances[slice_start:slice_end]

    minio_client = get_minio_client()
    file_bytes_list = []

    for instance in instances:
        try:
            response = minio_client.get_object(settings.DICOM_BUCKET, instance.minio_object_name)
            file_bytes = response.read()
            file_bytes_list.append(file_bytes)
        except Exception as e:
            print(f"Error loading instance {instance.id}: {e}")
            continue

    if not file_bytes_list:
        raise HTTPException(status_code=500, detail="无法加载 DICOM 数据")

    volume = load_volume_from_files(file_bytes_list)
    if volume is None:
        raise HTTPException(status_code=500, detail="无法构建体积数据")

    if mip_request.projection_type == "mip":
        projection = compute_mip(
            volume,
            axis=mip_request.axis,
            window_center=mip_request.window_center,
            window_width=mip_request.window_width
        )
    elif mip_request.projection_type == "minip":
        projection = compute_minip(
            volume,
            axis=mip_request.axis,
            window_center=mip_request.window_center,
            window_width=mip_request.window_width
        )
    elif mip_request.projection_type == "average":
        projection = compute_average(
            volume,
            axis=mip_request.axis,
            window_center=mip_request.window_center,
            window_width=mip_request.window_width
        )
    else:
        raise HTTPException(status_code=400, detail="不支持的投影类型")

    if projection is None:
        raise HTTPException(status_code=500, detail="投影计算失败")

    png_bytes = array_to_png(projection)
    if png_bytes is None:
        raise HTTPException(status_code=500, detail="图像生成失败")

    log_audit(db, current_user, AuditAction.VIEW, request, "volume",
              f"{mip_request.series_id}:{mip_request.projection_type}")

    return StreamingResponse(io.BytesIO(png_bytes), media_type="image/png")


@router.get("/mip/{series_id}")
async def get_mip_image(
    request: Request,
    series_id: int,
    axis: int = Query(0, ge=0, le=2),
    projection_type: str = Query("mip", regex="^(mip|minip|average)$"),
    window_center: Optional[float] = Query(None),
    window_width: Optional[float] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    series = db.query(crud.Series).filter(crud.Series.id == series_id).first()
    if not series:
        raise HTTPException(status_code=404, detail="序列不存在")

    instances = crud.get_instances_by_series(db, series_id)
    if not instances:
        raise HTTPException(status_code=404, detail="该序列没有实例")

    minio_client = get_minio_client()
    file_bytes_list = []

    for instance in instances:
        try:
            response = minio_client.get_object(settings.DICOM_BUCKET, instance.minio_object_name)
            file_bytes = response.read()
            file_bytes_list.append(file_bytes)
        except Exception as e:
            print(f"Error loading instance {instance.id}: {e}")
            continue

    if not file_bytes_list:
        raise HTTPException(status_code=500, detail="无法加载 DICOM 数据")

    volume = load_volume_from_files(file_bytes_list)
    if volume is None:
        raise HTTPException(status_code=500, detail="无法构建体积数据")

    if projection_type == "mip":
        projection = compute_mip(volume, axis=axis, window_center=window_center, window_width=window_width)
    elif projection_type == "minip":
        projection = compute_minip(volume, axis=axis, window_center=window_center, window_width=window_width)
    else:
        projection = compute_average(volume, axis=axis, window_center=window_center, window_width=window_width)

    if projection is None:
        raise HTTPException(status_code=500, detail="投影计算失败")

    png_bytes = array_to_png(projection)
    if png_bytes is None:
        raise HTTPException(status_code=500, detail="图像生成失败")

    log_audit(db, current_user, AuditAction.VIEW, request, "volume",
              f"{series_id}:{projection_type}")

    return StreamingResponse(io.BytesIO(png_bytes), media_type="image/png")


@router.get("/volume-metadata/{series_id}")
async def get_volume_metadata(
    request: Request,
    series_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    series = db.query(crud.Series).filter(crud.Series.id == series_id).first()
    if not series:
        raise HTTPException(status_code=404, detail="序列不存在")

    instances = crud.get_instances_by_series(db, series_id)
    if not instances:
        raise HTTPException(status_code=404, detail="该序列没有实例")

    log_audit(db, current_user, AuditAction.VIEW, request, "volume", str(series_id))

    return {
        "series_id": series_id,
        "dimensions": {
            "slices": len(instances),
            "rows": series.rows,
            "columns": series.columns
        },
        "spacing": {
            "pixel_spacing": series.pixel_spacing,
            "slice_thickness": series.slice_thickness,
            "slice_spacing": series.slice_spacing
        },
        "orientation": series.image_orientation,
        "position": series.image_position,
        "window": {
            "center": series.window_center,
            "width": series.window_width
        },
        "modality": series.modality
    }
