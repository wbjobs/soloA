from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from sqlalchemy.orm import Session
from typing import List, Optional

from app.core.database import get_db
from app.models import Experiment, ExperimentFile
from app.schemas.experiment import (
    ExperimentCreate,
    ExperimentUpdate,
    ExperimentResponse,
    ExperimentListResponse,
    ExperimentFileResponse,
)
from app.services import storage_service

router = APIRouter(prefix="/api/experiments", tags=["Experiments"])


@router.post("/", response_model=ExperimentResponse)
def create_experiment(
    experiment: ExperimentCreate,
    db: Session = Depends(get_db),
):
    try:
        db_exp = Experiment(
            title=experiment.title,
            researcher=experiment.researcher,
            experiment_date=experiment.experiment_date,
            status=experiment.status,
            reaction_id=experiment.reaction_id,
            temperature=experiment.temperature,
            pressure=experiment.pressure,
            solvent=experiment.solvent,
            catalyst=experiment.catalyst,
            reaction_time=experiment.reaction_time,
            yield_percent=experiment.yield_percent,
            notes=experiment.notes,
            reaction_conditions=experiment.reaction_conditions,
            results=experiment.results,
        )

        db.add(db_exp)
        db.commit()
        db.refresh(db_exp)

        return db_exp
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Failed to create experiment: {str(e)}")


@router.get("/", response_model=List[ExperimentListResponse])
def list_experiments(
    skip: int = 0,
    limit: int = 100,
    researcher: Optional[str] = None,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
):
    query = db.query(Experiment)

    if researcher:
        query = query.filter(Experiment.researcher.ilike(f"%{researcher}%"))
    if status:
        query = query.filter(Experiment.status == status)

    experiments = query.order_by(Experiment.created_at.desc()).offset(skip).limit(limit).all()
    return experiments


@router.get("/{experiment_id}", response_model=ExperimentResponse)
def get_experiment(experiment_id: int, db: Session = Depends(get_db)):
    experiment = db.query(Experiment).filter(Experiment.id == experiment_id).first()
    if not experiment:
        raise HTTPException(status_code=404, detail="Experiment not found")
    return experiment


@router.put("/{experiment_id}", response_model=ExperimentResponse)
def update_experiment(
    experiment_id: int,
    update: ExperimentUpdate,
    db: Session = Depends(get_db),
):
    experiment = db.query(Experiment).filter(Experiment.id == experiment_id).first()
    if not experiment:
        raise HTTPException(status_code=404, detail="Experiment not found")

    try:
        update_data = update.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(experiment, key, value)

        db.commit()
        db.refresh(experiment)

        return experiment
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Failed to update experiment: {str(e)}")


@router.delete("/{experiment_id}")
def delete_experiment(experiment_id: int, db: Session = Depends(get_db)):
    experiment = db.query(Experiment).filter(Experiment.id == experiment_id).first()
    if not experiment:
        raise HTTPException(status_code=404, detail="Experiment not found")

    try:
        for exp_file in experiment.files:
            storage_service.delete_file(exp_file.minio_object_name)

        db.delete(experiment)
        db.commit()

        return {"success": True, "message": "Experiment deleted"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Failed to delete experiment: {str(e)}")


@router.post("/{experiment_id}/files", response_model=List[ExperimentFileResponse])
async def upload_files(
    experiment_id: int,
    files: List[UploadFile] = File(...),
    db: Session = Depends(get_db),
):
    experiment = db.query(Experiment).filter(Experiment.id == experiment_id).first()
    if not experiment:
        raise HTTPException(status_code=404, detail="Experiment not found")

    try:
        uploaded_files = []
        for file in files:
            storage_result = await storage_service.upload_file(
                file, prefix=f"experiments/{experiment_id}"
            )

            db_file = ExperimentFile(
                experiment_id=experiment_id,
                filename=storage_result["filename"],
                minio_object_name=storage_result["object_name"],
                file_type=storage_result["file_type"],
                file_size=storage_result["file_size"],
            )

            db.add(db_file)
            uploaded_files.append(db_file)

        db.commit()
        for f in uploaded_files:
            db.refresh(f)

        return uploaded_files
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Failed to upload files: {str(e)}")


@router.delete("/{experiment_id}/files/{file_id}")
def delete_file(
    experiment_id: int,
    file_id: int,
    db: Session = Depends(get_db),
):
    file = (
        db.query(ExperimentFile)
        .filter(
            ExperimentFile.id == file_id,
            ExperimentFile.experiment_id == experiment_id,
        )
        .first()
    )

    if not file:
        raise HTTPException(status_code=404, detail="File not found")

    try:
        storage_service.delete_file(file.minio_object_name)
        db.delete(file)
        db.commit()

        return {"success": True, "message": "File deleted"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Failed to delete file: {str(e)}")
