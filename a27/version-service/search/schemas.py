from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any

class SearchRequest(BaseModel):
    query: str = Field(..., description="Search query string")
    owner_id: Optional[str] = Field(None, description="Filter by document owner")
    limit: int = Field(20, ge=1, le=100, description="Max results to return")
    offset: int = Field(0, ge=0, description="Offset for pagination")

class IndexDocumentRequest(BaseModel):
    document_id: str = Field(..., description="Document unique ID")
    title: str = Field(..., description="Document title")
    owner_id: str = Field(..., description="Document owner ID")
    content: str = Field(..., description="Document content for indexing")
    version: int = Field(1, ge=1, description="Document version number")
    content_type: str = Field("text/plain", description="Content MIME type")
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Additional metadata")

class SearchHit(BaseModel):
    document_id: str
    title: str
    owner_id: str
    version: int
    score: float
    highlight: Dict[str, Any] = Field(default_factory=dict)

class SearchResponse(BaseModel):
    total: int
    hits: List[SearchHit]
    took: int

class IndexResponse(BaseModel):
    success: bool
    document_id: str

class BulkIndexRequest(BaseModel):
    documents: List[IndexDocumentRequest]

class BulkIndexResponse(BaseModel):
    indexed: int
    success: bool

class SearchStatsResponse(BaseModel):
    mode: str
    total_docs: int

class DeleteIndexResponse(BaseModel):
    success: bool
    document_id: str
