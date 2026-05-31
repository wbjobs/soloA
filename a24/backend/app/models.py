from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Float, JSON, Boolean, Enum as SQLEnum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from .database import Base
import enum


class UserRole(str, enum.Enum):
    ADMIN = "admin"
    DOCTOR = "doctor"
    TECHNICIAN = "technician"


class AuditAction(str, enum.Enum):
    VIEW = "view"
    UPLOAD = "upload"
    DELETE = "delete"
    DOWNLOAD = "download"
    EDIT_REPORT = "edit_report"
    AI_DETECTION = "ai_detection"
    LOGIN = "login"
    LOGOUT = "logout"
    CREATE_ANNOTATION = "create_annotation"
    EDIT_ANNOTATION = "edit_annotation"
    DELETE_ANNOTATION = "delete_annotation"
    REVIEW_ANNOTATION = "review_annotation"


class AnnotationType(str, enum.Enum):
    NODULE = "nodule"
    LESION = "lesion"
    LYMPH_NODE = "lymph_node"
    CALCIFICATION = "calcification"
    TEXT = "text"
    ARROW = "arrow"
    CIRCLE = "circle"
    RECTANGLE = "rectangle"
    LINE = "line"
    ANGLE = "angle"


class ReviewStatus(str, enum.Enum):
    PENDING = "pending"
    AGREE = "agree"
    DISAGREE = "disagree"
    MODIFIED = "modified"


class TaskStatus(str, enum.Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True, nullable=False)
    email = Column(String(100), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(100), nullable=False)
    role = Column(SQLEnum(UserRole), default=UserRole.DOCTOR)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    audits = relationship("AuditLog", back_populates="user")
    reports = relationship("Report", back_populates="doctor")


class Patient(Base):
    __tablename__ = "patients"
    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(String(64), unique=True, index=True, nullable=False)
    name = Column(String(100), nullable=False)
    birth_date = Column(String(20))
    gender = Column(String(10))
    age = Column(Integer)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    studies = relationship("Study", back_populates="patient")


class Study(Base):
    __tablename__ = "studies"
    id = Column(Integer, primary_key=True, index=True)
    study_uid = Column(String(64), unique=True, index=True, nullable=False)
    patient_id = Column(Integer, ForeignKey("patients.id"))
    study_date = Column(String(20))
    study_time = Column(String(20))
    study_description = Column(String(255))
    modalities = Column(JSON)
    institution = Column(String(255))
    referring_physician = Column(String(100))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    patient = relationship("Patient", back_populates="studies")
    series = relationship("Series", back_populates="study")
    report = relationship("Report", back_populates="study", uselist=False)


class Series(Base):
    __tablename__ = "series"
    id = Column(Integer, primary_key=True, index=True)
    series_uid = Column(String(64), unique=True, index=True, nullable=False)
    study_id = Column(Integer, ForeignKey("studies.id"))
    series_number = Column(Integer)
    modality = Column(String(20))
    series_description = Column(String(255))
    body_part = Column(String(100))
    rows = Column(Integer)
    columns = Column(Integer)
    slice_thickness = Column(Float)
    slice_spacing = Column(Float)
    pixel_spacing = Column(JSON)
    image_orientation = Column(JSON)
    image_position = Column(JSON)
    window_center = Column(Float)
    window_width = Column(Float)
    instance_count = Column(Integer)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    study = relationship("Study", back_populates="series")
    instances = relationship("Instance", back_populates="series", cascade="all, delete-orphan")
    ai_detections = relationship("AIDetection", back_populates="series")


class Instance(Base):
    __tablename__ = "instances"
    id = Column(Integer, primary_key=True, index=True)
    instance_uid = Column(String(64), unique=True, index=True, nullable=False)
    series_id = Column(Integer, ForeignKey("series.id"))
    instance_number = Column(Integer)
    sop_class_uid = Column(String(64))
    minio_object_name = Column(String(512), nullable=False)
    image_position = Column(JSON)
    slice_location = Column(Float)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    series = relationship("Series", back_populates="instances")


class AIDetection(Base):
    __tablename__ = "ai_detections"
    id = Column(Integer, primary_key=True, index=True)
    series_id = Column(Integer, ForeignKey("series.id"))
    task_id = Column(String(64), unique=True, index=True)
    status = Column(SQLEnum(TaskStatus), default=TaskStatus.PENDING)
    results = Column(JSON)
    error_message = Column(Text)
    started_at = Column(DateTime(timezone=True))
    completed_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    series = relationship("Series", back_populates="ai_detections")


class Report(Base):
    __tablename__ = "reports"
    id = Column(Integer, primary_key=True, index=True)
    study_id = Column(Integer, ForeignKey("studies.id"), unique=True)
    doctor_id = Column(Integer, ForeignKey("users.id"))
    findings = Column(Text)
    impression = Column(Text)
    recommendations = Column(Text)
    follow_up = Column(String(255))
    is_final = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    study = relationship("Study", back_populates="report")
    doctor = relationship("User", back_populates="reports")


class AuditLog(Base):
    __tablename__ = "audit_logs"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    action = Column(SQLEnum(AuditAction), nullable=False)
    resource_type = Column(String(50))
    resource_id = Column(String(64))
    details = Column(JSON)
    ip_address = Column(String(45))
    user_agent = Column(String(512))
    timestamp = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="audits")


class Annotation(Base):
    __tablename__ = "annotations"
    id = Column(Integer, primary_key=True, index=True)
    series_id = Column(Integer, ForeignKey("series.id"))
    instance_id = Column(Integer, ForeignKey("instances.id"))
    created_by = Column(Integer, ForeignKey("users.id"))
    annotation_type = Column(SQLEnum(AnnotationType), nullable=False)
    coordinates = Column(JSON, nullable=False)
    description = Column(Text)
    pathology = Column(String(255))
    confidence = Column(Float)
    is_draft = Column(Boolean, default=True)
    parent_id = Column(Integer, ForeignKey("annotations.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    series = relationship("Series")
    instance = relationship("Instance")
    creator = relationship("User")
    parent = relationship("Annotation", remote_side=[id], backref="children")
    reviews = relationship("AnnotationReview", back_populates="annotation", cascade="all, delete-orphan")


class AnnotationReview(Base):
    __tablename__ = "annotation_reviews"
    id = Column(Integer, primary_key=True, index=True)
    annotation_id = Column(Integer, ForeignKey("annotations.id"))
    reviewed_by = Column(Integer, ForeignKey("users.id"))
    status = Column(SQLEnum(ReviewStatus), default=ReviewStatus.PENDING)
    comment = Column(Text)
    modified_coordinates = Column(JSON)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    annotation = relationship("Annotation", back_populates="reviews")
    reviewer = relationship("User")


class ReportTemplate(Base):
    __tablename__ = "report_templates"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    category = Column(String(100))
    modality = Column(String(20))
    body_part = Column(String(100))
    findings_template = Column(Text)
    impression_template = Column(Text)
    recommendations_template = Column(Text)
    is_default = Column(Boolean, default=False)
    is_public = Column(Boolean, default=True)
    created_by = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    creator = relationship("User")
