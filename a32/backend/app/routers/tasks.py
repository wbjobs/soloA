import uuid
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.sample import Sample
from ..models.task import AnalysisTask, TaskStatus, TaskType
from ..schemas.task import TaskCreate, TaskResponse, TaskListResponse

router = APIRouter(prefix="/api/tasks", tags=["tasks"])


@router.get("", response_model=TaskListResponse)
def list_tasks(
    page: int = 1,
    page_size: int = 20,
    status: Optional[TaskStatus] = None,
    sample_id: Optional[str] = None,
    db: Session = Depends(get_db),
):
    query = db.query(AnalysisTask)

    if status:
        query = query.filter(AnalysisTask.status == status)
    if sample_id:
        query = query.filter(AnalysisTask.sample_id == sample_id)

    total = query.count()

    tasks = query.order_by(AnalysisTask.created_at.desc()).offset(
        (page - 1) * page_size
    ).limit(page_size).all()

    return TaskListResponse(
        items=[TaskResponse.model_validate(t) for t in tasks],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("", response_model=TaskResponse)
def create_task(task_data: TaskCreate, db: Session = Depends(get_db)):
    sample = db.query(Sample).filter(Sample.sample_id == task_data.sample_id).first()
    if not sample:
        raise HTTPException(status_code=404, detail="Sample not found")

    if not sample.bam_object_name:
        raise HTTPException(status_code=400, detail="Sample has no BAM file")

    task_id = f"task_{uuid.uuid4().hex}"

    task = AnalysisTask(
        task_id=task_id,
        task_type=task_data.task_type,
        sample_id=task_data.sample_id,
        algorithm=task_data.algorithm,
        parameters=task_data.parameters,
        status=TaskStatus.PENDING,
    )

    db.add(task)
    db.commit()
    db.refresh(task)

    try:
        from ..tasks.variant_calling import run_variant_calling
        celery_task = run_variant_calling.delay(task.task_id)
        task.celery_task_id = celery_task.id
        db.commit()
        db.refresh(task)
    except Exception as e:
        task.status = TaskStatus.FAILED
        task.error_message = str(e)
        db.commit()
        db.refresh(task)

    return task


@router.get("/{task_id}", response_model=TaskResponse)
def get_task(task_id: str, db: Session = Depends(get_db)):
    task = db.query(AnalysisTask).filter(AnalysisTask.task_id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    if task.celery_task_id and task.status == TaskStatus.RUNNING:
        try:
            from ..celery_app import celery_app
            celery_result = celery_app.AsyncResult(task.celery_task_id)

            if celery_result.successful():
                task.status = TaskStatus.SUCCESS
                task.completed_at = datetime.utcnow()
                db.commit()
            elif celery_result.failed():
                task.status = TaskStatus.FAILED
                task.error_message = str(celery_result.info)
                task.completed_at = datetime.utcnow()
                db.commit()
        except Exception:
            pass

    return task


@router.delete("/{task_id}")
def cancel_task(task_id: str, db: Session = Depends(get_db)):
    task = db.query(AnalysisTask).filter(AnalysisTask.task_id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    if task.status in [TaskStatus.PENDING, TaskStatus.RUNNING]:
        if task.celery_task_id:
            try:
                from ..celery_app import celery_app
                celery_app.control.revoke(task.celery_task_id, terminate=True)
            except Exception:
                pass

        task.status = TaskStatus.CANCELLED
        db.commit()

    return {"message": "Task cancelled successfully"}
