from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from fastapi.responses import JSONResponse
import json

from ..database import get_db
from .. import crud

router = APIRouter(prefix="/api/export", tags=["export"])


@router.get("/project/{project_id}")
def export_project(project_id: int, db: Session = Depends(get_db)):
    db_project = crud.get_project(db, project_id=project_id)
    if db_project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    
    files = crud.get_project_files(db, project_id=project_id)
    analysis = crud.get_project_analysis(db, project_id=project_id)
    
    export_data = {
        "project": {
            "id": db_project.id,
            "name": db_project.name,
            "description": db_project.description,
            "created_at": db_project.created_at.isoformat() if db_project.created_at else None,
            "updated_at": db_project.updated_at.isoformat() if db_project.updated_at else None
        },
        "files": [
            {
                "id": f.id,
                "name": f.name,
                "file_type": f.file_type,
                "file_path": f.file_path,
                "metadata": f.metadata,
                "created_at": f.created_at.isoformat() if f.created_at else None
            }
            for f in files
        ],
        "analysis_results": [
            {
                "id": a.id,
                "analysis_type": a.analysis_type,
                "name": a.name,
                "config": a.config,
                "result_data": a.result_data,
                "created_at": a.created_at.isoformat() if a.created_at else None
            }
            for a in analysis
        ]
    }
    
    return JSONResponse(
        content=export_data,
        headers={
            "Content-Disposition": f'attachment; filename="project_{project_id}_export.json"'
        }
    )


@router.get("/analysis/{result_id}")
def export_analysis_result(result_id: int, db: Session = Depends(get_db)):
    db_result = crud.get_analysis_result(db, result_id=result_id)
    if db_result is None:
        raise HTTPException(status_code=404, detail="Analysis result not found")
    
    export_data = {
        "id": db_result.id,
        "project_id": db_result.project_id,
        "analysis_type": db_result.analysis_type,
        "name": db_result.name,
        "config": db_result.config,
        "result_data": db_result.result_data,
        "created_at": db_result.created_at.isoformat() if db_result.created_at else None
    }
    
    return JSONResponse(
        content=export_data,
        headers={
            "Content-Disposition": f'attachment; filename="analysis_{result_id}_export.json"'
        }
    )
