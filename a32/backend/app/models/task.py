from datetime import datetime
from enum import Enum as PyEnum
from sqlalchemy import Column, Integer, String, DateTime, Text, JSON, ForeignKey, Enum
from sqlalchemy.orm import relationship

from ..database import Base


class TaskStatus(str, PyEnum):
    PENDING = "pending"
    RUNNING = "running"
    SUCCESS = "success"
    FAILED = "failed"
    CANCELLED = "cancelled"


class TaskType(str, PyEnum):
    VARIANT_CALLING = "variant_calling"
    ANNOTATION = "annotation"
    QUALITY_CONTROL = "quality_control"


class AnalysisTask(Base):
    __tablename__ = "analysis_tasks"

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(String, unique=True, index=True, nullable=False)
    task_type = Column(Enum(TaskType), nullable=False)
    status = Column(Enum(TaskStatus), default=TaskStatus.PENDING, index=True)

    sample_id = Column(String, ForeignKey("samples.sample_id"), nullable=False, index=True)

    algorithm = Column(String, default="gatk_haplotypecaller")
    parameters = Column(JSON, default=dict)

    celery_task_id = Column(String, nullable=True, index=True)

    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)

    error_message = Column(Text, nullable=True)

    vcf_object_name = Column(String, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    result_summary = Column(JSON, default=dict)

    sample = relationship("Sample", back_populates="tasks")
    variants = relationship("Variant", back_populates="task")

    def __repr__(self):
        return f"<AnalysisTask {self.task_id}>"
