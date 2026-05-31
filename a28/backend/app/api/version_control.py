from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy.orm import Session
from typing import Optional, Dict, Any, List
from pydantic import BaseModel

from app.core.database import get_db
from app.models import Experiment
from app.services.version_control_service import (
    get_or_create_main_branch,
    create_branch,
    create_version,
    list_branches,
    list_versions,
    compare_versions,
    create_merge_request,
    resolve_merge_conflict,
    execute_merge,
    list_merges,
)

router = APIRouter(prefix="/api/experiments/{experiment_id}/versioning", tags=["Version Control"])


class CreateBranchRequest(BaseModel):
    branch_name: str
    source_branch_name: str = "main"
    created_by: str = "user"
    description: Optional[str] = None


class CreateVersionRequest(BaseModel):
    branch_name: str = "main"
    commit_message: str
    created_by: str = "user"
    updates: Dict[str, Any] = {}


class CreateMergeRequest(BaseModel):
    source_branch_name: str
    target_branch_name: str = "main"
    created_by: str = "user"


class ResolveConflictRequest(BaseModel):
    field: str
    resolution: str
    resolved_by: str = "user"


class ExecuteMergeRequest(BaseModel):
    commit_message: str
    merged_by: str = "user"


@router.get("/branches")
def get_branches(experiment_id: int, db: Session = Depends(get_db)):
    try:
        experiment = db.query(Experiment).filter(Experiment.id == experiment_id).first()
        if not experiment:
            raise HTTPException(status_code=404, detail="Experiment not found")

        get_or_create_main_branch(db, experiment)

        return {"experiment_id": experiment_id, "branches": list_branches(db, experiment_id)}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to list branches: {str(e)}")


@router.post("/branches")
def create_new_branch(
    experiment_id: int,
    request: CreateBranchRequest,
    db: Session = Depends(get_db),
):
    try:
        experiment = db.query(Experiment).filter(Experiment.id == experiment_id).first()
        if not experiment:
            raise HTTPException(status_code=404, detail="Experiment not found")

        get_or_create_main_branch(db, experiment, created_by=request.created_by)

        result = create_branch(
            db=db,
            experiment_id=experiment_id,
            branch_name=request.branch_name,
            source_branch_name=request.source_branch_name,
            created_by=request.created_by,
            description=request.description,
        )

        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to create branch: {str(e)}")


@router.get("/branches/{branch_name}/versions")
def get_versions(
    experiment_id: int,
    branch_name: str,
    db: Session = Depends(get_db),
):
    try:
        experiment = db.query(Experiment).filter(Experiment.id == experiment_id).first()
        if not experiment:
            raise HTTPException(status_code=404, detail="Experiment not found")

        versions = list_versions(db, experiment_id, branch_name)
        return {
            "experiment_id": experiment_id,
            "branch_name": branch_name,
            "versions": versions,
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to list versions: {str(e)}")


@router.post("/versions")
def create_new_version(
    experiment_id: int,
    request: CreateVersionRequest,
    db: Session = Depends(get_db),
):
    try:
        experiment = db.query(Experiment).filter(Experiment.id == experiment_id).first()
        if not experiment:
            raise HTTPException(status_code=404, detail="Experiment not found")

        get_or_create_main_branch(db, experiment, created_by=request.created_by)

        result = create_version(
            db=db,
            experiment_id=experiment_id,
            branch_name=request.branch_name,
            commit_message=request.commit_message,
            created_by=request.created_by,
            updates=request.updates,
        )

        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to create version: {str(e)}")


@router.get("/compare")
def compare(
    experiment_id: int,
    version1_id: int = Query(...),
    version2_id: int = Query(...),
    db: Session = Depends(get_db),
):
    try:
        result = compare_versions(db, version1_id, version2_id)
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to compare versions: {str(e)}")


@router.get("/merges")
def get_merges(experiment_id: int, db: Session = Depends(get_db)):
    try:
        merges = list_merges(db, experiment_id)
        return {"experiment_id": experiment_id, "merges": merges}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to list merges: {str(e)}")


@router.post("/merges")
def create_merge(
    experiment_id: int,
    request: CreateMergeRequest,
    db: Session = Depends(get_db),
):
    try:
        experiment = db.query(Experiment).filter(Experiment.id == experiment_id).first()
        if not experiment:
            raise HTTPException(status_code=404, detail="Experiment not found")

        result = create_merge_request(
            db=db,
            experiment_id=experiment_id,
            source_branch_name=request.source_branch_name,
            target_branch_name=request.target_branch_name,
            created_by=request.created_by,
        )

        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to create merge: {str(e)}")


@router.post("/merges/{merge_id}/resolve")
def resolve_conflict(
    experiment_id: int,
    merge_id: int,
    request: ResolveConflictRequest,
    db: Session = Depends(get_db),
):
    try:
        result = resolve_merge_conflict(
            db=db,
            merge_id=merge_id,
            field=request.field,
            resolution=request.resolution,
            resolved_by=request.resolved_by,
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to resolve conflict: {str(e)}")


@router.post("/merges/{merge_id}/execute")
def execute_merge_endpoint(
    experiment_id: int,
    merge_id: int,
    request: ExecuteMergeRequest,
    db: Session = Depends(get_db),
):
    try:
        result = execute_merge(
            db=db,
            merge_id=merge_id,
            commit_message=request.commit_message,
            merged_by=request.merged_by,
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to execute merge: {str(e)}")
