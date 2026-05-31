from pydantic import BaseModel, Field
from typing import Optional, Dict, List
from datetime import datetime

class DocumentCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    content_type: str = "text/plain"
    metadata: Optional[Dict[str, str]] = None

class DocumentUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=255)
    metadata: Optional[Dict[str, str]] = None

class DocumentResponse(BaseModel):
    document_id: str
    title: str
    owner_id: str
    content_type: str
    metadata: Dict[str, str] = {}
    current_version: int
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True

class DocumentListResponse(BaseModel):
    documents: List[DocumentResponse]
    total: int
    page: int
    page_size: int

class PermissionGrant(BaseModel):
    user_id: str
    role: str = Field(..., pattern="^(owner|editor|viewer)$")

class PermissionResponse(BaseModel):
    user_id: str
    document_id: str
    role: str
    granted_at: datetime

class DeleteResponse(BaseModel):
    success: bool
