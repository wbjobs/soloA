from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any

class Tile(BaseModel):
    x: int
    y: int
    layer: str = Field(..., description="图层名称: background, collision, light")
    tileId: Optional[int] = None
    properties: Optional[Dict[str, Any]] = None

class LightSource(BaseModel):
    x: float
    y: float
    intensity: float = Field(default=1.0)
    color: str = Field(default="#ffffff")
    radius: float = Field(default=5.0)

class MapData(BaseModel):
    width: int = Field(..., gt=0, description="地图宽度（瓦片数）")
    height: int = Field(..., gt=0, description="地图高度（瓦片数）")
    tileSize: int = Field(default=32, gt=0, description="瓦片大小（像素）")
    layers: List[str] = Field(default=["background", "collision", "light"])
    tiles: List[Tile] = Field(default_factory=list)
    lightSources: List[LightSource] = Field(default_factory=list)
    tileset: Optional[str] = None

class BakeRequest(BaseModel):
    mapData: MapData
    ambientLight: float = Field(default=0.2, ge=0, le=1)

class TaskStatus(BaseModel):
    task_id: str
    status: str
    progress: float = Field(default=0.0)
    result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None

class TilesetSliceRequest(BaseModel):
    tileWidth: int = Field(default=32, gt=0, le=256)
    tileHeight: int = Field(default=32, gt=0, le=256)
    margin: int = Field(default=0, ge=0)
    spacing: int = Field(default=0, ge=0)
    removeEmpty: bool = Field(default=True)

class BatchBakeItem(BaseModel):
    name: str
    mapData: MapData

class BatchBakeRequest(BaseModel):
    maps: List[BatchBakeItem]
    ambientLight: float = Field(default=0.2, ge=0, le=1)

class BatchTaskProgress(BaseModel):
    total: int
    completed: int
    currentIndex: Optional[int] = None
    currentName: Optional[str] = None
    currentProgress: float = Field(default=0.0)
    results: List[Dict[str, Any]] = Field(default_factory=list)
    errors: List[Dict[str, Any]] = Field(default_factory=list)
