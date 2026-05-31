from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
from sqlalchemy.orm import Session
from typing import List, Optional

from ..database import get_db
from .. import crud, schemas
from ..services.parser_service import (
    detect_file_type, 
    save_upload_file, 
    load_universe, 
    get_universe_info,
    extract_frame_data,
    get_trajectory_frames
)

router = APIRouter(prefix="/api/files", tags=["files"])


@router.post("/upload/{project_id}")
async def upload_file(
    project_id: int,
    file: UploadFile = File(...),
    topology_id: Optional[int] = Form(None),
    db: Session = Depends(get_db)
):
    db_project = crud.get_project(db, project_id=project_id)
    if db_project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    
    if file.filename is None:
        raise HTTPException(status_code=400, detail="No filename provided")
    
    file_type = detect_file_type(file.filename)
    if file_type == 'unknown':
        raise HTTPException(status_code=400, detail="Unsupported file format")
    
    content = await file.read()
    file_path = await save_upload_file(content, file.filename, project_id)
    
    topology_path = None
    if topology_id:
        topology_file = crud.get_trajectory_file(db, file_id=topology_id)
        if topology_file:
            topology_path = topology_file.file_path
    
    universe = None
    metadata = None
    try:
        if topology_path:
            universe = load_universe(topology_path, file_path)
        else:
            universe = load_universe(file_path)
        metadata = get_universe_info(universe)
    except Exception as e:
        if topology_id is None:
            universe = load_universe(file_path)
            metadata = get_universe_info(universe)
        else:
            pass
    
    db_file = crud.create_trajectory_file(
        db=db,
        project_id=project_id,
        name=file.filename,
        file_type=file_type,
        file_path=file_path,
        topology_path=topology_path,
        metadata=metadata
    )
    
    return {
        "success": True,
        "message": "File uploaded successfully",
        "file_id": db_file.id,
        "file_name": db_file.name,
        "file_type": db_file.file_type,
        "metadata": metadata
    }


@router.get("/{file_id}")
def get_file_info(file_id: int, db: Session = Depends(get_db)):
    db_file = crud.get_trajectory_file(db, file_id=file_id)
    if db_file is None:
        raise HTTPException(status_code=404, detail="File not found")
    return db_file


@router.get("/{file_id}/info")
def get_file_metadata(file_id: int, db: Session = Depends(get_db)):
    db_file = crud.get_trajectory_file(db, file_id=file_id)
    if db_file is None:
        raise HTTPException(status_code=404, detail="File not found")
    
    if db_file.metadata:
        return db_file.metadata
    
    try:
        if db_file.topology_path:
            universe = load_universe(db_file.topology_path, db_file.file_path)
        else:
            universe = load_universe(db_file.file_path)
        return get_universe_info(universe)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load file: {str(e)}")


@router.get("/{file_id}/frame/{frame_index}")
def get_frame_data(
    file_id: int,
    frame_index: int,
    db: Session = Depends(get_db)
):
    db_file = crud.get_trajectory_file(db, file_id=file_id)
    if db_file is None:
        raise HTTPException(status_code=404, detail="File not found")
    
    try:
        if db_file.topology_path:
            universe = load_universe(db_file.topology_path, db_file.file_path)
        else:
            universe = load_universe(db_file.file_path)
        
        if frame_index < 0 or frame_index >= len(universe.trajectory):
            raise HTTPException(status_code=400, detail="Frame index out of range")
        
        return extract_frame_data(universe, frame_index)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to extract frame data: {str(e)}")


@router.get("/{file_id}/frames")
def get_frames_list(
    file_id: int,
    start: int = Query(0, ge=0),
    stop: Optional[int] = Query(None),
    step: int = Query(1, ge=1),
    db: Session = Depends(get_db)
):
    db_file = crud.get_trajectory_file(db, file_id=file_id)
    if db_file is None:
        raise HTTPException(status_code=404, detail="File not found")
    
    try:
        if db_file.topology_path:
            universe = load_universe(db_file.topology_path, db_file.file_path)
        else:
            universe = load_universe(db_file.file_path)
        
        return get_trajectory_frames(universe, start=start, stop=stop, step=step)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load trajectory: {str(e)}")


@router.delete("/{file_id}")
def delete_file(file_id: int, db: Session = Depends(get_db)):
    success = crud.delete_trajectory_file(db, file_id=file_id)
    if not success:
        raise HTTPException(status_code=404, detail="File not found")
    return {"message": "File deleted successfully"}
