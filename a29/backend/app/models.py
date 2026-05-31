from sqlalchemy import Column, Integer, String, Float, DateTime, Text, Enum as SQLEnum
from sqlalchemy.dialects.postgresql import JSONB
from datetime import datetime
import enum
from .database import Base


class TaskStatus(str, enum.Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class SimulationTask(Base):
    __tablename__ = "simulation_tasks"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    status = Column(SQLEnum(TaskStatus), default=TaskStatus.PENDING, index=True)
    progress = Column(Float, default=0.0)

    grid_params = Column(JSONB, nullable=False)
    material_params = Column(JSONB, nullable=False)
    source_params = Column(JSONB, nullable=False)
    solver_params = Column(JSONB, nullable=False)

    created_at = Column(DateTime, default=datetime.utcnow)
    started_at = Column(DateTime)
    completed_at = Column(DateTime)

    hdf5_file_path = Column(String(512))
    error_message = Column(Text)

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "status": self.status.value if self.status else None,
            "progress": self.progress,
            "grid_params": self.grid_params,
            "material_params": self.material_params,
            "source_params": self.source_params,
            "solver_params": self.solver_params,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "hdf5_file_path": self.hdf5_file_path,
            "error_message": self.error_message
        }
