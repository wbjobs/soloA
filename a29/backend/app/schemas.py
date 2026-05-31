from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List, Tuple
from datetime import datetime
from enum import Enum


class GridParams(BaseModel):
    width: float = Field(default=1000.0, ge=10.0, description="Domain width (m)")
    height: float = Field(default=1000.0, ge=10.0, description="Domain height (m)")
    element_size: float = Field(default=20.0, ge=1.0, description="Element size (m)")


class MaterialParams(BaseModel):
    vp: float = Field(default=3000.0, ge=100.0, description="P-wave velocity (m/s)")
    vs: float = Field(default=1732.0, ge=100.0, description="S-wave velocity (m/s)")
    density: float = Field(default=2700.0, ge=100.0, description="Density (kg/m^3)")


class SourceParams(BaseModel):
    x: float = Field(default=500.0, description="Source x coordinate (m)")
    y: float = Field(default=500.0, description="Source y coordinate (m)")
    frequency: float = Field(default=10.0, ge=0.1, description="Source frequency (Hz)")
    amplitude: float = Field(default=1.0, description="Source amplitude")
    source_type: str = Field(default="ricker", description="Source type")


class SolverParams(BaseModel):
    total_time: float = Field(default=1.0, ge=0.1, description="Total simulation time (s)")
    time_step: Optional[float] = Field(default=None, description="Time step (s). Auto-calculated if None")
    output_interval: int = Field(default=10, ge=1, description="Output every N steps")
    courant_number: float = Field(default=0.4, ge=0.01, le=1.0, description="Courant number for stability")


class SimulationCreate(BaseModel):
    name: str = Field(default="Default Simulation", description="Simulation name")
    grid_params: GridParams = Field(default_factory=GridParams)
    material_params: MaterialParams = Field(default_factory=MaterialParams)
    source_params: SourceParams = Field(default_factory=SourceParams)
    solver_params: SolverParams = Field(default_factory=SolverParams)


class SimulationResponse(BaseModel):
    id: int
    name: str
    status: str
    progress: float
    grid_params: Dict[str, Any]
    material_params: Dict[str, Any]
    source_params: Dict[str, Any]
    solver_params: Dict[str, Any]
    created_at: Optional[datetime]
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    error_message: Optional[str]

    class Config:
        from_attributes = True


class TaskStatusResponse(BaseModel):
    id: int
    name: str
    status: str
    progress: float
    created_at: Optional[datetime]
    started_at: Optional[datetime]
    completed_at: Optional[datetime]


class FaultType(str, Enum):
    NORMAL = "normal"
    REVERSE = "reverse"
    STRIKESLIP = "strike-slip"
    THRUST = "thrust"


class MaterialLayer(BaseModel):
    vp: float
    vs: float
    density: float
    y_min: float
    y_max: float
    x_min: float = 0.0
    x_max: float = float('inf')
    gradient: Optional[Dict[str, Any]] = None
    name: str = ""


class FaultZone(BaseModel):
    start: Tuple[float, float]
    end: Tuple[float, float]
    width: float
    material: MaterialParams
    fault_type: FaultType = FaultType.NORMAL
    displacement: float = 0.0
    name: str = ""


class GeologyModelParams(BaseModel):
    domain_width: float = 1000.0
    domain_height: float = 1000.0
    base_material: MaterialParams = Field(default_factory=MaterialParams)
    layers: List[MaterialLayer] = Field(default_factory=list)
    faults: List[FaultZone] = Field(default_factory=list)


class GeologyPreviewRequest(BaseModel):
    model_params: GeologyModelParams
    nx: int = 100
    ny: int = 100


class GeologyPreviewResponse(BaseModel):
    success: bool
    x: List[float]
    y: List[float]
    vp: List[List[float]]
    vs: List[List[float]]
    density: List[List[float]]
    layers: List[str]
    faults: List[str]


class SourceParameters(BaseModel):
    x: float
    y: float
    strike: float = 0.0
    dip: float = 90.0
    rake: float = 0.0
    moment: float = 1.0
    depth: float = 0.0


class InversionParams(BaseModel):
    max_iterations: int = 50
    learning_rate: float = 0.01
    tolerance: float = 1e-6
    f0: float = 10.0


class InversionRequest(BaseModel):
    mesh_params: GridParams
    material_params: MaterialParams
    receivers: List[Tuple[float, float]]
    observed_data_path: str = "synthetic"
    synthetic_source: Optional[SourceParameters] = None
    initial_source: SourceParameters
    inversion_params: InversionParams = Field(default_factory=InversionParams)
    total_time: float = 1.0


class InversionStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class InversionResultResponse(BaseModel):
    success: bool
    task_id: str
    status: InversionStatus
    iterations: int = 0
    final_misfit: Optional[float] = None
    misfit_history: List[float] = Field(default_factory=list)
    initial_source: Optional[SourceParameters] = None
    best_source: Optional[SourceParameters] = None
    converged: bool = False
    error_message: Optional[str] = None


class InversionProgressResponse(BaseModel):
    task_id: str
    status: InversionStatus
    progress: float
    current_iteration: int
    current_misfit: Optional[float] = None


class VideoFormat(str, Enum):
    MP4 = "mp4"
    WEBM = "webm"
    GIF = "gif"


class Colormap(str, Enum):
    VIRIDIS = "viridis"
    SEISMIC = "seismic"
    JET = "jet"
    HOT = "hot"
    COOL = "cool"


class AnimationRequest(BaseModel):
    width: int = 800
    height: int = 600
    fps: int = 24
    format: VideoFormat = VideoFormat.MP4
    colormap: Colormap = Colormap.VIRIDIS
    field_type: str = "magnitude"
    include_time_label: bool = True
    include_colorbar: bool = True
    quality: int = 85


class AnimationStatus(str, Enum):
    PENDING = "pending"
    GENERATING = "generating"
    RENDERING = "rendering"
    COMPLETED = "completed"
    FAILED = "failed"


class AnimationResponse(BaseModel):
    success: bool
    task_id: str
    status: AnimationStatus
    progress: float
    output_path: Optional[str] = None
    file_size_bytes: Optional[int] = None
    format: Optional[str] = None
    error_message: Optional[str] = None


class AnimationProgressResponse(BaseModel):
    task_id: str
    status: AnimationStatus
    progress: float
    message: Optional[str] = None
