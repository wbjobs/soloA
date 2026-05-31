from fastapi import APIRouter, HTTPException, Response
from fastapi.responses import StreamingResponse
from typing import List

from app.services import storage_service

router = APIRouter(prefix="/api/files", tags=["Files"])


@router.get("/list")
def list_files(prefix: str = ""):
    try:
        files = storage_service.list_files(prefix=prefix)
        return {"files": files}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to list files: {str(e)}")


@router.get("/download/{object_name:path}")
def download_file(object_name: str):
    try:
        data = storage_service.download_file(object_name)
        if not data:
            raise HTTPException(status_code=404, detail="File not found")

        filename = object_name.split("/")[-1]
        return Response(
            content=data,
            media_type="application/octet-stream",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
            },
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to download file: {str(e)}")


@router.get("/url/{object_name:path}")
def get_file_url(object_name: str, expires: int = 3600):
    try:
        url = storage_service.get_file_url(object_name, expires=expires)
        if not url:
            raise HTTPException(status_code=404, detail="File not found")

        return {"url": url, "expires_in_seconds": expires}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to get file URL: {str(e)}")
