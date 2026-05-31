from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from fastapi.responses import FileResponse
from app.services.fits_service import FITSService
from app.models import FITSMetadata
import os
import uuid

router = APIRouter()
fits_service = FITSService()

UPLOAD_DIR = "uploads/fits"
os.makedirs(UPLOAD_DIR, exist_ok=True)


@router.post("/upload")
async def upload_fits(file: UploadFile = File(...)):
    """上传FITS文件"""
    if not file.filename.lower().endswith(('.fits', '.fit', '.fits.gz')):
        raise HTTPException(status_code=400, detail="只允许上传FITS文件 (.fits, .fit, .fits.gz)")
    
    file_id = str(uuid.uuid4())
    ext = os.path.splitext(file.filename)[1]
    file_path = os.path.join(UPLOAD_DIR, f"{file_id}{ext}")
    
    with open(file_path, "wb") as f:
        content = await file.read()
        f.write(content)
    
    metadata = await fits_service.get_metadata(file_path)
    
    return {
        "file_id": file_id,
        "original_name": file.filename,
        "file_size": len(content),
        "metadata": metadata
    }


@router.get("/metadata/{file_id}", response_model=FITSMetadata)
async def get_fits_metadata(file_id: str):
    """获取已上传FITS文件的元数据"""
    file_path = await _find_file(file_id)
    if not file_path:
        raise HTTPException(status_code=404, detail="文件未找到")
    
    return await fits_service.get_metadata(file_path)


@router.get("/preview/{file_id}")
async def get_fits_preview(file_id: str, ext: str = "fits"):
    """获取FITS文件的预览图"""
    file_path = os.path.join(UPLOAD_DIR, f"{file_id}.{ext}")
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="文件未找到")
    
    preview_path = await fits_service.generate_preview(file_path, file_id)
    return FileResponse(preview_path, media_type="image/png")


@router.get("/header/{file_id}")
async def get_fits_header(file_id: str, ext: str = "fits"):
    """获取FITS文件的完整头信息"""
    file_path = os.path.join(UPLOAD_DIR, f"{file_id}.{ext}")
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="文件未找到")
    
    return await fits_service.get_full_header(file_path)


async def _find_file(file_id: str):
    for ext in ['.fits', '.fit', '.fits.gz']:
        path = os.path.join(UPLOAD_DIR, f"{file_id}{ext}")
        if os.path.exists(path):
            return path
    return None
