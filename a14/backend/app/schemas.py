from pydantic import BaseModel
from typing import Optional, Dict, Any, List
from datetime import datetime


class ProjectBase(BaseModel):
    name: str
    description: Optional[str] = None


class ProjectCreate(ProjectBase):
    pass


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


class Project(ProjectBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class TrajectoryFileBase(BaseModel):
    name: str
    file_type: str
    file_path: str
    topology_path: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


class TrajectoryFile(TrajectoryFileBase):
    id: int
    project_id: int
    created_at: datetime

    class Config:
        from_attributes = True


class AnalysisResultBase(BaseModel):
    analysis_type: str
    name: str
    config: Optional[Dict[str, Any]] = None
    result_data: Optional[Dict[str, Any]] = None


class AnalysisResultCreate(AnalysisResultBase):
    pass


class AnalysisResult(AnalysisResultBase):
    id: int
    project_id: int
    created_at: datetime

    class Config:
        from_attributes = True


class AnalysisConfig(BaseModel):
    start: Optional[int] = 0
    stop: Optional[int] = None
    step: Optional[int] = 1
    selection: Optional[str] = "all"
    reference_selection: Optional[str] = None


class RMSDConfig(AnalysisConfig):
    pass


class RMSFConfig(AnalysisConfig):
    pass


class RDFConfig(AnalysisConfig):
    nbins: int = 75
    range_start: float = 0.0
    range_end: float = 15.0
    g1: str = "name O"
    g2: str = "name O"


class UploadResponse(BaseModel):
    success: bool
    message: str
    file_id: Optional[int] = None
