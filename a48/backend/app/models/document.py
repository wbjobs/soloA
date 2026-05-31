from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, JSON, Boolean, Float
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from ..database import Base


class Document(Base):
    __tablename__ = "documents"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(500), nullable=False)
    author = Column(String(200))
    dynasty = Column(String(100))
    description = Column(Text)
    original_image_path = Column(String(500))
    processed_image_path = Column(String(500))
    inpainted_image_path = Column(String(500))
    status = Column(String(50), default="uploaded")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    ocr_results = relationship("OCRResult", back_populates="document", cascade="all, delete-orphan")
    layout_analysis = relationship("LayoutAnalysis", back_populates="document", cascade="all, delete-orphan")
    entities = relationship("Entity", back_populates="document", cascade="all, delete-orphan")
    relations = relationship("EntityRelation", back_populates="document", cascade="all, delete-orphan")
    annotations = relationship("Annotation", back_populates="document", cascade="all, delete-orphan")


class LayoutAnalysis(Base):
    __tablename__ = "layout_analysis"

    id = Column(Integer, primary_key=True, index=True)
    document_id = Column(Integer, ForeignKey("documents.id"), nullable=False)
    region_type = Column(String(50), nullable=False)
    x = Column(Integer, nullable=False)
    y = Column(Integer, nullable=False)
    width = Column(Integer, nullable=False)
    height = Column(Integer, nullable=False)
    confidence = Column(Float)
    is_vertical = Column(Boolean, default=False)
    metadata = Column(JSON)

    document = relationship("Document", back_populates="layout_analysis")


class OCRResult(Base):
    __tablename__ = "ocr_results"

    id = Column(Integer, primary_key=True, index=True)
    document_id = Column(Integer, ForeignKey("documents.id"), nullable=False)
    layout_region_id = Column(Integer, ForeignKey("layout_analysis.id"))
    text = Column(Text, nullable=False)
    confidence = Column(Float)
    is_vertical = Column(Boolean, default=False)
    is_corrected = Column(Boolean, default=False)
    corrected_text = Column(Text)
    metadata = Column(JSON)

    document = relationship("Document", back_populates="ocr_results")


class Entity(Base):
    __tablename__ = "entities"

    id = Column(Integer, primary_key=True, index=True)
    document_id = Column(Integer, ForeignKey("documents.id"), nullable=False)
    entity_type = Column(String(50), nullable=False)
    entity_text = Column(String(500), nullable=False)
    start_index = Column(Integer)
    end_index = Column(Integer)
    confidence = Column(Float)
    metadata = Column(JSON)

    document = relationship("Document", back_populates="entities")


class EntityRelation(Base):
    __tablename__ = "entity_relations"

    id = Column(Integer, primary_key=True, index=True)
    document_id = Column(Integer, ForeignKey("documents.id"), nullable=False)
    source_entity_id = Column(Integer, ForeignKey("entities.id"), nullable=False)
    target_entity_id = Column(Integer, ForeignKey("entities.id"), nullable=False)
    relation_type = Column(String(100), nullable=False)
    confidence = Column(Float)
    evidence_text = Column(Text)

    document = relationship("Document", back_populates="relations")


class Annotation(Base):
    __tablename__ = "annotations"

    id = Column(Integer, primary_key=True, index=True)
    document_id = Column(Integer, ForeignKey("documents.id"), nullable=False)
    annotation_type = Column(String(50), nullable=False)
    text = Column(Text, nullable=False)
    x = Column(Integer, nullable=False)
    y = Column(Integer, nullable=False)
    width = Column(Integer, nullable=False)
    height = Column(Integer, nullable=False)
    linked_text_region_id = Column(Integer, ForeignKey("ocr_results.id"))
    linked_layout_region_id = Column(Integer, ForeignKey("layout_analysis.id"))
    confidence = Column(Float, default=0.0)
    proximity_score = Column(Float)
    semantic_score = Column(Float)
    is_verified = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    metadata = Column(JSON)

    document = relationship("Document", back_populates="annotations")
    linked_ocr_result = relationship("OCRResult", foreign_keys=[linked_text_region_id])
    linked_layout = relationship("LayoutAnalysis", foreign_keys=[linked_layout_region_id])


class StyleTransferLog(Base):
    __tablename__ = "style_transfer_logs"

    id = Column(Integer, primary_key=True, index=True)
    document_id = Column(Integer, ForeignKey("documents.id"), nullable=False)
    ocr_result_id = Column(Integer, ForeignKey("ocr_results.id"))
    original_text = Column(Text, nullable=False)
    styled_text = Column(Text)
    style_name = Column(String(50), nullable=False)
    transfer_strength = Column(Float, default=0.7)
    image_path = Column(String(500))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    metadata = Column(JSON)

    document = relationship("Document")
