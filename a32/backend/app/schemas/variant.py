from datetime import datetime
from typing import Optional, Dict, Any
from pydantic import BaseModel

from ..models.variant import VariantType


class VariantBase(BaseModel):
    chromosome: str
    position: int
    ref_allele: str
    alt_allele: str
    variant_type: VariantType

    quality: Optional[float] = None
    filter_status: Optional[str] = None
    read_depth: Optional[int] = None
    alt_depth: Optional[int] = None
    allele_frequency: Optional[float] = None
    genotype: Optional[str] = None
    vcf_info: Dict[str, Any] = {}


class VariantResponse(VariantBase):
    id: int
    variant_id: str
    task_id: str
    created_at: datetime

    class Config:
        from_attributes = True


class VariantFilter(BaseModel):
    task_id: Optional[str] = None
    chromosome: Optional[str] = None
    min_quality: Optional[float] = None
    min_read_depth: Optional[int] = None
    min_allele_frequency: Optional[float] = None
    max_allele_frequency: Optional[float] = None
    variant_type: Optional[VariantType] = None


class VariantListResponse(BaseModel):
    items: list[VariantResponse]
    total: int
    page: int
    page_size: int
    filters: Dict[str, Any]
