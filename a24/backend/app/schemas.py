from pydantic import BaseModel, EmailStr
from typing import Optional, List, Dict, Any
from datetime import datetime
from .models import UserRole, TaskStatus, AuditAction


class UserBase(BaseModel):
    username: str
    email: EmailStr
    full_name: str
    role: UserRole = UserRole.DOCTOR


class UserCreate(UserBase):
    password: str


class UserResponse(UserBase):
    id: int
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


class UserLogin(BaseModel):
    username: str
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str
    user: UserResponse


class PatientBase(BaseModel):
    patient_id: str
    name: str
    birth_date: Optional[str] = None
    gender: Optional[str] = None
    age: Optional[int] = None


class PatientResponse(PatientBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


class StudyBase(BaseModel):
    study_uid: str
    study_date: Optional[str] = None
    study_time: Optional[str] = None
    study_description: Optional[str] = None
    modalities: Optional[List[str]] = []
    institution: Optional[str] = None
    referring_physician: Optional[str] = None


class StudyResponse(StudyBase):
    id: int
    patient_id: int
    created_at: datetime

    class Config:
        from_attributes = True


class SeriesBase(BaseModel):
    series_uid: str
    series_number: Optional[int] = None
    modality: Optional[str] = None
    series_description: Optional[str] = None
    body_part: Optional[str] = None
    rows: Optional[int] = None
    columns: Optional[int] = None
    slice_thickness: Optional[float] = None
    slice_spacing: Optional[float] = None
    pixel_spacing: Optional[List[float]] = None
    image_orientation: Optional[List[float]] = None
    image_position: Optional[List[float]] = None
    window_center: Optional[float] = None
    window_width: Optional[float] = None
    instance_count: Optional[int] = None


class SeriesResponse(SeriesBase):
    id: int
    study_id: int
    created_at: datetime

    class Config:
        from_attributes = True


class InstanceBase(BaseModel):
    instance_uid: str
    instance_number: Optional[int] = None
    sop_class_uid: Optional[str] = None
    slice_location: Optional[float] = None
    image_position: Optional[List[float]] = None


class InstanceResponse(InstanceBase):
    id: int
    series_id: int
    created_at: datetime

    class Config:
        from_attributes = True


class UploadResponse(BaseModel):
    task_id: str
    status: str
    message: str


class TaskStatusResponse(BaseModel):
    task_id: str
    status: TaskStatus
    results: Optional[Dict[str, Any]] = None
    error_message: Optional[str] = None
    created_at: datetime
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None


class AIDetectionRequest(BaseModel):
    series_id: int


class ReportBase(BaseModel):
    findings: Optional[str] = None
    impression: Optional[str] = None
    recommendations: Optional[str] = None
    follow_up: Optional[str] = None
    is_final: bool = False


class ReportResponse(ReportBase):
    id: int
    study_id: int
    doctor_id: Optional[int] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class AuditLogResponse(BaseModel):
    id: int
    user_id: Optional[int] = None
    action: AuditAction
    resource_type: Optional[str] = None
    resource_id: Optional[str] = None
    details: Optional[Dict[str, Any]] = None
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    timestamp: datetime

    class Config:
        from_attributes = True


class PatientWithStudies(PatientResponse):
    studies: List[StudyResponse] = []


class StudyWithSeries(StudyResponse):
    series: List[SeriesResponse] = []


class PaginatedInstanceResponse(BaseModel):
    total: int
    skip: int
    limit: int
    data: List[InstanceResponse]


class SeriesWithInstances(SeriesResponse):
    instances: List[InstanceResponse] = []
    ai_detections: List[TaskStatusResponse] = []


from .models import AnnotationType, ReviewStatus


class AnnotationBase(BaseModel):
    series_id: int
    instance_id: int
    annotation_type: AnnotationType
    coordinates: Dict[str, Any]
    description: Optional[str] = None
    pathology: Optional[str] = None
    confidence: Optional[float] = None
    is_draft: bool = True


class AnnotationCreate(AnnotationBase):
    parent_id: Optional[int] = None


class AnnotationUpdate(BaseModel):
    coordinates: Optional[Dict[str, Any]] = None
    description: Optional[str] = None
    pathology: Optional[str] = None
    confidence: Optional[float] = None
    is_draft: Optional[bool] = None


class AnnotationResponse(AnnotationBase):
    id: int
    created_by: int
    parent_id: Optional[int] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class AnnotationReviewBase(BaseModel):
    annotation_id: int
    status: ReviewStatus
    comment: Optional[str] = None
    modified_coordinates: Optional[Dict[str, Any]] = None


class AnnotationReviewCreate(AnnotationReviewBase):
    pass


class AnnotationReviewResponse(AnnotationReviewBase):
    id: int
    reviewed_by: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ReportTemplateBase(BaseModel):
    name: str
    category: Optional[str] = None
    modality: Optional[str] = None
    body_part: Optional[str] = None
    findings_template: Optional[str] = None
    impression_template: Optional[str] = None
    recommendations_template: Optional[str] = None
    is_default: bool = False
    is_public: bool = True


class ReportTemplateCreate(ReportTemplateBase):
    pass


class ReportTemplateUpdate(BaseModel):
    name: Optional[str] = None
    findings_template: Optional[str] = None
    impression_template: Optional[str] = None
    recommendations_template: Optional[str] = None
    is_default: Optional[bool] = None


class ReportTemplateResponse(ReportTemplateBase):
    id: int
    created_by: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class MIPRequest(BaseModel):
    series_id: int
    axis: int = 0
    projection_type: str = "mip"
    window_center: Optional[float] = None
    window_width: Optional[float] = None
    slice_start: Optional[int] = None
    slice_end: Optional[int] = None
