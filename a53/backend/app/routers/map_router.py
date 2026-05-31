from fastapi import APIRouter, UploadFile, File, HTTPException, Form
from fastapi.responses import JSONResponse
from typing import Optional

from app.modules.storage import save_uploaded_file
from app.modules.tileset_slicer import process_tileset_upload
from app.modules.tasks import bake_lightmap_task, batch_bake_task
from app.schemas import BakeRequest, BatchBakeRequest

router = APIRouter(tags=["maps"])
map_router = router


@router.post("/upload-tileset")
async def upload_tileset(file: UploadFile = File(...)):
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="请上传图片文件")
    
    content = await file.read()
    url = save_uploaded_file(content, file.filename)
    
    return {
        "success": True,
        "url": url,
        "filename": file.filename
    }


@router.post("/slice-tileset")
async def slice_tileset(
    file: UploadFile = File(...),
    tileWidth: int = Form(32),
    tileHeight: int = Form(32),
    margin: int = Form(0),
    spacing: int = Form(0),
    removeEmpty: bool = Form(True)
):
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="请上传图片文件")
    
    if tileWidth <= 0 or tileHeight <= 0:
        raise HTTPException(status_code=400, detail="瓦片尺寸必须大于0")
    
    if tileWidth > 512 or tileHeight > 512:
        raise HTTPException(status_code=400, detail="瓦片尺寸不能超过512像素")
    
    content = await file.read()
    
    try:
        result = process_tileset_upload(
            content,
            tile_width=tileWidth,
            tile_height=tileHeight,
            margin=margin,
            spacing=spacing,
            remove_empty=removeEmpty
        )
        
        return {
            "success": True,
            **result
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/bake")
async def start_bake(request: BakeRequest):
    map_data = request.mapData.model_dump()
    
    task = bake_lightmap_task.delay(map_data, request.ambientLight)
    
    return {
        "success": True,
        "task_id": task.id
    }


@router.post("/batch-bake")
async def start_batch_bake(request: BatchBakeRequest):
    if not request.maps or len(request.maps) == 0:
        raise HTTPException(status_code=400, detail="请提供至少一个地图文件")
    
    if len(request.maps) > 50:
        raise HTTPException(status_code=400, detail="批量烘焙最多支持50个地图")
    
    maps_data = []
    for item in request.maps:
        maps_data.append({
            "name": item.name,
            "mapData": item.mapData.model_dump()
        })
    
    task = batch_bake_task.delay(maps_data, request.ambientLight)
    
    return {
        "success": True,
        "task_id": task.id,
        "total_maps": len(request.maps)
    }
