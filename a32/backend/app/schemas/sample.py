from datetime import datetime
from typing import Optional, Dict, Any
from pydantic import BaseModel, Field


class SampleBase(BaseModel):
    sample_id: str
    name: str
    description: Optional[str] = None
    reference_genome: str = "hg38"
    metadata: Dict[str, Any] = {}


class SampleCreate(SampleBase):
    pass


class SampleUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    reference_genome: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


class SampleResponse(SampleBase):
    id: int
    bam_object_name: Optional[str] = None
    bai_object_name: Optional[str] = None
    bam_file_size: Optional[int] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class SampleListResponse(BaseModel):
    items: list[SampleResponse]
    total: int
    page: int
    page_size: int
