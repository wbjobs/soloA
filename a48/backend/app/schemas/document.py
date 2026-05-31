from pydantic import BaseModel
from typing import Optional, List, Dict
from datetime import datetime


class DocumentBase(BaseModel):
    title: str
    author: Optional[str] = None
    dynasty: Optional[str] = None
    description: Optional[str] = None


class DocumentCreate(DocumentBase):
    pass


class DocumentUpdate(BaseModel):
    title: Optional[str] = None
    author: Optional[str] = None
    dynasty: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None


class LayoutAnalysisBase(BaseModel):
    region_type: str
    x: int
    y: int
    width: int
    height: int
    confidence: Optional[float] = None
    is_vertical: bool = False
    metadata: Optional[Dict] = None


class LayoutAnalysisResponse(LayoutAnalysisBase):
    id: int
    document_id: int

    class Config:
        from_attributes = True


class OCRResultBase(BaseModel):
    text: str
    confidence: Optional[float] = None
    is_vertical: bool = False
    is_corrected: bool = False
    corrected_text: Optional[str] = None
    metadata: Optional[Dict] = None


class OCRResultResponse(OCRResultBase):
    id: int
    document_id: int
    layout_region_id: Optional[int] = None

    class Config:
        from_attributes = True


class OCRUpdate(BaseModel):
    corrected_text: Optional[str] = None
    is_corrected: Optional[bool] = None


class EntityBase(BaseModel):
    entity_type: str
    entity_text: str
    start_index: Optional[int] = None
    end_index: Optional[int] = None
    confidence: Optional[float] = None
    metadata: Optional[Dict] = None


class EntityResponse(EntityBase):
    id: int
    document_id: int

    class Config:
        from_attributes = True


class EntityRelationBase(BaseModel):
    source_entity_id: int
    target_entity_id: int
    relation_type: str
    confidence: Optional[float] = None
    evidence_text: Optional[str] = None


class EntityRelationResponse(EntityRelationBase):
    id: int
    document_id: int

    class Config:
        from_attributes = True


class DocumentResponse(DocumentBase):
    id: int
    original_image_path: Optional[str] = None
    processed_image_path: Optional[str] = None
    inpainted_image_path: Optional[str] = None
    status: str
    created_at: datetime
    updated_at: Optional[datetime] = None
    layout_analysis: List[LayoutAnalysisResponse] = []
    ocr_results: List[OCRResultResponse] = []
    entities: List[EntityResponse] = []
    relations: List[EntityRelationResponse] = []

    class Config:
        from_attributes = True


class ProcessingStatus(BaseModel):
    document_id: int
    status: str
    step: Optional[str] = None
    progress: Optional[float] = None
    message: Optional[str] = None


class PipelineResult(BaseModel):
    document_id: int
    status: str
    layout_regions: int = 0
    ocr_results: int = 0
    entities: int = 0
    relations: int = 0
    message: Optional[str] = None


class AnnotationBase(BaseModel):
    annotation_type: str
    text: str
    x: int
    y: int
    width: int
    height: int
    linked_text_region_id: Optional[int] = None
    linked_layout_region_id: Optional[int] = None
    confidence: Optional[float] = 0.0
    proximity_score: Optional[float] = None
    semantic_score: Optional[float] = None
    is_verified: bool = False
    metadata: Optional[Dict] = None


class AnnotationCreate(AnnotationBase):
    pass


class AnnotationUpdate(BaseModel):
    text: Optional[str] = None
    annotation_type: Optional[str] = None
    linked_text_region_id: Optional[int] = None
    linked_layout_region_id: Optional[int] = None
    is_verified: Optional[bool] = None
    confidence: Optional[float] = None
    metadata: Optional[Dict] = None


class AnnotationResponse(AnnotationBase):
    id: int
    document_id: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class StyleTransferRequest(BaseModel):
    text: str
    style_name: str = "kaishu"
    strength: float = 0.7
    font_size: int = 48
    generate_image: bool = True


class StyleTransferResponse(BaseModel):
    original_text: str
    styled_text: str
    style_name: str
    transfer_strength: float
    has_image: bool = False
    metadata: Optional[Dict] = None


class StyleInfo(BaseModel):
    key: str
    name: str
    description: str


class StyleDetectionRequest(BaseModel):
    document_id: Optional[int] = None
    ocr_result_id: Optional[int] = None


class AnnotationDetectionRequest(BaseModel):
    document_id: int
    auto_link: bool = True


class AnnotationLinkResult(BaseModel):
    annotation_id: int
    linked_text_region_id: Optional[int] = None
    confidence: float
    proximity_score: Optional[float] = None
    semantic_score: Optional[float] = None


class AnnotationAnalysisResult(BaseModel):
    total_annotations: int
    linked_annotations: int
    link_rate: float
    type_distribution: Dict[str, int]
    average_confidence: float
    high_confidence_count: int


class DocumentResponseWithAnnotations(DocumentResponse):
    annotations: List[AnnotationResponse] = []

    class Config:
        from_attributes = True
