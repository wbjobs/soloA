from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field
from bson import ObjectId


class PyObjectId(ObjectId):
    @classmethod
    def __get_validators__(cls):
        yield cls.validate

    @classmethod
    def validate(cls, v):
        if not ObjectId.is_valid(v):
            raise ValueError("Invalid objectid")
        return ObjectId(v)

    @classmethod
    def __modify_schema__(cls, field_schema):
        field_schema.update(type="string")


class BoundaryCondition(BaseModel):
    name: str
    type: str
    parameters: Dict[str, Any] = {}


class SolverConfig(BaseModel):
    solver: str = "simpleFoam"
    end_time: float = 1000
    delta_t: float = 1
    write_interval: int = 100
    turbulence_model: str = "kEpsilon"


class MeshConfig(BaseModel):
    method: str = "snappyHexMesh"
    base_mesh_size: List[float] = [10, 10, 10]
    refinement_level: int = 2


class CaseBase(BaseModel):
    name: str
    description: Optional[str] = None
    version: int = 1


class CaseCreate(CaseBase):
    mesh_config: MeshConfig
    solver_config: SolverConfig
    boundary_conditions: List[BoundaryCondition] = []


class Case(CaseBase):
    id: PyObjectId = Field(default_factory=PyObjectId, alias="_id")
    status: str = "draft"
    stl_file: Optional[str] = None
    mesh_file: Optional[str] = None
    result_file: Optional[str] = None
    mesh_config: MeshConfig
    solver_config: SolverConfig
    boundary_conditions: List[BoundaryCondition] = []
    mesh_quality: Optional[Dict[str, Any]] = None
    parent_id: Optional[PyObjectId] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        allow_population_by_field_name = True
        arbitrary_types_allowed = True
        json_encoders = {ObjectId: str}


class CaseResponse(CaseBase):
    id: str
    status: str
    mesh_quality: Optional[Dict[str, Any]] = None
    created_at: datetime
    updated_at: datetime


class TaskProgress(BaseModel):
    task_id: str
    task_type: str
    status: str
    progress: float
    message: str
    case_id: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


class LogEntry(BaseModel):
    time: float
    residuals: Dict[str, float]
    execution_time: float
