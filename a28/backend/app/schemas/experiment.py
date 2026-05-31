from datetime import datetime, date
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field


class ExperimentFileResponse(BaseModel):
    id: int
    filename: str
    file_type: Optional[str] = None
    file_size: Optional[int] = None
    minio_object_name: str
    created_at: datetime

    class Config:
        from_attributes = True


class ExperimentCreate(BaseModel):
    title: str
    researcher: str
    experiment_date: date = Field(default_factory=lambda: datetime.utcnow().date())
    status: str = "planned"
    reaction_id: Optional[int] = None
    temperature: Optional[float] = None
    pressure: Optional[float] = None
    solvent: Optional[str] = None
    catalyst: Optional[str] = None
    reaction_time: Optional[float] = None
    yield_percent: Optional[float] = None
    notes: Optional[str] = None
    reaction_conditions: Optional[Dict[str, Any]] = None
    results: Optional[Dict[str, Any]] = None


class ExperimentUpdate(BaseModel):
    title: Optional[str] = None
    researcher: Optional[str] = None
    experiment_date: Optional[date] = None
    status: Optional[str] = None
    reaction_id: Optional[int] = None
    temperature: Optional[float] = None
    pressure: Optional[float] = None
    solvent: Optional[str] = None
    catalyst: Optional[str] = None
    reaction_time: Optional[float] = None
    yield_percent: Optional[float] = None
    notes: Optional[str] = None
    reaction_conditions: Optional[Dict[str, Any]] = None
    results: Optional[Dict[str, Any]] = None


class ExperimentResponse(BaseModel):
    id: int
    title: str
    researcher: str
    experiment_date: date
    status: str
    reaction_id: Optional[int] = None
    temperature: Optional[float] = None
    pressure: Optional[float] = None
    solvent: Optional[str] = None
    catalyst: Optional[str] = None
    reaction_time: Optional[float] = None
    yield_percent: Optional[float] = None
    notes: Optional[str] = None
    reaction_conditions: Optional[Dict[str, Any]] = None
    results: Optional[Dict[str, Any]] = None
    files: List[ExperimentFileResponse] = []
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ExperimentListResponse(BaseModel):
    id: int
    title: str
    researcher: str
    experiment_date: date
    status: str
    yield_percent: Optional[float] = None
    created_at: datetime

    class Config:
        from_attributes = True
