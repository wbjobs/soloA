import uuid
import json
from datetime import datetime
from sqlalchemy import Column, String, DateTime, ForeignKey, Integer, Index, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from database import Base

class Document(Base):
    __tablename__ = "documents"
    
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    title = Column(String(255), nullable=False, index=True)
    owner_id = Column(String(36), nullable=False, index=True)
    content_type = Column(String(50), default="text/plain")
    metadata_ = Column(JSONB, default=dict)
    current_version = Column(Integer, default=1)
    is_deleted = Column(String(1), default="N")
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, index=True)
    
    permissions = relationship("DocumentPermission", back_populates="document", cascade="all, delete-orphan")
    
    __table_args__ = (
        Index("idx_document_owner", "owner_id"),
        Index("idx_document_active", "is_deleted"),
    )

class DocumentPermission(Base):
    __tablename__ = "document_permissions"
    
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    document_id = Column(String(36), ForeignKey("documents.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(String(36), nullable=False, index=True)
    role = Column(String(20), nullable=False)
    granted_by = Column(String(36))
    granted_at = Column(DateTime, default=datetime.utcnow)
    
    document = relationship("Document", back_populates="permissions")
    
    __table_args__ = (
        Index("idx_doc_perm_doc_user", "document_id", "user_id", unique=True),
    )
