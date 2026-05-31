from datetime import datetime
from typing import Optional, Dict, Any
from pydantic import BaseModel

from ..models.task import TaskStatus, TaskType


class TaskBase(BaseModel):
    sample_id: str
    task_type: TaskType = TaskType.VARIANT_CALLING
    algorithm: str = "gatk_haplotypecaller"
    parameters: Dict[str, Any] = {}


class TaskCreate(TaskBase):
    pass


class TaskUpdate(BaseModel):
    status: Optional[TaskStatus] = None
    error_message: Optional[str] = None


class TaskResponse(BaseModel):
    id: int
    task_id: str
    task_type: TaskType
    status: TaskStatus
    sample_id: str
    algorithm: str
    parameters: Dict[str, Any]
    celery_task_id: Optional[str]
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    error_message: Optional[str]
    vcf_object_name: Optional[str]
    created_at: datetime
    updated_at: datetime
    result_summary: Dict[str, Any]

    class Config:
        from_attributes = True


class TaskListResponse(BaseModel):
    items: list[TaskResponse]
    total: int
    page: int
    page_size: int
