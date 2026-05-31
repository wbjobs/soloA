from typing import List, Optional
from sqlalchemy.orm import Session

from . import models, schemas
from datetime import datetime


def create_project(db: Session, project: schemas.ProjectCreate) -> models.Project:
    db_project = models.Project(
        name=project.name,
        description=project.description
    )
    db.add(db_project)
    db.commit()
    db.refresh(db_project)
    return db_project


def get_project(db: Session, project_id: int) -> Optional[models.Project]:
    return db.query(models.Project).filter(models.Project.id == project_id).first()


def get_projects(db: Session, skip: int = 0, limit: int = 100) -> List[models.Project]:
    return db.query(models.Project).offset(skip).limit(limit).all()


def update_project(
    db: Session, 
    project_id: int, 
    project_data: schemas.ProjectUpdate
) -> Optional[models.Project]:
    db_project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if db_project:
        update_data = project_data.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(db_project, key, value)
        db_project.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(db_project)
    return db_project


def delete_project(db: Session, project_id: int) -> bool:
    db_project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if db_project:
        db.delete(db_project)
        db.commit()
        return True
    return False


def create_trajectory_file(
    db: Session, 
    project_id: int, 
    name: str, 
    file_type: str, 
    file_path: str, 
    topology_path: Optional[str] = None,
    metadata: Optional[dict] = None
) -> models.TrajectoryFile:
    db_file = models.TrajectoryFile(
        project_id=project_id,
        name=name,
        file_type=file_type,
        file_path=file_path,
        topology_path=topology_path,
        metadata=metadata
    )
    db.add(db_file)
    db.commit()
    db.refresh(db_file)
    return db_file


def get_trajectory_file(db: Session, file_id: int) -> Optional[models.TrajectoryFile]:
    return db.query(models.TrajectoryFile).filter(models.TrajectoryFile.id == file_id).first()


def get_project_files(db: Session, project_id: int) -> List[models.TrajectoryFile]:
    return db.query(models.TrajectoryFile).filter(
        models.TrajectoryFile.project_id == project_id
    ).all()


def delete_trajectory_file(db: Session, file_id: int) -> bool:
    db_file = db.query(models.TrajectoryFile).filter(models.TrajectoryFile.id == file_id).first()
    if db_file:
        db.delete(db_file)
        db.commit()
        return True
    return False


def create_analysis_result(
    db: Session,
    project_id: int,
    data: schemas.AnalysisResultCreate
) -> models.AnalysisResult:
    db_result = models.AnalysisResult(
        project_id=project_id,
        analysis_type=data.analysis_type,
        name=data.name,
        config=data.config,
        result_data=data.result_data
    )
    db.add(db_result)
    db.commit()
    db.refresh(db_result)
    return db_result


def get_analysis_result(db: Session, result_id: int) -> Optional[models.AnalysisResult]:
    return db.query(models.AnalysisResult).filter(models.AnalysisResult.id == result_id).first()


def get_project_analysis(db: Session, project_id: int) -> List[models.AnalysisResult]:
    return db.query(models.AnalysisResult).filter(
        models.AnalysisResult.project_id == project_id
    ).all()


def delete_analysis_result(db: Session, result_id: int) -> bool:
    db_result = db.query(models.AnalysisResult).filter(models.AnalysisResult.id == result_id).first()
    if db_result:
        db.delete(db_result)
        db.commit()
        return True
    return False
