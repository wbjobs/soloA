from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from enum import Enum


class IntegratorType(str, Enum):
    EULER = "euler"
    SYMPLECTIC = "symplectic"
    RK4 = "rk4"


class AlgorithmType(str, Enum):
    DIRECT = "direct"
    BARNES_HUT = "barnes_hut"


class BodyCreate(BaseModel):
    name: str = Field(..., min_length=1)
    mass: float = Field(..., gt=0)
    radius: Optional[float] = None
    pos_x: float
    pos_y: float
    pos_z: float
    vel_x: float
    vel_y: float
    vel_z: float
    color: Optional[str] = "#ffffff"


class BodyResponse(BodyCreate):
    id: int
    simulation_id: int

    class Config:
        from_attributes = True


class SimulationConfig(BaseModel):
    G: float = Field(default=6.67430e-11, gt=0)
    dt: float = Field(default=1.0, gt=0)
    integrator: IntegratorType = IntegratorType.RK4
    algorithm: AlgorithmType = AlgorithmType.BARNES_HUT
    theta: float = Field(default=0.5, ge=0, le=1)
    enable_collision: bool = True
    save_history: bool = True
    enable_relativity: bool = False
    c: float = Field(default=299792458.0, gt=0)
    softening: float = Field(default=1e-10, ge=0)


class SimulationCreate(BaseModel):
    name: str = Field(..., min_length=1)
    description: Optional[str] = None
    config: SimulationConfig = SimulationConfig()
    bodies: List[BodyCreate] = []


class SimulationResponse(BaseModel):
    id: int
    name: str
    description: Optional[str]
    created_at: Any
    updated_at: Any
    config: SimulationConfig
    bodies: List[BodyResponse] = []

    class Config:
        from_attributes = True


class SimulationStateResponse(BaseModel):
    id: int
    simulation_id: int
    step: int
    time: float
    data: Dict[str, Any]


class SimulationStepRequest(BaseModel):
    steps: int = Field(default=1, ge=1)
