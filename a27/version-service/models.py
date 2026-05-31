import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, ForeignKey, Integer, Text, Index
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from database import Base

class DocumentSnapshot(Base):
    __tablename__ = "document_snapshots"
    
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    document_id = Column(String(36), nullable=False, index=True)
    version = Column(Integer, nullable=False, index=True)
    minio_object_id = Column(String(255), nullable=False)
    minio_bucket = Column(String(255), nullable=False)
    author_ids = Column(Text, default="")
    operation_count = Column(Integer, default=0)
    content_size = Column(Integer, default=0)
    metadata_ = Column(JSONB, default=dict)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    
    __table_args__ = (
        Index("idx_snapshot_doc_version", "document_id", "version", unique=True),
    )

class VersionOperation(Base):
    __tablename__ = "version_operations"
    
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    snapshot_id = Column(String(36), ForeignKey("document_snapshots.id", ondelete="CASCADE"), nullable=False, index=True)
    operation_type = Column(String(20), nullable=False)
    position = Column(Integer)
    content = Column(Text)
    author_id = Column(String(36), index=True)
    timestamp = Column(DateTime, default=datetime.utcnow)
    
    snapshot = relationship("DocumentSnapshot")
